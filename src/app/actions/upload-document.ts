'use server';

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
import { saveTempFile, generateStorageKey } from '@/lib/storage/tmp-storage';

interface UploadResult {
  success: boolean;
  documentId?: string;
  error?: string;
}

export async function uploadDocument(formData: FormData): Promise<UploadResult> {
  try {
    console.log('[UPLOAD] Step 1: auth');
    const { userId } = await auth();
    if (!userId) return { success: false, error: 'Unauthorized' };

    const file = formData.get('file') as File | null;
    const projectId = formData.get('projectId') as string;
    const role = formData.get('role') as string;
    const tagId = formData.get('tagId') as string | null;

    console.log('[UPLOAD] Step 2: validate schema', { projectId, role, fileName: file?.name, fileSize: file?.size });
    uploadDocumentSchema.parse({ projectId, role });

    if (!file) {
      return { success: false, error: 'No file provided' };
    }

    // Resolve MIME type from both declared type and extension (browsers may send generic types)
    const mimeType = resolveMimeType(file.type, file.name);

    if (!validateMimeType(mimeType)) {
      return { success: false, error: 'Unsupported file format' };
    }

    if (!validateFileSize(file.size)) {
      return { success: false, error: 'File too large (max 25MB)' };
    }

    console.log('[UPLOAD] Step 3: connect to DB');
    await connectToDatabase();

    const project = await Project.findOne({ _id: projectId, userId });
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    // Check file limits
    console.log('[UPLOAD] Step 4: check file limits');
    if (role === 'source') {
      const sourceCount = await DocumentModel.countDocuments({ projectId, role: 'source', status: { $ne: 'deleted' } });
      if (sourceCount >= MAX_SOURCE_FILES) {
        return { success: false, error: `Maximum ${MAX_SOURCE_FILES} source files allowed` };
      }
    } else if (role === 'model') {
      const modelCount = await DocumentModel.countDocuments({ projectId, role: 'model', status: { $ne: 'deleted' } });
      if (modelCount >= MAX_MODEL_FILES) {
        return { success: false, error: `Maximum ${MAX_MODEL_FILES} model files allowed` };
      }
    } else if (role === 'template') {
      const templateExists = await DocumentModel.findOne({ projectId, role: 'template', status: { $ne: 'deleted' } });
      if (templateExists) {
        return { success: false, error: 'Only one template file allowed' };
      }
    }

    console.log('[UPLOAD] Step 5: read file buffer');
    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256 = await hashFile(buffer);
    const storageKey = generateStorageKey(userId, projectId, file.name);

    console.log('[UPLOAD] Step 6: save to /tmp');
    await saveTempFile(storageKey, buffer);

    const format = file.name.split('.').pop()?.toLowerCase() ?? 'unknown';

    console.log('[UPLOAD] Step 7: create document in DB');
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
      ...(tagId && role === 'source' ? { tagId } : {}),
    });

    // Update project document references
    console.log('[UPLOAD] Step 8: update project refs');
    if (role === 'source') {
      await Project.findByIdAndUpdate(projectId, { $push: { sourceDocuments: doc._id } });
    } else if (role === 'template') {
      await Project.findByIdAndUpdate(projectId, { templateDocument: doc._id });
    } else if (role === 'model') {
      await Project.findByIdAndUpdate(projectId, { $push: { modelDocuments: doc._id } });
    }

    console.log('[UPLOAD] Step 9: done, returning documentId:', doc._id.toString());
    return { success: true, documentId: doc._id.toString() };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors.map((e) => e.message).join(', ') };
    }
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[UPLOAD_DOCUMENT] Failed:', msg, error);
    return { success: false, error: msg || 'Internal server error' };
  }
}
