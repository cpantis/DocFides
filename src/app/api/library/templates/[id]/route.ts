import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { z } from 'zod';
import { connectToDatabase, LibraryItem } from '@/lib/db';
import { deleteTempFile } from '@/lib/storage/tmp-storage';
import { processLibraryItem } from '@/lib/ai/library-processor';

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
});

/** GET /api/library/templates/[id] — get template detail */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    await connectToDatabase();

    const template = await LibraryItem.findOne({ _id: id, userId, type: 'template' })
      .select('-documents.fileData')
      .lean();

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({ data: template });
  } catch (error) {
    console.error('[LIBRARY_TEMPLATE_GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PUT /api/library/templates/[id] — update template name/description */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = updateTemplateSchema.parse(await req.json());

    await connectToDatabase();

    const template = await LibraryItem.findOneAndUpdate(
      { _id: id, userId, type: 'template' },
      { $set: body },
      { new: true }
    )
      .select('-documents.fileData')
      .lean();

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({ data: template });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[LIBRARY_TEMPLATE_PUT]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PATCH /api/library/templates/[id] — retry failed processing */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await connectToDatabase();

    const item = await LibraryItem.findOne({ _id: id, userId, type: 'template' });
    if (!item) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    if (item.status === 'processing') return NextResponse.json({ error: 'Already processing' }, { status: 409 });

    for (const doc of item.documents) {
      if (doc.status === 'failed') doc.status = 'uploaded';
    }
    item.status = 'draft';
    item.processedData = undefined;
    await item.save();

    processLibraryItem(id).catch((err) => {
      console.error(`[LIBRARY_TEMPLATE_RETRY] Background processing failed for ${id}:`, err);
    });

    const updated = await LibraryItem.findById(id).select('-documents.fileData').lean();
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('[LIBRARY_TEMPLATE_RETRY]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/library/templates/[id] — delete template and its document */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;

    await connectToDatabase();

    const template = await LibraryItem.findOneAndDelete({ _id: id, userId, type: 'template' });
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Clean up temp files
    for (const doc of template.documents) {
      await deleteTempFile(doc.storageKey);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[LIBRARY_TEMPLATE_DELETE]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
