import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { z } from 'zod';
import { connectToDatabase, LibraryItem } from '@/lib/db';

const updateEntitySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
});

/** GET /api/library/entities/[id] — get entity detail with documents */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    await connectToDatabase();

    const entity = await LibraryItem.findOne({ _id: id, userId, type: 'entity' })
      .select('-documents.fileData')
      .lean();

    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    return NextResponse.json({ data: entity });
  } catch (error) {
    console.error('[LIBRARY_ENTITY_GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PUT /api/library/entities/[id] — update entity name/description */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = updateEntitySchema.parse(await req.json());

    await connectToDatabase();

    const entity = await LibraryItem.findOneAndUpdate(
      { _id: id, userId, type: 'entity' },
      { $set: body },
      { new: true }
    )
      .select('-documents.fileData')
      .lean();

    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    return NextResponse.json({ data: entity });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[LIBRARY_ENTITY_PUT]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/library/entities/[id] — delete entity and all its documents */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    await connectToDatabase();

    const entity = await LibraryItem.findOneAndDelete({ _id: id, userId, type: 'entity' });
    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[LIBRARY_ENTITY_DELETE]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
