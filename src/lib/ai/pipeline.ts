import { PIPELINE_STAGES_ORDER, type PipelineStage } from '@/types/pipeline';
import { runExtractorAgent } from './extractor-agent';
import { runModelAgent } from './model-agent';
import { runTemplateAgent } from './template-agent';
import { runMappingAgent } from './mapping-agent';
import { runWritingAgent } from './writing-agent';
import { runVerificationAgent } from './verification-agent';
import type { AgentResult } from './client';

export interface PipelineContext {
  projectId: string;
  userId: string;
  hasModelDocument: boolean;
  projectData?: Record<string, unknown>;
  modelMap?: Record<string, unknown>;
  templateSchema?: Record<string, unknown>;
  draftPlan?: Record<string, unknown>;
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
 * Otherwise runs all stages in order.
 */
export async function runPipeline(
  projectId: string,
  singleStage?: PipelineStage
): Promise<StageResult[]> {
  const context = await buildContextFromProject(projectId);

  const stages = singleStage
    ? [singleStage]
    : PIPELINE_STAGES_ORDER.filter(
        (stage) => stage !== 'model' || context.hasModelDocument
      );

  const results: StageResult[] = [];

  for (const stage of stages) {
    if (stage === 'model' && !context.hasModelDocument) {
      console.log(`[Pipeline] Skipping model stage — no model document`);
      continue;
    }

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

      // Update context for downstream agents
      switch (stage) {
        case 'extractor':
          context.projectData = result.output;
          break;
        case 'model':
          context.modelMap = result.output;
          break;
        case 'template':
          context.templateSchema = result.output;
          break;
        case 'mapping':
          context.draftPlan = result.output;
          break;
        case 'writing':
          context.fieldCompletions = result.output;
          break;
        case 'verification':
          context.qualityReport = result.output;
          break;
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

async function saveStageOutput(
  projectId: string,
  stage: PipelineStage,
  output: Record<string, unknown>
): Promise<void> {
  const { connectToDatabase, Project } = await import('@/lib/db');
  await connectToDatabase();

  const update: Record<string, Record<string, unknown>> = {};
  switch (stage) {
    case 'parser':
      // Parser stage output is a summary — no project-level field to persist
      break;
    case 'extractor':
      update['projectData'] = output;
      break;
    case 'model':
      update['modelMap'] = output;
      break;
    case 'template':
      update['templateSchema'] = output;
      break;
    case 'mapping':
      update['draftPlan'] = output;
      break;
    case 'writing':
      update['fieldCompletions'] = output;
      break;
    case 'verification':
      update['qualityReport'] = output;
      break;
  }

  if (Object.keys(update).length > 0) {
    await Project.findByIdAndUpdate(projectId, { $set: update });
  }
}

/**
 * Fetch raw text from Extraction collection for a set of documents.
 * Combines rawText from each extraction, prefixed with filename.
 */
async function getDocumentTexts(
  projectId: string,
  role: 'source' | 'template' | 'model'
): Promise<{ filename: string; content: string }[]> {
  const { connectToDatabase, DocumentModel, Extraction } = await import('@/lib/db');
  await connectToDatabase();

  const docs = await DocumentModel.find({
    projectId,
    role,
    status: 'extracted',
  }).lean();

  const results: { filename: string; content: string }[] = [];

  for (const doc of docs) {
    const extraction = await Extraction.findOne({
      documentId: String(doc._id),
    }).lean();

    if (extraction?.rawText) {
      results.push({
        filename: doc.originalFilename,
        content: extraction.rawText,
      });
    } else if (extraction?.blocks && extraction.blocks.length > 0) {
      // Fallback: concatenate text from blocks
      const text = extraction.blocks
        .map((b) => (b as Record<string, unknown>).text ?? '')
        .filter(Boolean)
        .join('\n\n');
      if (text) {
        results.push({
          filename: doc.originalFilename,
          content: text,
        });
      }
    }
  }

  return results;
}

/**
 * Run the Parser Agent stage.
 *
 * For each document not yet extracted, downloads the file and parses it
 * using Claude AI Vision (PDFs, images) or Node.js extractors (DOCX, XLSX).
 * Creates Extraction records in MongoDB so downstream agents can read the text.
 *
 * Returns a summary of parsed documents as the stage output.
 */
async function runParserStage(projectId: string): Promise<AgentResult> {
  const { connectToDatabase, DocumentModel, Extraction } = await import('@/lib/db');
  await connectToDatabase();

  // Find all documents that need parsing (status !== 'extracted' and !== 'deleted')
  const docs = await DocumentModel.find({
    projectId,
    status: { $in: ['uploaded', 'processing', 'failed'] },
  });

  if (docs.length === 0) {
    // All documents already extracted — return summary of existing extractions
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
      // Check if extraction already exists by SHA256 (cache)
      const cachedExtraction = await Extraction.findOne({ sha256: doc.sha256 });
      if (cachedExtraction) {
        console.log(`[ParserAgent] Cache hit for ${doc.originalFilename}`);
        // Ensure extraction record linked to this documentId exists
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

      // Download file
      await DocumentModel.findByIdAndUpdate(docId, { status: 'processing' });
      let fileBuffer: Buffer;
      try {
        const { downloadFile } = await import('@/lib/storage/download');
        fileBuffer = await downloadFile(doc.r2Key);
      } catch {
        // Try local dev storage
        const { downloadFileLocal } = await import('@/lib/storage/dev-storage');
        fileBuffer = await downloadFileLocal(doc.r2Key);
      }

      // Parse using the intelligent pipeline (AI Vision → Python → Node.js)
      const { parseDocument } = await import('@/lib/parsing/parse-pipeline');
      const { calculateOverallConfidence } = await import('@/lib/parsing/confidence');

      const parseResult = await parseDocument(fileBuffer, doc.originalFilename, doc.mimeType);

      // Track token usage from AI Vision calls (embedded in processing time as proxy)
      // The actual tokens are tracked inside ocr-agent.ts via callAgentWithRetry

      // Evaluate confidence
      type BlockForConfidence = Parameters<typeof calculateOverallConfidence>[0][number];
      const blocksForConfidence = parseResult.blocks as BlockForConfidence[];
      const overall = calculateOverallConfidence(blocksForConfidence);

      // Store extraction in MongoDB
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

      // Mark document as extracted
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

  // Verify at least source documents are available after parsing
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
 * Run a single pipeline stage, routing to the appropriate agent.
 */
async function runStage(
  stage: PipelineStage,
  context: PipelineContext
): Promise<AgentResult> {
  switch (stage) {
    case 'parser':
      return runParserStage(context.projectId);

    case 'extractor': {
      const sourceDocs = await getDocumentTexts(context.projectId, 'source');
      if (sourceDocs.length === 0) {
        throw new Error('No extracted source documents found for extractor stage');
      }
      return runExtractorAgent({
        documents: sourceDocs.map((d) => ({
          filename: d.filename,
          content: d.content,
          role: 'source' as const,
        })),
      });
    }

    case 'model': {
      const modelDocs = await getDocumentTexts(context.projectId, 'model');
      if (modelDocs.length === 0) {
        throw new Error('No extracted model documents found for model stage');
      }
      return runModelAgent({ documents: modelDocs });
    }

    case 'template': {
      const templateDocs = await getDocumentTexts(context.projectId, 'template');
      const templateDoc = templateDocs[0];
      if (!templateDoc) {
        throw new Error('No extracted template document found for template stage');
      }

      // Check if template is a PDF (needs special handling)
      const { connectToDatabase: connectDb, DocumentModel: DocModel } = await import('@/lib/db');
      await connectDb();
      const templateDocRecord = await DocModel.findOne({
        projectId: context.projectId,
        role: 'template',
        status: 'extracted',
      });

      const isPdf = templateDocRecord?.mimeType === 'application/pdf';

      if (isPdf && templateDocRecord) {
        // Analyze PDF template: detect AcroForm fields, determine type
        const { analyzePdfTemplate } = await import('@/lib/docgen/pdf-template-detector');

        let templateBuffer: Buffer;
        try {
          const { downloadFile } = await import('@/lib/storage/download');
          templateBuffer = await downloadFile(templateDocRecord.r2Key);
        } catch {
          const { downloadFileLocal } = await import('@/lib/storage/dev-storage');
          templateBuffer = await downloadFileLocal(templateDocRecord.r2Key);
        }

        const pdfAnalysis = await analyzePdfTemplate(templateBuffer);

        console.log(
          `[Pipeline] PDF template detected: ${pdfAnalysis.type}, ${pdfAnalysis.fields.length} form fields`
        );

        if (pdfAnalysis.type === 'acroform') {
          return runTemplateAgent({
            content: templateDoc.content,
            templateType: 'acroform',
            pdfFormFields: pdfAnalysis.fields,
          });
        } else {
          // Flat PDF — render pages as images for Claude Vision analysis
          const { renderPdfPagesAsImages } = await import('@/lib/docgen/pdf-page-renderer');
          const pageImages = await renderPdfPagesAsImages(templateBuffer, pdfAnalysis.pageCount);
          return runTemplateAgent({
            content: templateDoc.content,
            templateType: 'flat_pdf',
            pageImages,
          });
        }
      }

      // Default: DOCX template
      return runTemplateAgent(templateDoc.content);
    }

    case 'mapping': {
      if (!context.projectData) {
        throw new Error('Missing projectData for mapping stage — run extractor first');
      }
      if (!context.templateSchema) {
        throw new Error('Missing templateSchema for mapping stage — run template first');
      }
      return runMappingAgent({
        projectData: context.projectData,
        modelMap: context.modelMap,
        templateSchema: context.templateSchema,
      });
    }

    case 'writing': {
      if (!context.projectData) {
        throw new Error('Missing projectData for writing stage — run extractor first');
      }
      if (!context.draftPlan) {
        throw new Error('Missing draftPlan for writing stage — run mapping first');
      }
      return runWritingAgent({
        projectData: context.projectData,
        modelMap: context.modelMap,
        draftPlan: context.draftPlan,
      });
    }

    case 'verification': {
      if (!context.projectData) {
        throw new Error('Missing projectData for verification stage — run extractor first');
      }
      if (!context.fieldCompletions) {
        throw new Error('Missing fieldCompletions for verification stage — run writing first');
      }
      return runVerificationAgent({
        projectData: context.projectData,
        modelMap: context.modelMap,
        fieldCompletions: context.fieldCompletions,
      });
    }

    default:
      throw new Error(`Unknown pipeline stage: ${stage}`);
  }
}
