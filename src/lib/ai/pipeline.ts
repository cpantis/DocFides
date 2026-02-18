/**
 * AI Pipeline Orchestrator — 3-stage pipeline.
 *
 * Stage 1: parser         — Parse documents (OCR, text extraction, table detection)
 * Stage 2: extract_analyze — Extract data + analyze style + map to template fields
 * Stage 3: write_verify    — Generate text + verify quality
 *
 * Each stage output is persisted to MongoDB so stages can be re-run independently.
 */

import { PIPELINE_STAGES_ORDER, type PipelineStage } from '@/types/pipeline';
import { runExtractAnalyzeAgent } from './extract-analyze-agent';
import { runWriteVerifyAgent } from './write-verify-agent';
import type { AgentResult } from './client';

export interface PipelineContext {
  projectId: string;
  userId: string;
  hasModelDocument: boolean;
  /** Agent 1 output: extracted data, style guide, field map */
  projectData?: Record<string, unknown>;
  modelMap?: Record<string, unknown>;
  templateSchema?: Record<string, unknown>;
  draftPlan?: Record<string, unknown>;
  /** Agent 2 output: field completions + quality report */
  fieldCompletions?: Record<string, unknown>;
  qualityReport?: Record<string, unknown>;
}

export interface StageResult {
  stage: PipelineStage;
  output: Record<string, unknown>;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
  };
  durationMs: number;
}

/**
 * Run the AI pipeline for a project.
 * If `singleStage` is provided, runs only that stage.
 * Otherwise runs all 3 stages in order.
 */
export async function runPipeline(
  projectId: string,
  singleStage?: PipelineStage
): Promise<StageResult[]> {
  const context = await buildContextFromProject(projectId);

  const stages = singleStage
    ? [singleStage]
    : PIPELINE_STAGES_ORDER;

  const results: StageResult[] = [];

  for (const stage of stages) {
    const startTime = Date.now();
    console.log(`[Pipeline] Running stage: ${stage}`);

    try {
      const result = await runStage(stage, context);
      const stageResult: StageResult = {
        stage,
        output: result.output,
        tokenUsage: result.tokenUsage,
        durationMs: Date.now() - startTime,
      };
      results.push(stageResult);

      // Update context for downstream stages
      switch (stage) {
        case 'parser':
          // Parser doesn't produce AI context — it creates Extraction records
          break;
        case 'extract_analyze': {
          // Agent 1 outputs a combined JSON — split into legacy fields for compatibility
          const output = result.output;
          context.projectData = output.project_data as Record<string, unknown>;
          context.modelMap = output.style_guide as Record<string, unknown>;
          context.templateSchema = output.field_map as Record<string, unknown>;
          context.draftPlan = output.field_map as Record<string, unknown>;
          break;
        }
        case 'write_verify': {
          // Agent 2 outputs field completions + quality report combined
          const output = result.output;
          context.fieldCompletions = {
            fields: output.fields,
            qualityScores: output.quality_scores,
          };
          context.qualityReport = {
            global_score: output.global_score,
            errors: output.errors,
            warnings: output.warnings,
            data_leakage_check: output.data_leakage_check,
          };
          break;
        }
      }

      // Persist stage output to project in MongoDB
      await saveStageOutput(projectId, stage, result.output);
    } catch (error) {
      console.error(`[Pipeline] Stage ${stage} failed:`, error);
      throw error;
    }
  }

  return results;
}

async function buildContextFromProject(projectId: string): Promise<PipelineContext> {
  const { connectToDatabase, Project, DocumentModel } = await import('@/lib/db');
  await connectToDatabase();

  const project = await Project.findById(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const modelDocs = await DocumentModel.countDocuments({
    projectId,
    role: 'model',
    status: { $ne: 'deleted' },
  });

  return {
    projectId,
    userId: project.userId,
    hasModelDocument: modelDocs > 0,
    projectData: project.projectData as Record<string, unknown> | undefined,
    modelMap: project.modelMap as Record<string, unknown> | undefined,
    templateSchema: project.templateSchema as Record<string, unknown> | undefined,
    draftPlan: project.draftPlan as Record<string, unknown> | undefined,
    fieldCompletions: project.fieldCompletions as Record<string, unknown> | undefined,
    qualityReport: project.qualityReport as Record<string, unknown> | undefined,
  };
}

/**
 * Persist stage output to the Project document in MongoDB.
 * Maps new 3-stage outputs to existing project fields for backward compatibility.
 */
async function saveStageOutput(
  projectId: string,
  stage: PipelineStage,
  output: Record<string, unknown>
): Promise<void> {
  const { connectToDatabase, Project } = await import('@/lib/db');
  await connectToDatabase();

  const update: Record<string, unknown> = {};

  switch (stage) {
    case 'parser':
      // Parser creates Extraction records — no project-level field
      break;
    case 'extract_analyze':
      // Split Agent 1 output into legacy project fields
      update['projectData'] = output.project_data;
      update['modelMap'] = output.style_guide;
      update['templateSchema'] = output.field_map;
      update['draftPlan'] = output.field_map;
      break;
    case 'write_verify':
      // Split Agent 2 output into legacy project fields
      update['fieldCompletions'] = {
        fields: output.fields,
        qualityScores: output.quality_scores,
      };
      update['qualityReport'] = {
        global_score: output.global_score,
        errors: output.errors,
        warnings: output.warnings,
        data_leakage_check: output.data_leakage_check,
      };
      break;
  }

  if (Object.keys(update).length > 0) {
    await Project.findByIdAndUpdate(projectId, { $set: update });
  }
}

/**
 * Fetch raw text from Extraction collection for a set of documents.
 */
async function getDocumentTexts(
  projectId: string,
  role: 'source' | 'template' | 'model'
): Promise<{ filename: string; content: string; tagId?: string; tagName?: string }[]> {
  const { connectToDatabase, DocumentModel, Extraction, Tag } = await import('@/lib/db');
  await connectToDatabase();

  const docs = await DocumentModel.find({
    projectId,
    role,
    status: 'extracted',
  }).lean();

  // Resolve tag names for documents that have tags
  const tagIds = [...new Set(docs.map((d) => d.tagId).filter(Boolean))] as string[];
  const tagMap = new Map<string, string>();
  if (tagIds.length > 0) {
    const tags = await Tag.find({ _id: { $in: tagIds } }).lean();
    for (const tag of tags) {
      tagMap.set(String(tag._id), tag.name);
    }
  }

  const results: { filename: string; content: string; tagId?: string; tagName?: string }[] = [];

  for (const doc of docs) {
    const extraction = await Extraction.findOne({
      documentId: String(doc._id),
    }).lean();

    const tagId = doc.tagId as string | undefined;
    const tagName = tagId ? tagMap.get(tagId) : undefined;

    if (extraction?.rawText) {
      results.push({
        filename: doc.originalFilename,
        content: extraction.rawText,
        tagId,
        tagName,
      });
    } else if (extraction?.blocks && extraction.blocks.length > 0) {
      const text = extraction.blocks
        .map((b) => (b as Record<string, unknown>).text ?? '')
        .filter(Boolean)
        .join('\n\n');
      if (text) {
        results.push({
          filename: doc.originalFilename,
          content: text,
          tagId,
          tagName,
        });
      }
    }
  }

  return results;
}

/**
 * Run the Parser stage — parse all unparsed documents.
 */
async function runParserStage(projectId: string): Promise<AgentResult> {
  const { connectToDatabase, DocumentModel, Extraction } = await import('@/lib/db');
  await connectToDatabase();

  const docs = await DocumentModel.find({
    projectId,
    status: { $in: ['uploaded', 'processing', 'failed'] },
  });

  if (docs.length === 0) {
    const extractedDocs = await DocumentModel.find({ projectId, status: 'extracted' });
    return {
      output: {
        parsed: extractedDocs.length,
        skipped: 0,
        failed: 0,
        documents: extractedDocs.map((d) => ({
          filename: d.originalFilename,
          role: d.role,
          status: 'already_extracted',
        })),
      },
      tokenUsage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  const totalInputTokens = 0;
  const totalOutputTokens = 0;
  const results: Array<{ filename: string; role: string; status: string; chars?: number }> = [];

  for (const doc of docs) {
    const docId = String(doc._id);
    console.log(`[ParserAgent] Parsing ${doc.originalFilename} (${doc.role}, ${doc.mimeType})...`);

    try {
      const cachedExtraction = await Extraction.findOne({ sha256: doc.sha256 });
      if (cachedExtraction) {
        console.log(`[ParserAgent] Cache hit for ${doc.originalFilename}`);
        const existing = await Extraction.findOne({ documentId: docId });
        if (!existing) {
          await Extraction.create({
            documentId: docId,
            sha256: doc.sha256,
            projectId,
            blocks: cachedExtraction.blocks,
            rawText: cachedExtraction.rawText,
            tables: cachedExtraction.tables,
            overallConfidence: cachedExtraction.overallConfidence,
            language: cachedExtraction.language,
            processingTimeMs: 0,
          });
        }
        await DocumentModel.findByIdAndUpdate(docId, { status: 'extracted' });
        results.push({
          filename: doc.originalFilename,
          role: doc.role,
          status: 'cached',
          chars: (cachedExtraction.rawText ?? '').length,
        });
        continue;
      }

      await DocumentModel.findByIdAndUpdate(docId, { status: 'processing' });
      const { readDocumentFileWithFallback } = await import('@/lib/storage/tmp-storage');
      const fileBuffer = await readDocumentFileWithFallback(doc.storageKey, docId);

      const { parseDocument } = await import('@/lib/parsing/parse-pipeline');
      const { calculateOverallConfidence } = await import('@/lib/parsing/confidence');

      const parseResult = await parseDocument(fileBuffer, doc.originalFilename, doc.mimeType);

      type BlockForConfidence = Parameters<typeof calculateOverallConfidence>[0][number];
      const blocksForConfidence = parseResult.blocks as BlockForConfidence[];
      const overall = calculateOverallConfidence(blocksForConfidence);

      await Extraction.create({
        documentId: docId,
        sha256: doc.sha256,
        projectId,
        blocks: parseResult.blocks,
        rawText: parseResult.rawText,
        tables: parseResult.tables,
        overallConfidence: overall.score,
        language: parseResult.language,
        processingTimeMs: parseResult.processingTimeMs,
      });

      await DocumentModel.findByIdAndUpdate(docId, {
        status: 'extracted',
        extractionBlocks: parseResult.blocks,
        pageCount: parseResult.pageCount,
        parsingErrors: overall.warnings.length > 0 ? overall.warnings : undefined,
      });

      console.log(
        `[ParserAgent] Extracted ${doc.originalFilename}: ${parseResult.rawText.length} chars, ` +
        `${parseResult.tables.length} tables, ${overall.score}% confidence`
      );

      results.push({
        filename: doc.originalFilename,
        role: doc.role,
        status: 'extracted',
        chars: parseResult.rawText.length,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[ParserAgent] Failed to parse ${doc.originalFilename}:`, errMsg);

      await DocumentModel.findByIdAndUpdate(docId, {
        status: 'failed',
        parsingErrors: [errMsg],
      });

      results.push({
        filename: doc.originalFilename,
        role: doc.role,
        status: 'failed',
      });
    }
  }

  const parsed = results.filter((r) => r.status === 'extracted' || r.status === 'cached').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  const extractedSources = await DocumentModel.countDocuments({
    projectId,
    role: 'source',
    status: 'extracted',
  });

  if (extractedSources === 0) {
    throw new Error(
      `Parser agent could not extract any source documents (${failed} failed). ` +
      `The pipeline cannot proceed without at least one readable source document.`
    );
  }

  return {
    output: {
      parsed,
      failed,
      skipped: 0,
      documents: results,
    },
    tokenUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
  };
}

/**
 * Run a single pipeline stage.
 */
async function runStage(
  stage: PipelineStage,
  context: PipelineContext
): Promise<AgentResult> {
  switch (stage) {
    case 'parser':
      return runParserStage(context.projectId);

    case 'extract_analyze': {
      const sourceDocs = await getDocumentTexts(context.projectId, 'source');
      if (sourceDocs.length === 0) {
        throw new Error('No extracted source documents found for extract_analyze stage');
      }

      const modelDocs = context.hasModelDocument
        ? await getDocumentTexts(context.projectId, 'model')
        : [];

      const templateDocs = await getDocumentTexts(context.projectId, 'template');
      const templateDoc = templateDocs[0];
      if (!templateDoc) {
        throw new Error('No extracted template document found for extract_analyze stage');
      }

      return runExtractAnalyzeAgent({
        sourceDocs: sourceDocs.map((d) => ({
          filename: d.filename,
          content: d.content,
          tag: d.tagName,
        })),
        modelDocs: modelDocs.length > 0
          ? modelDocs.map((d) => ({ filename: d.filename, content: d.content }))
          : undefined,
        templateDoc: {
          filename: templateDoc.filename,
          content: templateDoc.content,
        },
      });
    }

    case 'write_verify': {
      if (!context.projectData) {
        throw new Error('Missing projectData for write_verify stage — run extract_analyze first');
      }
      if (!context.draftPlan) {
        throw new Error('Missing field map for write_verify stage — run extract_analyze first');
      }
      return runWriteVerifyAgent({
        projectData: context.projectData,
        styleGuide: context.modelMap ?? {},
        fieldMap: context.draftPlan,
      });
    }

    default:
      throw new Error(`Unknown pipeline stage: ${stage}`);
  }
}
