import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { z } from 'zod';
import { connectToDatabase, Project, Draft } from '@/lib/db';

const saveDraftSchema = z.object({
  fields: z.record(z.object({
    value: z.string(),
    status: z.enum(['ai_suggested', 'accepted', 'edited', 'regenerated', 'skipped']),
    previousValue: z.string().optional(),
    entityChoice: z.string().optional(),
  })),
});

/**
 * GET /api/projects/[id]/draft
 * List draft versions (latest first, max 50).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: projectId } = await params;
    await connectToDatabase();

    const project = await Project.findOne({ _id: projectId, userId }).lean();
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const drafts = await Draft.find({ projectId, userId })
      .sort({ version: -1 })
      .limit(50)
      .lean();

    return NextResponse.json({
      data: {
        drafts: drafts.map((d) => ({
          version: d.version,
          fieldCount: Object.keys(d.fields).length,
          createdAt: d.createdAt,
        })),
        currentVersion: drafts[0]?.version ?? 0,
      },
    });
  } catch (error) {
    console.error('[DRAFT_GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/projects/[id]/draft
 * Save a new draft snapshot (auto-increments version).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: projectId } = await params;
    const body = saveDraftSchema.parse(await req.json());

    await connectToDatabase();

    const project = await Project.findOne({ _id: projectId, userId });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get latest version number
    const latestDraft = await Draft.findOne({ projectId, userId })
      .sort({ version: -1 })
      .lean();
    const nextVersion = (latestDraft?.version ?? 0) + 1;

    const draft = await Draft.create({
      projectId,
      userId,
      version: nextVersion,
      fields: body.fields,
    });

    return NextResponse.json({
      data: {
        version: draft.version,
        fieldCount: Object.keys(draft.fields).length,
        createdAt: draft.createdAt,
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[DRAFT_POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/projects/[id]/draft
 * Load a specific draft version and apply it to fieldCompletions.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: projectId } = await params;
    const { version } = z.object({ version: z.number() }).parse(await req.json());

    await connectToDatabase();

    const project = await Project.findOne({ _id: projectId, userId });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const draft = await Draft.findOne({ projectId, userId, version }).lean();
    if (!draft) {
      return NextResponse.json({ error: 'Draft version not found' }, { status: 404 });
    }

    // Apply draft fields back to project fieldCompletions
    const currentCompletions = (project.fieldCompletions ?? {}) as Record<string, unknown>;
    const currentFields = (currentCompletions.fields ?? currentCompletions) as Record<string, unknown>;

    // Merge draft values into field completions
    for (const [fieldId, draftField] of Object.entries(draft.fields)) {
      currentFields[fieldId] = draftField.value;
    }

    // Store user edits metadata
    const userEdits: Record<string, unknown> = {};
    for (const [fieldId, draftField] of Object.entries(draft.fields)) {
      if (draftField.status !== 'ai_suggested') {
        userEdits[fieldId] = {
          status: draftField.status,
          value: draftField.value,
          entity: draftField.entityChoice,
        };
      }
    }

    await Project.findByIdAndUpdate(projectId, {
      $set: {
        'fieldCompletions.fields': currentFields,
        'fieldCompletions._userEdits': userEdits,
      },
    });

    return NextResponse.json({
      data: {
        version: draft.version,
        restoredFields: Object.keys(draft.fields).length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[DRAFT_PATCH]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
