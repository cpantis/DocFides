import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/mock-auth';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

/**
 * GET /api/documents/browse?path=/some/dir
 *
 * Lists the contents of a directory on the server.
 * Returns folders and supported document files separately.
 * Used by the FolderBrowserModal to let users navigate
 * the server filesystem and pick a folder.
 */

const SUPPORTED_EXTENSIONS = new Set([
  '.pdf', '.docx', '.xlsx', '.xls',
  '.png', '.jpg', '.jpeg', '.tiff', '.tif',
]);

interface DirEntry {
  name: string;
  isDirectory: boolean;
  size?: number;
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const requestedPath = req.nextUrl.searchParams.get('path');
  const dirPath = requestedPath || os.homedir();

  // Resolve to absolute (handles both Windows and Unix paths)
  const resolved = path.resolve(dirPath);

  try {
    await fs.access(resolved);
  } catch {
    return NextResponse.json(
      { error: 'Directory not found', path: resolved },
      { status: 404 }
    );
  }

  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) {
    return NextResponse.json(
      { error: 'Path is not a directory', path: resolved },
      { status: 400 }
    );
  }

  try {
    const entries = await fs.readdir(resolved, { withFileTypes: true });

    const folders: DirEntry[] = [];
    const files: DirEntry[] = [];

    for (const entry of entries) {
      // Skip hidden files/folders (starting with .)
      if (entry.name.startsWith('.')) continue;

      if (entry.isDirectory()) {
        folders.push({ name: entry.name, isDirectory: true });
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          try {
            const fileStat = await fs.stat(path.join(resolved, entry.name));
            files.push({ name: entry.name, isDirectory: false, size: fileStat.size });
          } catch {
            // Skip files we can't stat
          }
        }
      }
    }

    // Sort alphabetically
    folders.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      data: {
        path: resolved,
        parent: path.dirname(resolved) !== resolved ? path.dirname(resolved) : null,
        separator: path.sep,
        folders,
        files,
      },
    });
  } catch (error) {
    console.error('[BROWSE]', error);
    return NextResponse.json(
      { error: 'Cannot read directory', path: resolved },
      { status: 403 }
    );
  }
}
