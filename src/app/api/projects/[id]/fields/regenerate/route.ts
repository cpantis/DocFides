import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { z } from 'zod';
import { connectToDatabase, Project, User, Generation, Audit } from '@/lib/db';
import { callAgentWithRetry } from '@/lib/ai/client';
import { AGENT_MODELS } from '@/types/pipeline';
import { WRITING_SYSTEM_PROMPT } from '@/lib/ai/prompts/writing';

const regenerateSchema = z.object({
  fieldId: z.string().min(1),
});

const REGENERATION_CREDIT_COST = 0.5;

/**
 * POST /api/projects/[id]/fields/regenerate
 * Regenerate a single field using the Writing Agent.
 * Costs 0.5 credits.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = regenerateSchema.parse(await req.json());

    await connectToDatabase();

    const [project, user] = await Promise.all([
      Project.findOne({ _id: id, userId }),
      User.findOne({ clerkId: userId }),
    ]);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check credits
    if (user.credits.used + REGENERATION_CREDIT_COST > user.credits.total) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
    }

    const projectData = (project.projectData ?? {}) as Record<string, unknown>;
    const templateSchema = (project.templateSchema ?? {}) as Record<string, unknown>;
    const modelMap = project.modelMap as Record<string, unknown> | undefined;
    const draftPlan = (project.draftPlan ?? {}) as Record<string, unknown>;

    // Find field info from template schema
    const schemaFields = (templateSchema.fields ?? []) as Record<string, unknown>[];
    const fieldInfo = schemaFields.find((f) => (f as Record<string, unknown>).id === body.fieldId);
    const fieldHint = fieldInfo
      ? `${(fieldInfo as Record<string, unknown>).hint ?? ''} (type: ${(fieldInfo as Record<string, unknown>).expectedType ?? 'text'})`
      : body.fieldId;

    // Find mapping info
    const fieldMappings = (draftPlan.fieldMappings ?? []) as Record<string, unknown>[];
    const mapping = fieldMappings.find(
      (m) => (m as Record<string, unknown>).fieldId === body.fieldId
    );
    const dataSource = mapping
      ? (mapping as Record<string, unknown>).dataSource ?? 'projectData'
      : 'projectData';

    // Call Writing Agent for single field regeneration
    const result = await callAgentWithRetry(
      {
        model: AGENT_MODELS.writing,
        max_tokens: 4096,
        system: WRITING_SYSTEM_PROMPT,
        tools: [
          {
            name: 'save_field_completion',
            description: 'Save the regenerated field value',
            input_schema: {
              type: 'object' as const,
              properties: {
                value: { type: 'string' as const, description: 'The generated field value' },
                confidence: { type: 'number' as const, description: 'Confidence score 0-100' },
              },
              required: ['value'],
            },
          },
        ],
        messages: [
          {
            role: 'user',
            content: `Regenerate ONLY the following field. Use ONLY factual data from project_data (never from model documents).

Field: ${body.fieldId}
Hint: ${fieldHint}
Data source: ${JSON.stringify(dataSource)}

Project data:
${JSON.stringify(projectData, null, 2)}

${modelMap ? `Style reference (for tone/style ONLY, NOT for facts):\n${JSON.stringify(modelMap, null, 2)}` : ''}

Generate a fresh, accurate value for this field. Follow Romanian formatting conventions (DD.MM.YYYY for dates, dot-separated thousands for amounts).`,
          },
        ],
      },
      'save_field_completion'
    );

    const newValue = (result.output.value as string) ?? '';

    // Update field in project
    const currentCompletions = (project.fieldCompletions ?? {}) as Record<string, unknown>;
    const fields = (currentCompletions.fields ?? currentCompletions) as Record<string, unknown>;
    fields[body.fieldId] = newValue;

    await Project.findByIdAndUpdate(id, {
      $set: { fieldCompletions: { ...currentCompletions, fields } },
    });

    // Deduct credits
    user.credits.used += REGENERATION_CREDIT_COST;
    await user.save();

    // Record generation
    await Generation.create({
      projectId: id,
      userId,
      type: 'regeneration',
      creditsUsed: REGENERATION_CREDIT_COST,
      tokenUsage: {
        inputTokens: result.tokenUsage.inputTokens,
        outputTokens: result.tokenUsage.outputTokens,
      },
    });

    await Audit.create({
      userId,
      projectId: id,
      action: 'field_regenerated',
      details: {
        fieldId: body.fieldId,
        tokens: result.tokenUsage,
      },
    });

    return NextResponse.json({
      data: {
        fieldId: body.fieldId,
        value: newValue,
        confidence: result.output.confidence ?? null,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[FIELD_REGENERATE]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
