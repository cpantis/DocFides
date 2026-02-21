import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { z } from 'zod';
import { connectToDatabase, Project } from '@/lib/db';
import { createProjectSchema } from '@/lib/utils/validation';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await connectToDatabase();
    const projects = await Project.find({ userId }).sort({ updatedAt: -1 });

    return NextResponse.json({ data: projects });
  } catch (error) {
    console.error('[PROJECTS_GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = createProjectSchema.parse(await req.json());

    await connectToDatabase();
    const project = await Project.create({
      userId,
      name: body.name,
      status: 'draft',
    });

    return NextResponse.json({ data: project }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[PROJECTS_POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
