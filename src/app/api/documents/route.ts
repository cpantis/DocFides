import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { z } from 'zod';
import { connectToDatabase, DocumentModel, Project } from '@/lib/db';
import {
  uploadDocumentSchema,
  validateFileSize,
  validateMimeType,
  resolveMimeType,
  MAX_SOURCE_FILES,
  MAX_MODEL_FILES,
} from '@/lib/utils/validation';
import { hashFile } from '@/lib/utils/hash';
import { saveTempFile, deleteTempFile, generateStorageKey } from '@/lib/storage/tmp-storage';

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

    // Resolve MIME type from both declared type and extension (browsers may send generic types)
    const mimeType = resolveMimeType(file.type, file.name);

    if (!validateMimeType(mimeType)) {
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
    const storageKey = generateStorageKey(userId, projectId, file.name);

    // Save to /tmp for pipeline parser stage (may re-read if re-parsing needed)
    await saveTempFile(storageKey, buffer);

    const format = file.name.split('.').pop()?.toLowerCase() ?? 'unknown';

    const doc = await DocumentModel.create({
      projectId,
      userId,
      originalFilename: file.name,
      role,
      format,
      sizeBytes: file.size,
      sha256,
      storageKey,
      mimeType,
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

    // Extract text immediately from the in-memory buffer (no re-read from disk)
    try {
      const { parseAndStore } = await import('@/lib/parsing/parse-pipeline');
      await parseAndStore(
        String(doc._id),
        projectId,
        buffer,
        file.name,
        mimeType,
        sha256
      );

      await DocumentModel.findByIdAndUpdate(doc._id, { status: 'extracted' });

      // Cleanup temp file — extraction data is now in MongoDB
      await deleteTempFile(storageKey);
    } catch (extractError) {
      console.error('[DOCUMENTS_POST] Text extraction failed:', extractError);
      await DocumentModel.findByIdAndUpdate(doc._id, {
        status: 'failed',
        parsingErrors: [String(extractError)],
      });
      // Keep temp file so pipeline parser stage can retry
    }

    // Re-fetch to return actual current status
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
