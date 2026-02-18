import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { z } from 'zod';
import { connectToDatabase, Project, Generation, Audit, DocumentModel } from '@/lib/db';
import { generateDocx, buildGenerationInput } from '@/lib/docgen/docx-generator';
import { convertDocxToPdf } from '@/lib/docgen/pdf-converter';
import { validateExportedDocx } from '@/lib/docgen/export-validator';
import { extractTextFromDocxBuffer } from '@/lib/docgen/docx-text-extractor';
import { runExportAgent } from '@/lib/ai/export-agent';
import { readDocumentFileWithFallback, saveTempFile, generateStorageKey } from '@/lib/storage/tmp-storage';
import { analyzePdfTemplate } from '@/lib/docgen/pdf-template-detector';
import { fillPdfForm, fillFlatPdf, type PdfFieldPlacement } from '@/lib/docgen/pdf-form-filler';

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

    // Fetch template document from /tmp storage
    const templateDoc = await DocumentModel.findOne({
      _id: project.templateDocument,
      role: 'template',
      status: { $ne: 'deleted' },
    });

    if (!templateDoc) {
      return NextResponse.json({ error: 'Template document not found' }, { status: 404 });
    }

    // Read template: tries /tmp first, falls back to MongoDB fileData (survives restarts)
    let templateBuffer: Buffer;
    try {
      templateBuffer = await readDocumentFileWithFallback(
        templateDoc.storageKey,
        String(templateDoc._id)
      );
    } catch {
      return NextResponse.json(
        {
          error: 'Template file is no longer available. Please re-upload the template document and re-run the pipeline.',
          code: 'TEMPLATE_FILE_MISSING',
        },
        { status: 410 }
      );
    }

    // Build generation input from pipeline outputs
    const fieldCompletions = (project.fieldCompletions ?? {}) as Record<string, unknown>;
    const draftPlan = (project.draftPlan ?? {}) as Record<string, unknown>;
    const templateSchema = (project.templateSchema ?? {}) as Record<string, unknown>;
    const projectData = (project.projectData ?? {}) as Record<string, unknown>;

    const isPdfTemplate = templateDoc.mimeType === 'application/pdf';

    let outputBuffer: Buffer;
    let contentType: string;
    let fileExtension: string;

    if (isPdfTemplate) {
      // === PDF TEMPLATE PATH ===
      const pdfResult = await exportPdfTemplate({
        templateBuffer,
        fieldCompletions,
        templateSchema,
        projectData,
        requestedFormat: body.format,
      });
      outputBuffer = pdfResult.buffer;
      contentType = pdfResult.contentType;
      fileExtension = pdfResult.fileExtension;
    } else {
      // === DOCX TEMPLATE PATH (existing) ===
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
      if (body.format === 'pdf') {
        outputBuffer = await convertDocxToPdf(docxBuffer);
        contentType = 'application/pdf';
        fileExtension = 'pdf';
      } else {
        outputBuffer = docxBuffer;
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        fileExtension = 'docx';
      }
    }

    // Build filenames — ASCII-safe for storage key, UTF-8 for download
    const safeFilename = `${project.name.replace(/[^a-zA-Z0-9._-]/g, '_')}.${fileExtension}`;
    const displayFilename = `${project.name}.${fileExtension}`;

    // Save generated document to /tmp storage
    const exportStorageKey = generateStorageKey(userId, body.projectId, safeFilename);
    await saveTempFile(exportStorageKey, outputBuffer);

    // Record generation in DB
    await Generation.create({
      projectId: body.projectId,
      userId,
      type: body.format,
      creditsUsed: 0,
      storageKey: exportStorageKey,
    });

    await Audit.create({
      userId,
      projectId: body.projectId,
      action: 'export_generated',
      details: {
        format: body.format,
        storageKey: exportStorageKey,
        sizeBytes: outputBuffer.length,
        templateType: isPdfTemplate ? 'pdf' : 'docx',
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

/**
 * Export path for PDF templates (AcroForm or flat PDF).
 *
 * Flow:
 *  1. Detect if PDF has AcroForm fields
 *  2a. AcroForm → fill fields directly using pdf-lib
 *  2b. Flat PDF → use AI-determined coordinates to overlay text
 *  3. Return filled PDF buffer
 *
 * For PDF templates, the output is always PDF (no DOCX conversion).
 */
async function exportPdfTemplate(input: {
  templateBuffer: Buffer;
  fieldCompletions: Record<string, unknown>;
  templateSchema: Record<string, unknown>;
  projectData: Record<string, unknown>;
  requestedFormat: 'docx' | 'pdf';
}): Promise<{ buffer: Buffer; contentType: string; fileExtension: string }> {
  const pdfAnalysis = await analyzePdfTemplate(input.templateBuffer);

  // Extract field values from pipeline completions
  const completions = input.fieldCompletions as Record<string, string>;
  const schema = input.templateSchema as {
    templateType?: string;
    fields?: Array<{
      id: string;
      acroFieldName?: string;
      pdfPlacement?: { page: number; x: number; y: number; width: number; fontSize: number; multiline?: boolean };
    }>;
  };

  if (pdfAnalysis.type === 'acroform') {
    // Direct AcroForm fill
    const fieldValues: Record<string, string> = {};
    const checkboxValues: Record<string, boolean> = {};

    for (const schemaField of schema.fields ?? []) {
      const value = completions[schemaField.id];
      if (!value) continue;

      const acroName = schemaField.acroFieldName ?? schemaField.id;

      // Check if the matching PDF field is a checkbox
      const pdfField = pdfAnalysis.fields.find((f) => f.name === acroName);
      if (pdfField?.type === 'checkbox') {
        checkboxValues[acroName] = value.toLowerCase() === 'true' || value === 'da' || value === '1';
      } else {
        fieldValues[acroName] = value;
      }
    }

    const result = await fillPdfForm({
      templateBuffer: input.templateBuffer,
      fieldValues,
      checkboxValues,
      flatten: true,
    });

    console.log(
      `[EXPORT_PDF] AcroForm: filled ${result.filledFields}/${result.totalFields} fields`
    );

    return {
      buffer: result.buffer,
      contentType: 'application/pdf',
      fileExtension: 'pdf',
    };
  } else {
    // Flat PDF — use coordinate-based text overlay
    const placements: PdfFieldPlacement[] = [];

    for (const schemaField of schema.fields ?? []) {
      const value = completions[schemaField.id];
      if (!value || !schemaField.pdfPlacement) continue;

      const p = schemaField.pdfPlacement;
      placements.push({
        fieldId: schemaField.id,
        value,
        page: p.page,
        x: p.x,
        y: p.y,
        fontSize: p.fontSize ?? 10,
        multiline: p.multiline,
        maxWidth: p.width,
      });
    }

    const buffer = await fillFlatPdf({
      templateBuffer: input.templateBuffer,
      fieldPlacements: placements,
    });

    console.log(`[EXPORT_PDF] Flat PDF: placed ${placements.length} fields`);

    return {
      buffer,
      contentType: 'application/pdf',
      fileExtension: 'pdf',
    };
  }
}
