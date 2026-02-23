import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { z } from 'zod';
import { connectToDatabase, LibraryItem } from '@/lib/db';

const createModelSchema = z.object({
  name: z.string().min(1, 'Model name is required').max(200),
  description: z.string().max(500).optional(),
});

/** GET /api/library/models — list all models for the current user */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await connectToDatabase();

    const modelItems = await LibraryItem.find({ userId, type: 'model' })
      .select('-documents.fileData -documents.extractionBlocks')
      .sort({ updatedAt: -1 })
      .lean();

    return NextResponse.json({ data: modelItems });
  } catch (error) {
    console.error('[LIBRARY_MODELS_GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/library/models — create a new model (name only, document added separately) */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = createModelSchema.parse(await req.json());

    await connectToDatabase();

    const modelItem = await LibraryItem.create({
      userId,
      type: 'model',
      name: body.name,
      description: body.description,
      documents: [],
      status: 'draft',
    });

    return NextResponse.json({ data: modelItem }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[LIBRARY_MODELS_POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
