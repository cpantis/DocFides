import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import { connectToDatabase, DocumentModel, Project } from '@/lib/db';
import { hashFile } from '@/lib/utils/hash';
import { generateR2Key } from '@/lib/storage/upload';
import { uploadFileLocal } from '@/lib/storage/dev-storage';

const MIME_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
};

const ROLES = ['template', 'model', 'source'] as const;

const importSchema = z.object({
  projectId: z.string().min(1),
  folderPath: z.string().optional(),
});

/**
 * POST /api/documents/import-local
 *
 * Scans dev-documents/ (or a custom folder) for files organized as:
 *   template/  — template files (max 1)
 *   model/     — model files (max 2, optional)
 *   source/    — source files (max 10)
 *
 * Creates Document records in MongoDB and copies files to .uploads/.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = importSchema.parse(await req.json());
    const basePath = body.folderPath || path.join(process.cwd(), 'dev-documents');

    await connectToDatabase();

    const project = await Project.findOne({ _id: body.projectId, userId });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Check if base folder exists
    try {
      await fs.access(basePath);
    } catch {
      return NextResponse.json(
        { error: `Folder not found: ${basePath}. Create it with template/, model/, source/ subfolders.` },
        { status: 400 }
      );
    }

    const imported: Array<{ filename: string; role: string; size: number }> = [];
    const errors: string[] = [];

    for (const role of ROLES) {
      const roleDir = path.join(basePath, role);

      // Check if role directory exists
      try {
        await fs.access(roleDir);
      } catch {
        if (role === 'model') continue; // model is optional
        if (role === 'template' || role === 'source') {
          errors.push(`Missing required folder: ${role}/`);
          continue;
        }
      }

      const entries = await fs.readdir(roleDir);
      const files = entries.filter((f) => !f.startsWith('.'));

      for (const filename of files) {
        const ext = path.extname(filename).toLowerCase();
        const mimeType = MIME_MAP[ext];

        if (!mimeType) {
          errors.push(`Skipping ${role}/${filename} — unsupported format`);
          continue;
        }

        // Check if already imported (by filename + role)
        const existing = await DocumentModel.findOne({
          projectId: body.projectId,
          role,
          originalFilename: filename,
          status: { $ne: 'deleted' },
        });
        if (existing) {
          errors.push(`Skipping ${role}/${filename} — already imported`);
          continue;
        }

        const filePath = path.join(roleDir, filename);
        const buffer = await fs.readFile(filePath);
        const sha256 = await hashFile(buffer);
        const r2Key = generateR2Key(userId, body.projectId, filename);
        const format = ext.replace('.', '');

        // Save to local storage
        await uploadFileLocal(r2Key, buffer, mimeType);

        // Create document record (already extracted in dev mode)
        const doc = await DocumentModel.create({
          projectId: body.projectId,
          userId,
          originalFilename: filename,
          role,
          format,
          sizeBytes: buffer.length,
          sha256,
          r2Key,
          mimeType,
          status: 'extracted',
          deleteAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });

        // Update project references
        if (role === 'source') {
          await Project.findByIdAndUpdate(body.projectId, { $push: { sourceDocuments: doc._id } });
        } else if (role === 'template') {
          await Project.findByIdAndUpdate(body.projectId, { templateDocument: doc._id });
        } else if (role === 'model') {
          await Project.findByIdAndUpdate(body.projectId, { $push: { modelDocuments: doc._id } });
        }

        // Extract text and create Extraction record for the AI pipeline
        try {
          const { extractAndStoreText } = await import('@/lib/parsing/dev-extract');
          await extractAndStoreText(
            String(doc._id),
            body.projectId,
            r2Key,
            filename,
            mimeType,
            sha256
          );
        } catch (extractError) {
          console.error(`[IMPORT_LOCAL] Text extraction failed for ${filename}:`, extractError);
          errors.push(`Warning: text extraction failed for ${role}/${filename}`);
        }

        imported.push({ filename, role, size: buffer.length });
      }
    }

    return NextResponse.json({
      data: {
        imported,
        errors,
        total: imported.length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[IMPORT_LOCAL]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
