import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { z } from 'zod';
import { connectToDatabase, Project, Audit } from '@/lib/db';

const fieldUpdateSchema = z.object({
  fields: z.array(
    z.object({
      fieldId: z.string(),
      status: z.enum(['accepted', 'modified', 'skipped']),
      value: z.string(),
      selectedEntity: z.string().optional(),
    })
  ),
});

/**
 * PATCH /api/projects/[id]/fields
 * Save user field acceptances, edits, and skips.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = fieldUpdateSchema.parse(await req.json());

    await connectToDatabase();

    const project = await Project.findOne({ _id: id, userId });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Merge user edits into fieldCompletions
    const currentCompletions = (project.fieldCompletions ?? {}) as Record<string, unknown>;
    const fields = (currentCompletions.fields ?? currentCompletions) as Record<string, unknown>;
    const userEdits = (currentCompletions._userEdits ?? {}) as Record<string, unknown>;

    for (const fieldUpdate of body.fields) {
      // Store user decision
      userEdits[fieldUpdate.fieldId] = {
        status: fieldUpdate.status,
        value: fieldUpdate.value,
        selectedEntity: fieldUpdate.selectedEntity,
        updatedAt: new Date().toISOString(),
      };

      // Update the actual field value if modified
      if (fieldUpdate.status === 'modified') {
        fields[fieldUpdate.fieldId] = fieldUpdate.value;
      } else if (fieldUpdate.status === 'accepted' && fieldUpdate.selectedEntity) {
        fields[fieldUpdate.fieldId] = fieldUpdate.value;
      }
    }

    await Project.findByIdAndUpdate(id, {
      $set: {
        fieldCompletions: {
          ...currentCompletions,
          fields,
          _userEdits: userEdits,
        },
      },
    });

    await Audit.create({
      userId,
      projectId: id,
      action: 'fields_updated',
      details: {
        fieldsCount: body.fields.length,
        accepted: body.fields.filter((f) => f.status === 'accepted').length,
        modified: body.fields.filter((f) => f.status === 'modified').length,
        skipped: body.fields.filter((f) => f.status === 'skipped').length,
      },
    });

    return NextResponse.json({ data: { updated: body.fields.length } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[FIELDS_PATCH]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
