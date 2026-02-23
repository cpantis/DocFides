import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { z } from 'zod';
import { connectToDatabase, LibraryItem } from '@/lib/db';
import { deleteTempFile } from '@/lib/storage/tmp-storage';
import { processLibraryItem } from '@/lib/ai/library-processor';

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

/** PATCH /api/library/models/[id] — retry failed processing */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await connectToDatabase();

    const item = await LibraryItem.findOne({ _id: id, userId, type: 'model' });
    if (!item) return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    if (item.status === 'processing') return NextResponse.json({ error: 'Already processing' }, { status: 409 });

    for (const doc of item.documents) {
      if (doc.status === 'failed') doc.status = 'uploaded';
    }
    item.status = 'draft';
    item.processedData = undefined;
    await item.save();

    processLibraryItem(id).catch((err) => {
      console.error(`[LIBRARY_MODEL_RETRY] Background processing failed for ${id}:`, err);
    });

    const updated = await LibraryItem.findById(id).select('-documents.fileData').lean();
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('[LIBRARY_MODEL_RETRY]', error);
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
