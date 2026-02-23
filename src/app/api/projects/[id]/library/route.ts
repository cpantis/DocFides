import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { z } from 'zod';
import { connectToDatabase, Project, LibraryItem, DocumentModel } from '@/lib/db';
import { saveTempFile, readTempFile } from '@/lib/storage/tmp-storage';
import type { ILibraryDocument } from '@/lib/db/models/library-item';
import type { DocumentRole } from '@/lib/db/models/document';

const linkLibrarySchema = z.object({
  type: z.enum(['template', 'model', 'entity']),
  libraryItemId: z.string().min(1),
});

const unlinkLibrarySchema = z.object({
  type: z.enum(['template', 'model', 'entity']),
  libraryItemId: z.string().optional(), // For entities, which is an array
});

/**
 * Copy a library document into the project as a real DocumentModel record.
 * This ensures the pipeline can access it just like a directly uploaded file.
 */
async function copyLibraryDocToProject(
  libDoc: ILibraryDocument,
  projectId: string,
  userId: string,
  role: DocumentRole,
  tagId?: string
): Promise<string> {
  // Generate a project-scoped storage key
  const timestamp = Date.now();
  const sanitized = libDoc.originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const projectStorageKey = `${userId}/${projectId}/library_${timestamp}_${sanitized}`;

  // Copy the file: try /tmp first, then fall back to MongoDB fileData
  let fileBuffer: Buffer | null = null;
  try {
    fileBuffer = await readTempFile(libDoc.storageKey);
  } catch {
    // /tmp miss — try fetching with fileData from library item
  }

  if (!fileBuffer) {
    // Fetch the library item again, this time including fileData
    const libItem = await LibraryItem.findOne({
      'documents._id': libDoc._id,
    }).select('+documents.fileData').lean();

    const fullDoc = libItem?.documents.find(
      (d) => String(d._id) === String(libDoc._id)
    );

    if (fullDoc?.fileData) {
      fileBuffer = Buffer.isBuffer(fullDoc.fileData)
        ? fullDoc.fileData
        : Buffer.from(fullDoc.fileData as ArrayBuffer);
    }
  }

  if (fileBuffer) {
    await saveTempFile(projectStorageKey, fileBuffer);
  }

  // Create the DocumentModel record
  const doc = await DocumentModel.create({
    projectId,
    userId,
    originalFilename: libDoc.originalFilename,
    role,
    format: libDoc.format,
    sizeBytes: libDoc.sizeBytes,
    sha256: libDoc.sha256,
    storageKey: projectStorageKey,
    status: 'uploaded',
    mimeType: libDoc.mimeType,
    tagId,
    // For templates, persist fileData in MongoDB for export resilience
    ...(role === 'template' && fileBuffer ? { fileData: fileBuffer } : {}),
  });

  return String(doc._id);
}

/** POST /api/projects/[id]/library — link a library item to a project (copy on use) */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = linkLibrarySchema.parse(await req.json());

    await connectToDatabase();

    const project = await Project.findOne({ _id: id, userId });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const libraryItem = await LibraryItem.findOne({ _id: body.libraryItemId, userId, type: body.type })
      .select('-documents.fileData')
      .lean();
    if (!libraryItem) {
      return NextResponse.json({ error: 'Library item not found' }, { status: 404 });
    }

    if (!libraryItem.documents || libraryItem.documents.length === 0) {
      return NextResponse.json(
        { error: 'Library item has no documents. Upload a document first.' },
        { status: 400 }
      );
    }

    // Save metadata reference
    const ref = {
      libraryItemId: libraryItem._id,
      name: libraryItem.name,
      processedData: libraryItem.processedData,
      copiedAt: new Date(),
    };

    if (!project.libraryRefs) {
      project.libraryRefs = {};
    }

    // Copy library documents into the project as real DocumentModel records
    if (body.type === 'template') {
      project.libraryRefs.template = ref;

      // Remove existing library-sourced template document if re-linking
      const libDoc = libraryItem.documents[0]!;
      const docId = await copyLibraryDocToProject(libDoc, id, userId, 'template');
      project.templateDocument = docId as unknown as typeof project.templateDocument;

    } else if (body.type === 'model') {
      project.libraryRefs.model = ref;

      // Copy all model documents (up to 2)
      for (const libDoc of libraryItem.documents) {
        const docId = await copyLibraryDocToProject(libDoc, id, userId, 'model');
        project.modelDocuments.push(docId as unknown as typeof project.modelDocuments[0]);
      }

    } else {
      // Entity — copy documents as source docs
      if (!project.libraryRefs.entities) {
        project.libraryRefs.entities = [];
      }
      const alreadyLinked = project.libraryRefs.entities.some(
        (e) => e.libraryItemId?.toString() === body.libraryItemId
      );
      if (!alreadyLinked) {
        project.libraryRefs.entities.push(ref);

        // Copy entity documents as source documents
        for (const libDoc of libraryItem.documents) {
          const docId = await copyLibraryDocToProject(
            libDoc, id, userId, 'source'
          );
          project.sourceDocuments.push(docId as unknown as typeof project.sourceDocuments[0]);
        }
      }
    }

    project.markModified('libraryRefs');
    await project.save();

    // Increment usage count on the library item
    await LibraryItem.findByIdAndUpdate(body.libraryItemId, {
      $inc: { usageCount: 1 },
      $set: { lastUsedAt: new Date() },
    });

    return NextResponse.json({ data: project });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[PROJECT_LIBRARY_LINK]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/projects/[id]/library — unlink a library item from a project */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = unlinkLibrarySchema.parse(await req.json());

    await connectToDatabase();

    const project = await Project.findOne({ _id: id, userId });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!project.libraryRefs) {
      return NextResponse.json({ data: project });
    }

    if (body.type === 'entity' && body.libraryItemId) {
      project.libraryRefs.entities = (project.libraryRefs.entities ?? []).filter(
        (e) => e.libraryItemId?.toString() !== body.libraryItemId
      );
    } else if (body.type === 'template') {
      project.libraryRefs.template = undefined;
    } else if (body.type === 'model') {
      project.libraryRefs.model = undefined;
    }

    project.markModified('libraryRefs');
    await project.save();

    return NextResponse.json({ data: project });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[PROJECT_LIBRARY_UNLINK]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
