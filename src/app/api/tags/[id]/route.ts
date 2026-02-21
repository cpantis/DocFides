import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { z } from 'zod';
import { connectToDatabase, Tag } from '@/lib/db';

const updateTagSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

/** PUT /api/tags/[id] — update a tag */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = updateTagSchema.parse(await req.json());

    await connectToDatabase();

    const tag = await Tag.findOneAndUpdate(
      { _id: id, userId },
      { $set: body },
      { new: true }
    );

    if (!tag) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    return NextResponse.json({ data: tag });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    if ((error as { code?: number }).code === 11000) {
      return NextResponse.json({ error: 'Tag with this name already exists' }, { status: 409 });
    }
    console.error('[TAG_PUT]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/tags/[id] — delete a tag */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await connectToDatabase();

    const tag = await Tag.findOneAndDelete({ _id: id, userId });
    if (!tag) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    // Remove tagId from all documents that use this tag
    const { DocumentModel } = await import('@/lib/db');
    await DocumentModel.updateMany({ tagId: id }, { $unset: { tagId: '' } });

    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    console.error('[TAG_DELETE]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
