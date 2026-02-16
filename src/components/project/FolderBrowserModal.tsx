'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  X,
  Folder,
  FileText,
  ArrowUp,
  Home,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface BrowseData {
  path: string;
  requestedPath?: string;
  parent: string | null;
  separator: string;
  folders: { name: string; isDirectory: boolean }[];
  files: { name: string; isDirectory: boolean; size?: number }[];
}

interface FolderBrowserModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  initialPath?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FolderBrowserModal({ open, onClose, onSelect, initialPath }: FolderBrowserModalProps) {
  const t = useTranslations('project.upload.browser');
  const [currentPath, setCurrentPath] = useState('');
  const [data, setData] = useState<BrowseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const browse = useCallback(async (dirPath?: string) => {
    setLoading(true);
    setError('');
    try {
      const params = dirPath ? `?path=${encodeURIComponent(dirPath)}` : '';
      const res = await fetch(`/api/documents/browse${params}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to browse');
        return;
      }
      setData(json.data);
      setCurrentPath(json.data.path);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load initial directory when modal opens
  useEffect(() => {
    if (open) {
      browse(initialPath || undefined);
    }
  }, [open, initialPath, browse]);

  if (!open) return null;

  const handleSelect = () => {
    if (currentPath) {
      onSelect(currentPath);
      onClose();
    }
  };

  const handleFolderDoubleClick = (folderName: string) => {
    const sep = data?.separator || '/';
    const newPath = currentPath.endsWith(sep)
      ? currentPath + folderName
      : currentPath + sep + folderName;
    browse(newPath);
  };

  const handleGoUp = () => {
    if (data?.parent) {
      browse(data.parent);
    }
  };

  const handleGoHome = () => {
    browse(undefined);
  };

  const handlePathInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      browse(currentPath);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h3 className="font-heading text-base font-bold text-gray-900">
              {t('title')}
            </h3>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Navigation bar */}
          <div className="flex items-center gap-2 border-b border-gray-50 px-5 py-3">
            <button
              onClick={handleGoUp}
              disabled={!data?.parent}
              title={t('goUp')}
              className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-30"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
            <button
              onClick={handleGoHome}
              title={t('goHome')}
              className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100"
            >
              <Home className="h-4 w-4" />
            </button>
            <input
              type="text"
              value={currentPath}
              onChange={(e) => setCurrentPath(e.target.value)}
              onKeyDown={handlePathInputKeyDown}
              className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 font-mono text-xs text-gray-700 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>

          {/* Content */}
          <div className="h-72 overflow-y-auto px-5 py-3">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            )}

            {error && !loading && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {!loading && !error && data?.requestedPath && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-700">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                {t('pathNotFound', { path: data.requestedPath })}
              </div>
            )}

            {!loading && !error && data && (
              <div className="space-y-0.5">
                {/* Folders first */}
                {data.folders.map((folder) => (
                  <button
                    key={folder.name}
                    onDoubleClick={() => handleFolderDoubleClick(folder.name)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-primary-50"
                  >
                    <Folder className="h-4 w-4 flex-shrink-0 text-amber-500" />
                    <span className="truncate">{folder.name}</span>
                  </button>
                ))}

                {/* Files (just shown for preview, not selectable) */}
                {data.files.map((file) => (
                  <div
                    key={file.name}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-gray-400"
                  >
                    <FileText className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1 truncate">{file.name}</span>
                    {file.size != null && (
                      <span className="text-xs">{formatFileSize(file.size)}</span>
                    )}
                  </div>
                ))}

                {data.folders.length === 0 && data.files.length === 0 && (
                  <p className="py-8 text-center text-sm text-gray-400">
                    {t('emptyFolder')}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4">
            <p className="truncate font-mono text-xs text-gray-400">
              {currentPath}
            </p>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleSelect}
                disabled={!currentPath}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
              >
                {t('selectFolder')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
