import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { z } from 'zod';
import { connectToDatabase, LibraryItem } from '@/lib/db';
import { deleteTempFile } from '@/lib/storage/tmp-storage';

const updateModelSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
});

/** GET /api/library/models/[id] — get model detail */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    await connectToDatabase();

    const modelItem = await LibraryItem.findOne({ _id: id, userId, type: 'model' })
      .select('-documents.fileData')
      .lean();

    if (!modelItem) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    return NextResponse.json({ data: modelItem });
  } catch (error) {
    console.error('[LIBRARY_MODEL_GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PUT /api/library/models/[id] — update model name/description */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = updateModelSchema.parse(await req.json());

    await connectToDatabase();

    const modelItem = await LibraryItem.findOneAndUpdate(
      { _id: id, userId, type: 'model' },
      { $set: body },
      { new: true }
    )
      .select('-documents.fileData')
      .lean();

    if (!modelItem) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    return NextResponse.json({ data: modelItem });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[LIBRARY_MODEL_PUT]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/library/models/[id] — delete model and its document */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    await connectToDatabase();

    const modelItem = await LibraryItem.findOneAndDelete({ _id: id, userId, type: 'model' });
    if (!modelItem) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    for (const doc of modelItem.documents) {
      await deleteTempFile(doc.storageKey);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[LIBRARY_MODEL_DELETE]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
