import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { z } from 'zod';
import { connectToDatabase, LibraryItem } from '@/lib/db';

const createEntitySchema = z.object({
  name: z.string().min(1, 'Entity name is required').max(200),
  description: z.string().max(500).optional(),
});

/** GET /api/library/entities — list all entities for the current user */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await connectToDatabase();

    const entities = await LibraryItem.find({ userId, type: 'entity' })
      .select('-documents.fileData -documents.extractionBlocks')
      .sort({ updatedAt: -1 })
      .lean();

    return NextResponse.json({ data: entities });
  } catch (error) {
    console.error('[LIBRARY_ENTITIES_GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/library/entities — create a new entity (name only, documents added separately) */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = createEntitySchema.parse(await req.json());

    await connectToDatabase();

    const entity = await LibraryItem.create({
      userId,
      type: 'entity',
      name: body.name,
      description: body.description,
      documents: [],
      status: 'draft',
    });

    return NextResponse.json({ data: entity }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[LIBRARY_ENTITIES_POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
