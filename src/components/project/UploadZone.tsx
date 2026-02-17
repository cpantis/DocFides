'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState, useEffect } from 'react';
import { Upload, X, FileText, AlertCircle, Loader2, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useTags, type Tag } from '@/lib/hooks/use-tags';
import { EXTENSION_TO_MIME, MAX_SOURCE_FILES, MAX_MODEL_FILES } from '@/lib/utils/validation';
import type { DocumentRole } from '@/lib/db/models/document';

interface UploadZoneProps {
  projectId: string;
  role: DocumentRole;
  maxFiles: number;
  existingCount: number;
  onUploadComplete?: () => void;
}

interface UploadedFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
  tagId?: string;
}

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.doc,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.tiff,.tif';
const ACCEPTED_EXTS = new Set(['pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'jpg', 'jpeg', 'png', 'tiff', 'tif']);
const MAX_SIZE_MB = 25;
const MAX_FILENAME_LENGTH = 255;

/**
 * Upload a file directly via FormData POST to /api/upload.
 * Uses XMLHttpRequest for real upload progress tracking.
 */
function uploadFileDirect(
  file: File,
  projectId: string,
  role: string,
  onProgress: (percent: number) => void,
  tagId?: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('projectId', projectId);
    formData.append('role', role);
    if (tagId) formData.append('tagId', tagId);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');

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

let fileCounter = 0;
function nextFileId(): string {
  return `file_${++fileCounter}_${Date.now()}`;
}

interface FileValidationError {
  key: string;
  params?: Record<string, string>;
}

function validateFile(
  file: File,
  slotIndex: number,
  slotsAvailable: number,
  queuedNames: Set<string>,
  role: DocumentRole,
): FileValidationError | null {
  // 1. Empty file
  if (file.size === 0) return { key: 'fileEmpty' };

  // 2. Too large
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return { key: 'fileTooLarge', params: { size: (file.size / (1024 * 1024)).toFixed(1), max: String(MAX_SIZE_MB) } };
  }

  // 3. No extension
  const dotIndex = file.name.lastIndexOf('.');
  const ext = dotIndex > 0 ? file.name.slice(dotIndex + 1).toLowerCase() : '';
  if (!ext) return { key: 'noExtension' };

  // 4. Unsupported format
  if (!ACCEPTED_EXTS.has(ext)) {
    return { key: 'unsupportedFormat', params: { ext: `.${ext}` } };
  }

  // 5. MIME type mismatch — browser says one thing, extension says another
  if (file.type && file.type !== 'application/octet-stream') {
    const expectedMime = EXTENSION_TO_MIME[`.${ext}`];
    if (expectedMime && file.type !== expectedMime) {
      const isJpegVariant = file.type === 'image/jpeg' && (ext === 'jpg' || ext === 'jpeg');
      const isTiffVariant = file.type === 'image/tiff' && (ext === 'tiff' || ext === 'tif');
      if (!isJpegVariant && !isTiffVariant) {
        return { key: 'mimeTypeSuspicious', params: { declared: file.type, expected: expectedMime } };
      }
    }
  }

  // 6. Filename too long
  if (file.name.length > MAX_FILENAME_LENGTH) {
    return { key: 'filenameTooLong', params: { length: String(file.name.length), max: String(MAX_FILENAME_LENGTH) } };
  }

  // 7. Invalid characters (control characters, null bytes)
  if (/[\x00-\x1f]/.test(file.name)) return { key: 'filenameInvalidChars' };

  // 8. Duplicate filename already in queue
  if (queuedNames.has(file.name.toLowerCase())) return { key: 'duplicateFile' };

  // 9–11. Slot limits (role-specific)
  if (slotIndex >= slotsAvailable) {
    if (role === 'source') return { key: 'maxSourceFiles', params: { max: String(MAX_SOURCE_FILES) } };
    if (role === 'model') return { key: 'maxModelFiles', params: { max: String(MAX_MODEL_FILES) } };
    return { key: 'maxTemplateFiles' };
  }

  return null;
}

export function UploadZone({ projectId, role, maxFiles, existingCount, onUploadComplete }: UploadZoneProps) {
  const t = useTranslations('project.upload');
  const tc = useTranslations('common');
  const tt = useTranslations('dashboard.tags');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const uploadingRef = useRef(false);
  const isSource = role === 'source';
  const { tags } = useTags();

  const remainingSlots = maxFiles - existingCount;

  const handleFiles = useCallback((fileList: FileList) => {
    const activeCount = files.filter((f) => f.status === 'pending' || f.status === 'uploading').length;
    const slotsAvailable = remainingSlots - activeCount;
    const queuedNames = new Set(files.map((f) => f.file.name.toLowerCase()));

    let validCount = 0;
    const uploadFiles: UploadedFile[] = Array.from(fileList).map((file) => {
      const error = validateFile(file, validCount, slotsAvailable, queuedNames, role);
      if (error) {
        return {
          id: nextFileId(),
          file,
          status: 'error' as const,
          progress: 0,
          error: t(`errors.${error.key}`, error.params),
        };
      }
      validCount++;
      queuedNames.add(file.name.toLowerCase());
      return { id: nextFileId(), file, status: 'pending' as const, progress: 0 };
    });
    setFiles((prev) => [...prev, ...uploadFiles]);
  }, [remainingSlots, files, role, t]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const doUpload = async () => {
    // Guard against double-click
    if (uploadingRef.current) return;
    uploadingRef.current = true;
    setIsUploading(true);

    try {
      // Snapshot pending files with their IDs
      const pendingFiles = files.filter((f) => f.status === 'pending');

      for (const item of pendingFiles) {
        // Mark as uploading by ID (safe across state changes)
        setFiles((prev) =>
          prev.map((f) => f.id === item.id ? { ...f, status: 'uploading' as const, progress: 0 } : f)
        );

        try {
          await uploadFileDirect(
            item.file,
            projectId,
            role,
            (percent) => {
              setFiles((prev) =>
                prev.map((f) => f.id === item.id ? { ...f, progress: percent } : f)
              );
            },
            item.tagId,
          );

          setFiles((prev) =>
            prev.map((f) => f.id === item.id ? { ...f, status: 'success' as const, progress: 100 } : f)
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : t('errors.fileReadError');
          setFiles((prev) =>
            prev.map((f) => f.id === item.id ? { ...f, status: 'error' as const, error: message } : f)
          );
        }
      }

      onUploadComplete?.();

      // Clear successfully uploaded files from local state
      setFiles((prev) => prev.filter((f) => f.status !== 'success'));
    } finally {
      uploadingRef.current = false;
      setIsUploading(false);
    }
  };

  const hasPending = files.some((f) => f.status === 'pending');

  const setFileTag = (fileId: string, tagId: string | undefined) => {
    setFiles((prev) => prev.map((f) => f.id === fileId ? { ...f, tagId } : f));
  };

  const openFilePicker = useCallback(() => {
    if (isUploading) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = maxFiles > 1;
    input.accept = ACCEPTED_EXTENSIONS;
    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files) handleFiles(target.files);
    };
    input.click();
  }, [isUploading, maxFiles, handleFiles]);

  return (
    <div className="space-y-4">
      {/* Drop zone + add button */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-colors',
          isDragging ? 'border-primary-400 bg-primary-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'
        )}
        onClick={openFilePicker}
      >
        <Upload className={cn('h-8 w-8', isDragging ? 'text-primary-500' : 'text-gray-400')} />
        <p className="mt-3 text-sm font-medium text-gray-600">
          {t('dropFiles')}
        </p>
        <p className="mt-1 text-xs text-gray-400">
          {t('acceptedFormats')}
        </p>
        <p className="mt-0.5 text-xs text-gray-400">
          {t('maxSize', { max: String(MAX_SIZE_MB) })} &middot; {t('maxFiles', { max: String(remainingSlots) })} {t('remaining')}
        </p>

      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((item) => (
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
                {isSource && item.status === 'pending' && (
                  <InlineTagSelector
                    tags={tags}
                    selectedTagId={item.tagId}
                    onSelect={(tagId) => setFileTag(item.id, tagId)}
                    addLabel={tt('addLabel')}
                  />
                )}
                <span className="flex-shrink-0 text-xs text-gray-400">
                  {(item.file.size / (1024 * 1024)).toFixed(1)} MB
                </span>
                {(item.status === 'pending' || item.status === 'error') && (
                  <button onClick={() => removeFile(item.id)} className="text-gray-400 hover:text-gray-600">
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
              {isUploading ? tc('processing') : `${tc('upload')} ${files.filter((f) => f.status === 'pending').length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Inline tag selector for pending source files ── */

interface InlineTagSelectorProps {
  tags: Tag[];
  selectedTagId?: string;
  onSelect: (tagId: string | undefined) => void;
  addLabel: string;
}

function InlineTagSelector({ tags, selectedTagId, onSelect, addLabel }: InlineTagSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const selectedTag = tags.find((t) => t._id === selectedTagId);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      {selectedTag ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
          style={{ backgroundColor: selectedTag.color }}
        >
          {selectedTag.name}
          <ChevronDown className="h-3 w-3" />
        </button>
      ) : (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
          className="rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-500 transition-colors hover:border-primary-400 hover:text-primary-600"
        >
          {addLabel}
        </button>
      )}

      {open && (
        <div className="absolute right-0 top-7 z-20 min-w-[160px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {selectedTag && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelect(undefined); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-400 hover:bg-gray-50"
            >
              <X className="h-3 w-3" />
              Remove tag
            </button>
          )}
          {tags.map((tag) => (
            <button
              key={tag._id}
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelect(tag._id); setOpen(false); }}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50',
                tag._id === selectedTagId ? 'bg-gray-50 font-medium text-gray-900' : 'text-gray-700'
              )}
            >
              <span
                className="h-3 w-3 flex-shrink-0 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
              {tag.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
