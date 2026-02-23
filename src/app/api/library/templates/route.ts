import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { z } from 'zod';
import { connectToDatabase, LibraryItem } from '@/lib/db';

const createTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(200),
  description: z.string().max(500).optional(),
});

/** GET /api/library/templates — list all templates for the current user */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await connectToDatabase();

    const templates = await LibraryItem.find({ userId, type: 'template' })
      .select('-documents.fileData -documents.extractionBlocks')
      .sort({ updatedAt: -1 })
      .lean();

    return NextResponse.json({ data: templates });
  } catch (error) {
    console.error('[LIBRARY_TEMPLATES_GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/library/templates — create a new template (name only, document added separately) */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = createTemplateSchema.parse(await req.json());

    await connectToDatabase();

    const template = await LibraryItem.create({
      userId,
      type: 'template',
      name: body.name,
      description: body.description,
      documents: [],
      status: 'draft',
    });

    return NextResponse.json({ data: template }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[LIBRARY_TEMPLATES_POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
