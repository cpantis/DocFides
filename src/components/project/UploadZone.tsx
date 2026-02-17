'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import { Upload, X, FileText, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
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
  error?: string;
}

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg,.tiff,.tif';
const MAX_SIZE_MB = 25;

let fileCounter = 0;
function nextFileId(): string {
  return `file_${++fileCounter}_${Date.now()}`;
}

export function UploadZone({ projectId, role, maxFiles, existingCount, onUploadComplete }: UploadZoneProps) {
  const t = useTranslations('project.upload');
  const tc = useTranslations('common');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const uploadingRef = useRef(false);

  const remainingSlots = maxFiles - existingCount;

  const handleFiles = useCallback((fileList: FileList) => {
    const activeCount = files.filter((f) => f.status === 'pending' || f.status === 'uploading').length;
    const slotsAvailable = remainingSlots - activeCount;
    if (slotsAvailable <= 0) return;

    const newFiles = Array.from(fileList).slice(0, slotsAvailable);
    const uploadFiles: UploadedFile[] = newFiles.map((file) => {
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        return { id: nextFileId(), file, status: 'error' as const, error: `File too large (max ${MAX_SIZE_MB}MB)` };
      }
      return { id: nextFileId(), file, status: 'pending' as const };
    });
    setFiles((prev) => [...prev, ...uploadFiles]);
  }, [remainingSlots, files]);

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
          prev.map((f) => f.id === item.id ? { ...f, status: 'uploading' as const } : f)
        );

        try {
          const formData = new FormData();
          formData.append('file', item.file);
          formData.append('projectId', projectId);
          formData.append('role', role);

          const res = await fetch('/api/documents', { method: 'POST', body: formData });
          const resData = await res.json().catch(() => ({ error: 'Upload failed' }));

          if (!res.ok) {
            throw new Error(resData.error || `Upload failed (${res.status})`);
          }

          // Check if document extraction succeeded (API returns actual document status)
          if (resData?.data?.status === 'failed') {
            const errors = resData.data.parsingErrors?.join('; ') || 'Text extraction failed';
            throw new Error(errors);
          }

          setFiles((prev) =>
            prev.map((f) => f.id === item.id ? { ...f, status: 'success' as const } : f)
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Upload failed';
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

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-colors',
          isDragging ? 'border-primary-400 bg-primary-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'
        )}
        onClick={() => {
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
        }}
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
                'flex items-center gap-3 rounded-xl border px-4 py-3',
                item.status === 'error' ? 'border-red-200 bg-red-50' :
                item.status === 'success' ? 'border-green-200 bg-green-50' :
                item.status === 'uploading' ? 'border-blue-200 bg-blue-50' :
                'border-gray-200 bg-white'
              )}
            >
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
              {item.status === 'pending' && (
                <button onClick={() => removeFile(item.id)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              )}
              {item.error && <span className="text-xs text-error">{item.error}</span>}
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
