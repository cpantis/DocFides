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
  Building2,
  Plus,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useEntity, type EntityDocument } from '@/lib/hooks/use-entities';
import { EXTENSION_TO_MIME } from '@/lib/utils/validation';

interface EntityFormDialogProps {
  entityId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.doc,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.tiff,.tif';
const ACCEPTED_EXTS = new Set(['pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'jpg', 'jpeg', 'png', 'tiff', 'tif']);
const MAX_SIZE_MB = 25;
const MAX_ENTITY_DOCUMENTS = 10;

interface PendingFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

let fileCounter = 0;
function nextFileId(): string {
  return `efile_${++fileCounter}_${Date.now()}`;
}

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

function uploadEntityDocument(
  file: File,
  entityId: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/library/entities/${entityId}/documents`);

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

export function EntityFormDialog({ entityId, onClose, onSaved }: EntityFormDialogProps) {
  const t = useTranslations('library.entities');
  const tc = useTranslations('common');
  const { entity, mutate: mutateEntity } = useEntity(entityId);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [removingDocId, setRemovingDocId] = useState<string | null>(null);
  const uploadingRef = useRef(false);

  const existingDocCount = entity?.documents.length ?? 0;
  const remainingSlots = MAX_ENTITY_DOCUMENTS - existingDocCount;

  const handleFiles = useCallback((fileList: FileList) => {
    const activeCount = pendingFiles.filter((f) => f.status === 'pending' || f.status === 'uploading').length;
    const slotsAvailable = remainingSlots - activeCount;

    let validCount = 0;
    const newFiles: PendingFile[] = Array.from(fileList).map((file) => {
      const error = validateFile(file);
      if (error) {
        return { id: nextFileId(), file, status: 'error' as const, progress: 0, error };
      }
      if (validCount >= slotsAvailable) {
        return {
          id: nextFileId(),
          file,
          status: 'error' as const,
          progress: 0,
          error: t('maxDocuments', { max: MAX_ENTITY_DOCUMENTS }),
        };
      }
      validCount++;
      return { id: nextFileId(), file, status: 'pending' as const, progress: 0 };
    });
    setPendingFiles((prev) => [...prev, ...newFiles]);
  }, [remainingSlots, pendingFiles, t]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const removePendingFile = (fileId: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const doUpload = async () => {
    if (!entityId || uploadingRef.current) return;
    uploadingRef.current = true;
    setIsUploading(true);
    setActionError(null);

    try {
      const pending = pendingFiles.filter((f) => f.status === 'pending');

      for (const item of pending) {
        setPendingFiles((prev) =>
          prev.map((f) => f.id === item.id ? { ...f, status: 'uploading' as const, progress: 0 } : f)
        );

        try {
          await uploadEntityDocument(item.file, entityId, (percent) => {
            setPendingFiles((prev) =>
              prev.map((f) => f.id === item.id ? { ...f, progress: percent } : f)
            );
          });
          setPendingFiles((prev) =>
            prev.map((f) => f.id === item.id ? { ...f, status: 'success' as const, progress: 100 } : f)
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : t('errors.uploadFailed');
          setPendingFiles((prev) =>
            prev.map((f) => f.id === item.id ? { ...f, status: 'error' as const, error: message } : f)
          );
        }
      }

      await mutateEntity();
      onSaved();
      setPendingFiles((prev) => prev.filter((f) => f.status !== 'success'));
    } finally {
      uploadingRef.current = false;
      setIsUploading(false);
    }
  };

  const removeExistingDocument = async (docId: string) => {
    if (!entityId) return;
    setRemovingDocId(docId);
    setActionError(null);

    try {
      const res = await fetch(`/api/library/entities/${entityId}/documents/${docId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error();
      await mutateEntity();
      onSaved();
    } catch {
      setActionError(t('errors.removeDocFailed'));
    } finally {
      setRemovingDocId(null);
    }
  };

  const startEdit = () => {
    if (!entity) return;
    setEditName(entity.name);
    setEditDescription(entity.description ?? '');
    setIsEditing(true);
  };

  const saveEdit = async () => {
    if (!entityId || !editName.trim()) return;
    setActionError(null);

    try {
      const res = await fetch(`/api/library/entities/${entityId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      setIsEditing(false);
      await mutateEntity();
      onSaved();
    } catch {
      setActionError(tc('error'));
    }
  };

  const openFilePicker = useCallback(() => {
    if (isUploading) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = ACCEPTED_EXTENSIONS;
    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files) handleFiles(target.files);
    };
    input.click();
  }, [isUploading, handleFiles]);

  // Auto-poll when entity is processing (every 3 seconds)
  useEffect(() => {
    if (!entity || entity.status !== 'processing') return;
    const interval = setInterval(() => {
      mutateEntity();
    }, 3000);
    return () => clearInterval(interval);
  }, [entity?.status, mutateEntity]);

  const hasPending = pendingFiles.some((f) => f.status === 'pending');

  if (!entity) {
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
            <Building2 className="h-5 w-5 text-primary-600" />
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
                placeholder={t('entityDescriptionPlaceholder')}
                className="block w-full border-b border-gray-200 bg-transparent text-xs text-gray-500 placeholder-gray-400 focus:border-primary-500 focus:outline-none"
              />
            </div>
          ) : (
            <div
              onClick={startEdit}
              className="cursor-pointer rounded-lg px-1 transition-colors hover:bg-gray-50"
            >
              <h2 className="font-heading text-sm font-semibold text-gray-900">
                {entity.name}
              </h2>
              {entity.description && (
                <p className="text-xs text-gray-500">{entity.description}</p>
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

        {/* Existing documents */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            {t('documents')}
            <span className="ml-2 text-xs font-normal text-gray-400">
              {t('documentCount', { count: existingDocCount })}
            </span>
          </h3>

          {entity.documents.length > 0 ? (
            <div className="mt-3 space-y-2">
              {entity.documents.map((doc: EntityDocument) => (
                <div
                  key={doc._id}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3"
                >
                  <FileText className="h-4 w-4 flex-shrink-0 text-gray-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-gray-700">
                      {doc.originalFilename}
                    </p>
                    <p className="text-xs text-gray-400">
                      {(doc.sizeBytes / (1024 * 1024)).toFixed(1)} MB &middot; {doc.format.toUpperCase()}
                    </p>
                  </div>
                  <button
                    onClick={() => removeExistingDocument(doc._id)}
                    disabled={removingDocId === doc._id}
                    className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                    title={t('removeDocument')}
                  >
                    {removingDocId === doc._id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-400">{t('noDocuments')}</p>
          )}
        </div>

        {/* AI Processing status */}
        {entity.documents.length > 0 && entity.status === 'processing' && (
          <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            <div>
              <p className="text-sm font-medium text-blue-800">{t('processing.inProgress')}</p>
              <p className="text-xs text-blue-600">{t('processing.description')}</p>
            </div>
          </div>
        )}

        {entity.documents.length > 0 && entity.status === 'ready' && (
          <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <div>
              <p className="text-sm font-medium text-green-800">{t('processing.ready')}</p>
              <p className="text-xs text-green-600">{t('processing.readyDescription')}</p>
            </div>
          </div>
        )}

        {entity.documents.length > 0 && entity.status === 'error' && (
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <XCircle className="h-4 w-4 text-red-600" />
            <div>
              <p className="text-sm font-medium text-red-800">{t('processing.failed')}</p>
              <p className="text-xs text-red-600">
                {(entity.processedData as Record<string, unknown>)?.error
                  ? String((entity.processedData as Record<string, unknown>).error)
                  : t('processing.failedDescription')}
              </p>
            </div>
          </div>
        )}

        {/* Add documents section */}
        {remainingSlots > 0 && (
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Plus className="h-4 w-4" />
              {t('addDocument')}
            </h3>

            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={openFilePicker}
              className={cn(
                'mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-colors',
                isDragging ? 'border-primary-400 bg-primary-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'
              )}
            >
              <Upload className={cn('h-6 w-6', isDragging ? 'text-primary-500' : 'text-gray-400')} />
              <p className="mt-2 text-sm text-gray-600">{t('dropFiles')}</p>
              <p className="mt-1 text-xs text-gray-400">
                {t('maxDocuments', { max: String(remainingSlots) })}
              </p>
            </div>
          </div>
        )}

        {/* Pending files list */}
        {pendingFiles.length > 0 && (
          <div className="space-y-2">
            {pendingFiles.map((item) => (
              <div
                key={item.id}
                className={cn(
                  'rounded-xl border px-4 py-3',
                  item.status === 'error' ? 'border-red-200 bg-red-50' :
                  item.status === 'success' ? 'border-green-200 bg-green-50' :
                  item.status === 'uploading' ? 'border-blue-200 bg-blue-50' :
                  'border-gray-200 bg-white'
                )}
              >
                <div className="flex items-center gap-3">
                  {item.status === 'error' ? (
                    <AlertCircle className="h-4 w-4 flex-shrink-0 text-error" />
                  ) : item.status === 'uploading' ? (
                    <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-blue-500" />
                  ) : (
                    <FileText className="h-4 w-4 flex-shrink-0 text-gray-400" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{item.file.name}</span>
                  <span className="flex-shrink-0 text-xs text-gray-400">
                    {(item.file.size / (1024 * 1024)).toFixed(1)} MB
                  </span>
                  {(item.status === 'pending' || item.status === 'error') && (
                    <button onClick={() => removePendingFile(item.id)} className="text-gray-400 hover:text-gray-600">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {item.status === 'uploading' && (
                  <div className="mt-2 ml-7 mr-1">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-200"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-right text-xs text-blue-500">{item.progress}%</p>
                  </div>
                )}
                {item.error && (
                  <p className="mt-1.5 ml-7 text-sm font-medium text-error">{item.error}</p>
                )}
              </div>
            ))}

            {hasPending && (
              <button
                onClick={doUpload}
                disabled={isUploading}
                className="w-full rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
              >
                {isUploading
                  ? tc('processing')
                  : `${tc('upload')} ${pendingFiles.filter((f) => f.status === 'pending').length}`}
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
