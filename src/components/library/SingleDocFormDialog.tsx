'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  Upload,
  FileText,
  AlertCircle,
  Loader2,
  Trash2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useTemplate, useModel } from '@/lib/hooks/use-library';
import { EXTENSION_TO_MIME } from '@/lib/utils/validation';
import type { ReactNode } from 'react';

type LibraryType = 'template' | 'model';

interface SingleDocFormDialogProps {
  itemId: string | null;
  type: LibraryType;
  icon: ReactNode;
  onClose: () => void;
  onSaved: () => void;
}

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.doc,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.tiff,.tif';
const ACCEPTED_EXTS = new Set(['pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'jpg', 'jpeg', 'png', 'tiff', 'tif']);
const MAX_SIZE_MB = 25;

function validateFile(file: File): string | null {
  if (file.size === 0) return 'File is empty';
  if (file.size > MAX_SIZE_MB * 1024 * 1024) return `Too large (max ${MAX_SIZE_MB}MB)`;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ext) return 'No file extension';
  if (!ACCEPTED_EXTS.has(ext)) return `Unsupported format (.${ext})`;
  if (file.type && file.type !== 'application/octet-stream') {
    const expectedMime = EXTENSION_TO_MIME[`.${ext}`];
    if (expectedMime && file.type !== expectedMime) {
      const isJpegVariant = file.type === 'image/jpeg' && (ext === 'jpg' || ext === 'jpeg');
      const isTiffVariant = file.type === 'image/tiff' && (ext === 'tiff' || ext === 'tif');
      if (!isJpegVariant && !isTiffVariant) return 'File type mismatch';
    }
  }
  return null;
}

function useItemHook(type: LibraryType, id: string | null) {
  const templateHook = useTemplate(type === 'template' ? id : null);
  const modelHook = useModel(type === 'model' ? id : null);
  return type === 'template' ? templateHook : modelHook;
}

function uploadDocument(
  file: File,
  type: LibraryType,
  itemId: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);

    const segment = type === 'template' ? 'templates' : 'models';
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/library/${segment}/${itemId}/document`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          reject(new Error(typeof data.error === 'string' ? data.error : `Upload failed (${xhr.status})`));
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(formData);
  });
}

export function SingleDocFormDialog({ itemId, type, icon, onClose, onSaved }: SingleDocFormDialogProps) {
  const prefix = type === 'template' ? 'library.templates' : 'library.models';
  const t = useTranslations(prefix);
  const tc = useTranslations('common');
  const { item, mutate: mutateItem } = useItemHook(type, itemId);
  const [pendingFile, setPendingFile] = useState<{ file: File; error?: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const uploadingRef = useRef(false);

  const handleFile = useCallback((file: File) => {
    const error = validateFile(file);
    setPendingFile({ file, error: error ?? undefined });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const doUpload = async () => {
    if (!itemId || !pendingFile || pendingFile.error || uploadingRef.current) return;
    uploadingRef.current = true;
    setIsUploading(true);
    setActionError(null);
    setUploadProgress(0);

    try {
      await uploadDocument(pendingFile.file, type, itemId, setUploadProgress);
      setPendingFile(null);
      await mutateItem();
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('errors.uploadFailed');
      setActionError(message);
    } finally {
      uploadingRef.current = false;
      setIsUploading(false);
    }
  };

  const removeDocument = async () => {
    if (!itemId) return;
    setIsRemoving(true);
    setActionError(null);

    try {
      const segment = type === 'template' ? 'templates' : 'models';
      const res = await fetch(`/api/library/${segment}/${itemId}/document`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      await mutateItem();
      onSaved();
    } catch {
      setActionError(t('errors.uploadFailed'));
    } finally {
      setIsRemoving(false);
    }
  };

  const startEdit = () => {
    if (!item) return;
    setEditName(item.name);
    setEditDescription(item.description ?? '');
    setIsEditing(true);
  };

  const saveEdit = async () => {
    if (!itemId || !editName.trim()) return;
    setActionError(null);

    try {
      const segment = type === 'template' ? 'templates' : 'models';
      const res = await fetch(`/api/library/${segment}/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      setIsEditing(false);
      await mutateItem();
      onSaved();
    } catch {
      setActionError(tc('error'));
    }
  };

  const openFilePicker = useCallback(() => {
    if (isUploading) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPTED_EXTENSIONS;
    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files?.[0]) handleFile(target.files[0]);
    };
    input.click();
  }, [isUploading, handleFile]);

  // Auto-poll when item is processing (every 3 seconds)
  useEffect(() => {
    if (!item || item.status !== 'processing') return;
    const interval = setInterval(() => {
      mutateItem();
    }, 3000);
    return () => clearInterval(interval);
  }, [item?.status, mutateItem]);

  const existingDoc = item?.documents[0];

  if (!item) {
    return (
      <DialogOverlay onClose={onClose}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
        </div>
      </DialogOverlay>
    );
  }

  return (
    <DialogOverlay onClose={onClose}>
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50">
            {icon}
          </div>
          {isEditing ? (
            <div className="space-y-1">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="border-b border-gray-300 bg-transparent text-sm font-semibold text-gray-900 focus:border-primary-500 focus:outline-none"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
              />
              <input
                type="text"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder={type === 'template' ? t('templateDescriptionPlaceholder') : t('modelDescriptionPlaceholder')}
                className="block w-full border-b border-gray-200 bg-transparent text-xs text-gray-500 placeholder-gray-400 focus:border-primary-500 focus:outline-none"
              />
            </div>
          ) : (
            <div
              onClick={startEdit}
              className="cursor-pointer rounded-lg px-1 transition-colors hover:bg-gray-50"
            >
              <h2 className="font-heading text-sm font-semibold text-gray-900">
                {item.name}
              </h2>
              {item.description && (
                <p className="text-xs text-gray-500">{item.description}</p>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isEditing && (
            <>
              <button
                onClick={saveEdit}
                disabled={!editName.trim()}
                className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-40"
              >
                {tc('save')}
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
              >
                {tc('cancel')}
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
        {actionError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{actionError}</span>
            <button onClick={() => setActionError(null)} className="ml-auto text-gray-400 hover:text-gray-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Existing document */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{t('document')}</h3>

          {existingDoc ? (
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
              <FileText className="h-4 w-4 flex-shrink-0 text-gray-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-gray-700">{existingDoc.originalFilename}</p>
                <p className="text-xs text-gray-400">
                  {(existingDoc.sizeBytes / (1024 * 1024)).toFixed(1)} MB &middot; {existingDoc.format.toUpperCase()}
                </p>
              </div>
              <button
                onClick={removeDocument}
                disabled={isRemoving}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                title={t('replaceDocument')}
              >
                {isRemoving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-400">{t('noDocument')}</p>
          )}
        </div>

        {/* AI Processing status */}
        {existingDoc && item.status === 'processing' && (
          <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            <div>
              <p className="text-sm font-medium text-blue-800">{t('processing.inProgress')}</p>
              <p className="text-xs text-blue-600">{t('processing.description')}</p>
            </div>
          </div>
        )}

        {existingDoc && item.status === 'ready' && (
          <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <div>
              <p className="text-sm font-medium text-green-800">{t('processing.ready')}</p>
              <p className="text-xs text-green-600">{t('processing.readyDescription')}</p>
            </div>
          </div>
        )}

        {existingDoc && item.status === 'error' && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <XCircle className="h-4 w-4 text-red-600" />
            <div>
              <p className="text-sm font-medium text-red-800">{t('processing.failed')}</p>
              <p className="text-xs text-red-600">
                {(item.processedData as Record<string, unknown>)?.error
                  ? String((item.processedData as Record<string, unknown>).error)
                  : t('processing.failedDescription')}
              </p>
            </div>
          </div>
        )}

        {/* Upload zone */}
        {!existingDoc && (
          <div>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={openFilePicker}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-colors',
                isDragging ? 'border-primary-400 bg-primary-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'
              )}
            >
              <Upload className={cn('h-6 w-6', isDragging ? 'text-primary-500' : 'text-gray-400')} />
              <p className="mt-2 text-sm text-gray-600">{t('dropFile')}</p>
              <p className="mt-1 text-xs text-gray-400">{t('acceptedFormats')}</p>
            </div>
          </div>
        )}

        {/* Pending file */}
        {pendingFile && (
          <div
            className={cn(
              'rounded-xl border px-4 py-3',
              pendingFile.error ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'
            )}
          >
            <div className="flex items-center gap-3">
              {pendingFile.error ? (
                <AlertCircle className="h-4 w-4 flex-shrink-0 text-error" />
              ) : isUploading ? (
                <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-blue-500" />
              ) : (
                <FileText className="h-4 w-4 flex-shrink-0 text-gray-400" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{pendingFile.file.name}</span>
              <span className="flex-shrink-0 text-xs text-gray-400">
                {(pendingFile.file.size / (1024 * 1024)).toFixed(1)} MB
              </span>
              {!isUploading && (
                <button onClick={() => setPendingFile(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {isUploading && (
              <div className="mt-2 ml-7 mr-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="mt-0.5 text-right text-xs text-blue-500">{uploadProgress}%</p>
              </div>
            )}
            {pendingFile.error && (
              <p className="mt-1.5 ml-7 text-sm font-medium text-error">{pendingFile.error}</p>
            )}

            {!pendingFile.error && !isUploading && (
              <button
                onClick={doUpload}
                className="mt-3 w-full rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
              >
                {tc('upload')}
              </button>
            )}
          </div>
        )}
      </div>
    </DialogOverlay>
  );
}

/* ── Dialog overlay wrapper ── */

function DialogOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-xl rounded-2xl border border-gray-200 bg-white shadow-xl">
        {children}
      </div>
    </div>
  );
}
