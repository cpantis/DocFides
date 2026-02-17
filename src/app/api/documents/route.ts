import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { z } from 'zod';
import { connectToDatabase, DocumentModel, Project } from '@/lib/db';
import { uploadDocumentSchema, validateFileSize, validateMimeType, MAX_SOURCE_FILES, MAX_MODEL_FILES } from '@/lib/utils/validation';
import { hashFile } from '@/lib/utils/hash';
import { generateR2Key } from '@/lib/storage/upload';
import { isR2Configured, uploadFileLocal } from '@/lib/storage/dev-storage';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const projectId = formData.get('projectId') as string;
    const role = formData.get('role') as string;

    uploadDocumentSchema.parse({ projectId, role });

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!validateMimeType(file.type)) {
      return NextResponse.json({ error: 'Unsupported file format' }, { status: 400 });
    }

    if (!validateFileSize(file.size)) {
      return NextResponse.json({ error: 'File too large (max 25MB)' }, { status: 400 });
    }

    await connectToDatabase();

    const project = await Project.findOne({ _id: projectId, userId });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Check file limits
    if (role === 'source') {
      const sourceCount = await DocumentModel.countDocuments({ projectId, role: 'source', status: { $ne: 'deleted' } });
      if (sourceCount >= MAX_SOURCE_FILES) {
        return NextResponse.json({ error: `Maximum ${MAX_SOURCE_FILES} source files allowed` }, { status: 400 });
      }
    } else if (role === 'model') {
      const modelCount = await DocumentModel.countDocuments({ projectId, role: 'model', status: { $ne: 'deleted' } });
      if (modelCount >= MAX_MODEL_FILES) {
        return NextResponse.json({ error: `Maximum ${MAX_MODEL_FILES} model files allowed` }, { status: 400 });
      }
    } else if (role === 'template') {
      const templateExists = await DocumentModel.findOne({ projectId, role: 'template', status: { $ne: 'deleted' } });
      if (templateExists) {
        return NextResponse.json({ error: 'Only one template file allowed' }, { status: 400 });
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256 = await hashFile(buffer);
    const r2Key = generateR2Key(userId, projectId, file.name);

    // Upload to R2 or local filesystem
    const useR2 = isR2Configured();
    if (useR2) {
      const { uploadFile } = await import('@/lib/storage/upload');
      await uploadFile(r2Key, buffer, file.type);
    } else {
      console.log('[DOCUMENTS_POST] R2 not configured, using local storage');
      await uploadFileLocal(r2Key, buffer, file.type);
    }

    const format = file.name.split('.').pop()?.toLowerCase() ?? 'unknown';

    // Always start as 'uploaded' — only mark 'extracted' after successful extraction
    const doc = await DocumentModel.create({
      projectId,
      userId,
      originalFilename: file.name,
      role,
      format,
      sizeBytes: file.size,
      sha256,
      r2Key,
      mimeType: file.type,
      status: 'uploaded',
      deleteAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h TTL
    });

    // Update project document references
    if (role === 'source') {
      await Project.findByIdAndUpdate(projectId, { $push: { sourceDocuments: doc._id } });
    } else if (role === 'template') {
      await Project.findByIdAndUpdate(projectId, { templateDocument: doc._id });
    } else if (role === 'model') {
      await Project.findByIdAndUpdate(projectId, { $push: { modelDocuments: doc._id } });
    }

    // Queue OCR/parsing job only when R2 + Redis are configured
    if (useR2 && (role === 'source' || role === 'template')) {
      try {
        const { getOcrQueue } = await import('@/lib/queue/queues');
        const ocrQueue = getOcrQueue();
        await ocrQueue.add(
          `ocr-${doc._id}`,
          {
            documentId: String(doc._id),
            projectId,
            r2Key,
            filename: file.name,
            mimeType: file.type,
            sha256,
          },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
          }
        );
      } catch (queueError) {
        console.error('[DOCUMENTS_POST] Failed to queue OCR job:', queueError);
      }
    }

    // In dev mode, extract text immediately so the AI pipeline can use it
    if (!useR2) {
      try {
        const { extractAndStoreText } = await import('@/lib/parsing/dev-extract');
        await extractAndStoreText(
          String(doc._id),
          projectId,
          r2Key,
          file.name,
          file.type,
          sha256
        );

        // Mark as extracted only after successful extraction
        await DocumentModel.findByIdAndUpdate(doc._id, { status: 'extracted' });

        // Delete original file — only structured data is kept
        try {
          const { deleteFileLocal } = await import('@/lib/storage/dev-storage');
          await deleteFileLocal(r2Key);
        } catch (cleanupError) {
          console.error('[DOCUMENTS_POST] File cleanup failed (non-fatal):', cleanupError);
        }
      } catch (extractError) {
        console.error('[DOCUMENTS_POST] Dev text extraction failed:', extractError);
        // Mark as failed so the pipeline and UI know extraction didn't work
        await DocumentModel.findByIdAndUpdate(doc._id, {
          status: 'failed',
          parsingErrors: [String(extractError)],
        });
      }
    }

    // Re-fetch to return the actual current status (may have changed to 'extracted' or 'failed')
    const updatedDoc = await DocumentModel.findById(doc._id).lean();
    return NextResponse.json({ data: updatedDoc ?? doc }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[DOCUMENTS_POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
