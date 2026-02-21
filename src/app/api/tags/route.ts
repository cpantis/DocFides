import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { z } from 'zod';
import { connectToDatabase, Tag } from '@/lib/db';

const createTagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

/** GET /api/tags — list all tags for the current user */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await connectToDatabase();

    // Seed default tags on first access
    const { ensureDefaultTags } = await import('@/lib/db/seed-tags');
    await ensureDefaultTags(userId);

    const tags = await Tag.find({ userId }).sort({ name: 1 }).lean();

    return NextResponse.json({ data: tags });
  } catch (error) {
    console.error('[TAGS_GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/tags — create a new tag */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = createTagSchema.parse(await req.json());

    await connectToDatabase();

    const tag = await Tag.create({
      userId,
      name: body.name,
      color: body.color ?? '#6366f1',
    });

    return NextResponse.json({ data: tag }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    // Duplicate key error (unique constraint)
    if ((error as { code?: number }).code === 11000) {
      return NextResponse.json({ error: 'Tag with this name already exists' }, { status: 409 });
    }
    console.error('[TAGS_POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
