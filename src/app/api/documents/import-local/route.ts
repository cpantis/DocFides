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

type DocumentRole = 'template' | 'model' | 'source';

const importSchema = z.object({
  projectId: z.string().min(1),
  // Per-category folder paths
  templatePath: z.string().optional(),
  modelPath: z.string().optional(),
  sourcePath: z.string().optional(),
  // Legacy: single base path with template/model/source subfolders
  folderPath: z.string().optional(),
  // Scan only (list files without importing)
  scanOnly: z.boolean().optional(),
});

interface ScannedFile {
  filename: string;
  role: string;
  size: number;
  path: string;
  alreadyImported: boolean;
}

/**
 * POST /api/documents/import-local
 *
 * Imports documents from local folders, one per category.
 * Accepts either per-category paths or a single base path with subfolders.
 *
 * Per-category mode:
 *   { templatePath: "/path/to/templates", sourcePath: "/path/to/sources", modelPath: "/path/to/models" }
 *
 * Legacy mode (base path with subfolders):
 *   { folderPath: "/path/to/dev-documents" }
 *   Expects: template/, model/, source/ subfolders
 *
 * Scan mode:
 *   { scanOnly: true, ... } — returns file list without importing
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = importSchema.parse(await req.json());

    await connectToDatabase();

    const project = await Project.findOne({ _id: body.projectId, userId });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Resolve folder paths per category
    const categoryPaths = resolveCategoryPaths(body);

    // Scan all categories
    const scanned: ScannedFile[] = [];
    const scanErrors: string[] = [];

    for (const [role, dirPath] of Object.entries(categoryPaths)) {
      if (!dirPath) continue;

      try {
        await fs.access(dirPath);
      } catch {
        if (role !== 'model') {
          scanErrors.push(`Folder not found: ${dirPath}`);
        }
        continue;
      }

      const entries = await fs.readdir(dirPath);
      const files = entries.filter((f) => !f.startsWith('.'));

      for (const filename of files) {
        const ext = path.extname(filename).toLowerCase();
        const mimeType = MIME_MAP[ext];

        if (!mimeType) {
          scanErrors.push(`Skipping ${filename} — unsupported format (${ext})`);
          continue;
        }

        const filePath = path.join(dirPath, filename);
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) continue;

        // Check if already imported
        const existing = await DocumentModel.findOne({
          projectId: body.projectId,
          role,
          originalFilename: filename,
          status: { $ne: 'deleted' },
        });

        scanned.push({
          filename,
          role,
          size: stat.size,
          path: filePath,
          alreadyImported: !!existing,
        });
      }
    }

    // If scan-only mode, return file list
    if (body.scanOnly) {
      return NextResponse.json({
        data: {
          files: scanned.map(({ filename, role, size, alreadyImported }) => ({
            filename,
            role,
            size,
            alreadyImported,
          })),
          errors: scanErrors,
          paths: categoryPaths,
        },
      });
    }

    // Import files that haven't been imported yet
    const imported: Array<{ filename: string; role: string; size: number }> = [];
    const importErrors: string[] = [...scanErrors];

    for (const file of scanned) {
      if (file.alreadyImported) {
        importErrors.push(`Skipping ${file.role}/${file.filename} — already imported`);
        continue;
      }

      const ext = path.extname(file.filename).toLowerCase();
      const mimeType = MIME_MAP[ext]!;
      const format = ext.replace('.', '');

      const buffer = await fs.readFile(file.path);
      const sha256 = await hashFile(buffer);
      const r2Key = generateR2Key(userId, body.projectId, file.filename);

      // Save to local storage
      await uploadFileLocal(r2Key, buffer, mimeType);

      // Create document record
      const doc = await DocumentModel.create({
        projectId: body.projectId,
        userId,
        originalFilename: file.filename,
        role: file.role,
        format,
        sizeBytes: buffer.length,
        sha256,
        r2Key,
        mimeType,
        status: 'extracted',
        deleteAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      // Update project references
      if (file.role === 'source') {
        await Project.findByIdAndUpdate(body.projectId, { $push: { sourceDocuments: doc._id } });
      } else if (file.role === 'template') {
        await Project.findByIdAndUpdate(body.projectId, { templateDocument: doc._id });
      } else if (file.role === 'model') {
        await Project.findByIdAndUpdate(body.projectId, { $push: { modelDocuments: doc._id } });
      }

      // Extract text and create Extraction record
      try {
        const { extractAndStoreText } = await import('@/lib/parsing/dev-extract');
        await extractAndStoreText(
          String(doc._id),
          body.projectId,
          r2Key,
          file.filename,
          mimeType,
          sha256
        );
      } catch (extractError) {
        console.error(`[IMPORT_LOCAL] Text extraction failed for ${file.filename}:`, extractError);
        importErrors.push(`Warning: text extraction failed for ${file.role}/${file.filename}`);
      }

      imported.push({ filename: file.filename, role: file.role, size: buffer.length });
    }

    return NextResponse.json({
      data: {
        imported,
        errors: importErrors,
        total: imported.length,
        paths: categoryPaths,
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

/**
 * Resolve per-category folder paths from request body.
 */
function resolveCategoryPaths(body: z.infer<typeof importSchema>): Record<DocumentRole, string | null> {
  // Per-category paths take priority
  if (body.templatePath || body.sourcePath || body.modelPath) {
    return {
      template: body.templatePath ?? null,
      model: body.modelPath ?? null,
      source: body.sourcePath ?? null,
    };
  }

  // Legacy: base path with subfolders
  const basePath = body.folderPath || path.join(process.cwd(), 'dev-documents');
  return {
    template: path.join(basePath, 'template'),
    model: path.join(basePath, 'model'),
    source: path.join(basePath, 'source'),
  };
}
