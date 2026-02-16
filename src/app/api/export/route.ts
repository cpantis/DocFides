import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { z } from 'zod';
import { connectToDatabase, Project, Generation, Audit, DocumentModel } from '@/lib/db';
import { generateDocx, buildGenerationInput } from '@/lib/docgen/docx-generator';
import { convertDocxToPdf } from '@/lib/docgen/pdf-converter';
import { validateExportedDocx } from '@/lib/docgen/export-validator';
import { extractTextFromDocxBuffer } from '@/lib/docgen/docx-text-extractor';
import { runExportAgent } from '@/lib/ai/export-agent';
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

    const project = await Project.findOne({ _id: body.projectId, userId });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.status !== 'ready' && project.status !== 'exported') {
      return NextResponse.json({ error: 'Project not ready for export' }, { status: 400 });
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

    // Validate generated DOCX before delivery
    const validation = await validateExportedDocx(
      docxBuffer,
      Object.keys(generationInput.fieldValues)
    );

    if (!validation.valid) {
      console.error('[EXPORT_POST] Generated DOCX failed validation:', validation.errors);
      return NextResponse.json({
        error: 'Document generation failed validation',
        details: validation.errors,
      }, { status: 500 });
    }

    if (validation.warnings.length > 0) {
      console.warn(
        `[EXPORT_POST] Generated DOCX has ${validation.warnings.length} warning(s):`,
        validation.warnings.map((w) => w.message)
      );
    }

    // AI Export Agent — final quality gate
    // Extracts text from the generated DOCX and has Claude verify correctness
    const generatedText = await extractTextFromDocxBuffer(docxBuffer);
    const exportReview = await runExportAgent({
      generatedDocumentText: generatedText,
      projectData,
      templateSchema,
      mechanicalValidation: {
        unreplacedPlaceholders: validation.stats.unreplacedPlaceholders,
        warnings: validation.warnings.map((w) => w.message),
      },
    });

    const exportApproval = exportReview.output as { approved?: boolean; score?: number; issues?: unknown[]; summary?: string };

    if (exportApproval.approved === false) {
      console.error(
        `[EXPORT_POST] Export Agent rejected document (score: ${exportApproval.score}): ${exportApproval.summary}`
      );
      return NextResponse.json({
        error: 'Export quality check failed',
        summary: exportApproval.summary,
        score: exportApproval.score,
        issues: exportApproval.issues,
      }, { status: 422 });
    }

    console.log(
      `[EXPORT_POST] Export Agent approved (score: ${exportApproval.score}): ${exportApproval.summary}`
    );

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

    // Build filenames — ASCII-safe for R2 key, UTF-8 for download
    const safeFilename = `${project.name.replace(/[^a-zA-Z0-9._-]/g, '_')}.${fileExtension}`;
    const displayFilename = `${project.name}.${fileExtension}`;

    // Upload generated document to R2
    const r2Key = generateR2Key(userId, body.projectId, safeFilename);
    await uploadFile(r2Key, outputBuffer, contentType);

    // Record generation in DB
    await Generation.create({
      projectId: body.projectId,
      userId,
      type: body.format,
      creditsUsed: 0,
      r2Key,
    });

    await Audit.create({
      userId,
      projectId: body.projectId,
      action: 'export_generated',
      details: {
        format: body.format,
        r2Key,
        sizeBytes: outputBuffer.length,
        validation: {
          warnings: validation.warnings.length,
          unreplacedPlaceholders: validation.stats.unreplacedPlaceholders,
          paragraphs: validation.stats.totalParagraphs,
          tables: validation.stats.totalTables,
        },
        exportAgent: {
          approved: exportApproval.approved,
          score: exportApproval.score,
          issueCount: Array.isArray(exportApproval.issues) ? exportApproval.issues.length : 0,
        },
      },
    });

    project.status = 'exported';
    await project.save();

    // RFC 6266: filename for ASCII fallback, filename* for UTF-8 (Romanian diacritics)
    const encodedFilename = encodeURIComponent(displayFilename).replace(/%20/g, '+');
    const contentDisposition =
      `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`;

    // Return document as blob for direct download
    return new NextResponse(new Uint8Array(outputBuffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': contentDisposition,
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
