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
 * Run a single pipeline stage, routing to the appropriate agent.
 */
async function runStage(
  stage: PipelineStage,
  context: PipelineContext
): Promise<AgentResult> {
  switch (stage) {
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
