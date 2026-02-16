import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { z } from 'zod';
import { connectToDatabase, Project, User, Generation, Audit, DocumentModel } from '@/lib/db';
import { generateDocx, buildGenerationInput } from '@/lib/docgen/docx-generator';
import { convertDocxToPdf } from '@/lib/docgen/pdf-converter';
import { downloadFile } from '@/lib/storage/download';
import { uploadFile, generateR2Key } from '@/lib/storage/upload';

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

    if (project.status !== 'ready' && project.status !== 'exported') {
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

    // Fetch template document from R2
    const templateDoc = await DocumentModel.findOne({
      _id: project.templateDocument,
      role: 'template',
      status: { $ne: 'deleted' },
    });

    if (!templateDoc) {
      return NextResponse.json({ error: 'Template document not found' }, { status: 404 });
    }

    const templateBuffer = await downloadFile(templateDoc.r2Key);

    // Build generation input from pipeline outputs
    const fieldCompletions = (project.fieldCompletions ?? {}) as Record<string, unknown>;
    const draftPlan = (project.draftPlan ?? {}) as Record<string, unknown>;
    const templateSchema = (project.templateSchema ?? {}) as Record<string, unknown>;
    const projectData = (project.projectData ?? {}) as Record<string, unknown>;

    const generationInput = buildGenerationInput(
      templateBuffer,
      fieldCompletions,
      draftPlan,
      templateSchema,
      projectData
    );

    // Generate DOCX
    const docxBuffer = await generateDocx(generationInput);

    // Convert to PDF if needed
    let outputBuffer: Buffer;
    let contentType: string;
    let fileExtension: string;

    if (body.format === 'pdf') {
      outputBuffer = await convertDocxToPdf(docxBuffer);
      contentType = 'application/pdf';
      fileExtension = 'pdf';
    } else {
      outputBuffer = docxBuffer;
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      fileExtension = 'docx';
    }

    // Upload generated document to R2
    const outputFilename = `${project.name.replace(/[^a-zA-Z0-9._-]/g, '_')}.${fileExtension}`;
    const r2Key = generateR2Key(userId, body.projectId, outputFilename);
    await uploadFile(r2Key, outputBuffer, contentType);

    // Record generation in DB
    await Generation.create({
      projectId: body.projectId,
      userId,
      type: body.format,
      creditsUsed: creditsNeeded,
      r2Key,
    });

    // Deduct credits
    user.credits.used += creditsNeeded;
    await user.save();

    await Audit.create({
      userId,
      projectId: body.projectId,
      action: 'export_generated',
      details: { format: body.format, r2Key, sizeBytes: outputBuffer.length },
    });

    project.status = 'exported';
    await project.save();

    // Return document as blob for direct download
    return new NextResponse(new Uint8Array(outputBuffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${outputFilename}"`,
        'Content-Length': String(outputBuffer.length),
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
