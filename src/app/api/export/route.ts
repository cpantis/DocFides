import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { connectToDatabase, Project, User, Generation, Audit } from '@/lib/db';

const exportSchema = z.object({
  projectId: z.string().min(1),
  format: z.enum(['docx', 'pdf']),
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = exportSchema.parse(await req.json());

    await connectToDatabase();

    const [project, user] = await Promise.all([
      Project.findOne({ _id: body.projectId, userId }),
      User.findOne({ clerkId: userId }),
    ]);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.status !== 'ready') {
      return NextResponse.json({ error: 'Project not ready for export' }, { status: 400 });
    }

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check credits
    const creditsNeeded = 1;
    if (user.credits.used + creditsNeeded > user.credits.total) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
    }

    // TODO: Generate document using docgen module

    // Record generation
    await Generation.create({
      projectId: body.projectId,
      userId,
      type: body.format,
      creditsUsed: creditsNeeded,
    });

    // Deduct credits
    user.credits.used += creditsNeeded;
    await user.save();

    await Audit.create({
      userId,
      projectId: body.projectId,
      action: 'export_generated',
      details: { format: body.format },
    });

    project.status = 'exported';
    await project.save();

    return NextResponse.json({
      data: {
        format: body.format,
        // TODO: return download URL
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[EXPORT_POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
