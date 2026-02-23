import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { z } from 'zod';
import { connectToDatabase, Project, LibraryItem } from '@/lib/db';

const linkLibrarySchema = z.object({
  type: z.enum(['template', 'model', 'entity']),
  libraryItemId: z.string().min(1),
});

const unlinkLibrarySchema = z.object({
  type: z.enum(['template', 'model', 'entity']),
  libraryItemId: z.string().optional(), // For entities, which is an array
});

/** POST /api/projects/[id]/library — link a library item to a project (copy on use) */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = linkLibrarySchema.parse(await req.json());

    await connectToDatabase();

    const project = await Project.findOne({ _id: id, userId });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const libraryItem = await LibraryItem.findOne({ _id: body.libraryItemId, userId, type: body.type })
      .select('-documents.fileData')
      .lean();
    if (!libraryItem) {
      return NextResponse.json({ error: 'Library item not found' }, { status: 404 });
    }

    const ref = {
      libraryItemId: libraryItem._id,
      name: libraryItem.name,
      processedData: libraryItem.processedData,
      copiedAt: new Date(),
    };

    if (!project.libraryRefs) {
      project.libraryRefs = {};
    }

    if (body.type === 'entity') {
      if (!project.libraryRefs.entities) {
        project.libraryRefs.entities = [];
      }
      // Don't add the same entity twice
      const alreadyLinked = project.libraryRefs.entities.some(
        (e) => e.libraryItemId?.toString() === body.libraryItemId
      );
      if (!alreadyLinked) {
        project.libraryRefs.entities.push(ref);
      }
    } else if (body.type === 'template') {
      project.libraryRefs.template = ref;
    } else {
      project.libraryRefs.model = ref;
    }

    project.markModified('libraryRefs');
    await project.save();

    // Increment usage count on the library item
    await LibraryItem.findByIdAndUpdate(body.libraryItemId, {
      $inc: { usageCount: 1 },
      $set: { lastUsedAt: new Date() },
    });

    return NextResponse.json({ data: project });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[PROJECT_LIBRARY_LINK]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/projects/[id]/library — unlink a library item from a project */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = unlinkLibrarySchema.parse(await req.json());

    await connectToDatabase();

    const project = await Project.findOne({ _id: id, userId });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!project.libraryRefs) {
      return NextResponse.json({ data: project });
    }

    if (body.type === 'entity' && body.libraryItemId) {
      project.libraryRefs.entities = (project.libraryRefs.entities ?? []).filter(
        (e) => e.libraryItemId?.toString() !== body.libraryItemId
      );
    } else if (body.type === 'template') {
      project.libraryRefs.template = undefined;
    } else if (body.type === 'model') {
      project.libraryRefs.model = undefined;
    }

    project.markModified('libraryRefs');
    await project.save();

    return NextResponse.json({ data: project });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[PROJECT_LIBRARY_UNLINK]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
