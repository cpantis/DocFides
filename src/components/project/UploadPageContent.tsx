'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useProject } from '@/lib/hooks/use-projects';
import useSWR from 'swr';
import {
  ArrowLeft,
  ArrowRight,
  FolderOpen,
  Info,
  Loader2,
  FileText,
  Check,
  AlertCircle,
  Search,
  Upload,
} from 'lucide-react';
import { ModelDocBadge } from './ModelDocBadge';
import { cn } from '@/lib/utils/cn';

interface PlatformInfo {
  platform: string;
  separator: string;
  homeDir: string;
  cwd: string;
  defaultBasePath: string;
  examplePath: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface UploadPageContentProps {
  projectId: string;
}

interface ScannedFile {
  filename: string;
  role: string;
  size: number;
  alreadyImported: boolean;
}

interface CategoryState {
  path: string;
  files: ScannedFile[];
  scanning: boolean;
  importing: boolean;
  imported: number;
  errors: string[];
  scanned: boolean;
}

const defaultCategory = (): CategoryState => ({
  path: '',
  files: [],
  scanning: false,
  importing: false,
  imported: 0,
  errors: [],
  scanned: false,
});

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadPageContent({ projectId }: UploadPageContentProps) {
  const t = useTranslations('project.upload');
  const tc = useTranslations('common');
  const { project, isLoading, mutate } = useProject(projectId);

  // Fetch server platform info for OS-appropriate paths
  const { data: platformData } = useSWR<{ data: PlatformInfo }>(
    '/api/documents/import-local',
    fetcher
  );
  const platform = platformData?.data;
  const isWin = platform?.platform === 'win32';
  const folderPlaceholder = isWin ? 'C:\\Users\\...\\folder' : '/path/to/folder';

  const [template, setTemplate] = useState<CategoryState>(defaultCategory());
  const [model, setModel] = useState<CategoryState>(defaultCategory());
  const [source, setSource] = useState<CategoryState>(defaultCategory());

  const scanCategory = useCallback(async (
    role: 'template' | 'model' | 'source',
    setState: React.Dispatch<React.SetStateAction<CategoryState>>,
    categoryPath: string,
  ) => {
    if (!categoryPath.trim()) return;

    setState((prev) => ({ ...prev, scanning: true, errors: [], files: [] }));
    try {
      const res = await fetch('/api/documents/import-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          [`${role}Path`]: categoryPath.trim(),
          scanOnly: true,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const roleFiles = (data.data.files as ScannedFile[]).filter((f) => f.role === role);
        setState((prev) => ({
          ...prev,
          files: roleFiles,
          errors: data.data.errors ?? [],
          scanned: true,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          errors: [data.error || 'Scan failed'],
          scanned: true,
        }));
      }
    } catch {
      setState((prev) => ({
        ...prev,
        errors: ['Failed to connect to server'],
        scanned: true,
      }));
    } finally {
      setState((prev) => ({ ...prev, scanning: false }));
    }
  }, [projectId]);

  const importCategory = useCallback(async (
    role: 'template' | 'model' | 'source',
    setState: React.Dispatch<React.SetStateAction<CategoryState>>,
    categoryPath: string,
  ) => {
    if (!categoryPath.trim()) return;

    setState((prev) => ({ ...prev, importing: true, errors: [] }));
    try {
      const res = await fetch('/api/documents/import-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          [`${role}Path`]: categoryPath.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setState((prev) => ({
          ...prev,
          imported: data.data.total ?? 0,
          errors: data.data.errors ?? [],
          files: prev.files.map((f) => ({ ...f, alreadyImported: true })),
        }));
        mutate();
      } else {
        setState((prev) => ({
          ...prev,
          errors: [data.error || 'Import failed'],
        }));
      }
    } catch {
      setState((prev) => ({
        ...prev,
        errors: ['Failed to connect to server'],
      }));
    } finally {
      setState((prev) => ({ ...prev, importing: false }));
    }
  }, [projectId, mutate]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
        <p className="text-gray-500">Project not found</p>
        <Link href="/dashboard" className="mt-4 text-sm text-primary-600 hover:underline">
          {tc('back')}
        </Link>
      </div>
    );
  }

  const sourceCount = project.sourceDocuments?.length ?? 0;
  const hasTemplate = !!project.templateDocument;
  const hasSources = sourceCount > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-6 py-5">
        <div className="mx-auto max-w-4xl">
          <Link
            href={`/project/${projectId}`}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            {project.name}
          </Link>
          <h1 className="mt-3 font-heading text-2xl font-bold text-gray-900">
            {t('title')}
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8 space-y-8">
        {/* Info hint */}
        <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
          <div className="text-sm text-blue-700">
            <p>{t('localFolderHint')}</p>
            <p className="mt-1 text-blue-600">{t('filenameHint')}</p>
            {platform && (
              <p className="mt-2 font-mono text-xs text-blue-500">
                {t('serverPath')}: {platform.cwd}
              </p>
            )}
          </div>
        </div>

        {/* Template */}
        <FolderSection
          title={t('templateLabel')}
          hint={t('templateHint')}
          role="template"
          state={template}
          setState={setTemplate}
          onScan={(path) => scanCategory('template', setTemplate, path)}
          onImport={(path) => importCategory('template', setTemplate, path)}
          maxFiles={1}
          existingCount={hasTemplate ? 1 : 0}
          placeholder={folderPlaceholder}
        />

        {/* Model (optional) */}
        <FolderSection
          title={t('modelLabel')}
          hint={t('modelHint')}
          role="model"
          state={model}
          setState={setModel}
          onScan={(path) => scanCategory('model', setModel, path)}
          onImport={(path) => importCategory('model', setModel, path)}
          maxFiles={2}
          existingCount={project.modelDocuments?.length ?? 0}
          placeholder={folderPlaceholder}
          badge={<ModelDocBadge />}
        />

        {/* Sources */}
        <FolderSection
          title={t('sourceLabel')}
          hint={t('sourceHint')}
          role="source"
          state={source}
          setState={setSource}
          onScan={(path) => scanCategory('source', setSource, path)}
          onImport={(path) => importCategory('source', setSource, path)}
          maxFiles={10}
          existingCount={sourceCount}
          placeholder={folderPlaceholder}
        />

        {/* Continue button */}
        <div className="flex justify-end">
          <Link
            href={hasSources && hasTemplate ? `/project/${projectId}/processing` : '#'}
            className={
              hasSources && hasTemplate
                ? 'inline-flex items-center gap-2 rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700'
                : 'inline-flex items-center gap-2 rounded-xl bg-gray-200 px-6 py-3 text-sm font-semibold text-gray-400 cursor-not-allowed'
            }
          >
            {t('startProcessing')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// --- FolderSection component ---

interface FolderSectionProps {
  title: string;
  hint: string;
  role: 'template' | 'model' | 'source';
  state: CategoryState;
  setState: React.Dispatch<React.SetStateAction<CategoryState>>;
  onScan: (path: string) => void;
  onImport: (path: string) => void;
  maxFiles: number;
  existingCount: number;
  placeholder: string;
  badge?: React.ReactNode;
}

function FolderSection({
  title,
  hint,
  state,
  setState,
  onScan,
  onImport,
  maxFiles,
  existingCount,
  placeholder,
  badge,
}: FolderSectionProps) {
  const t = useTranslations('project.upload');
  const newFilesCount = state.files.filter((f) => !f.alreadyImported).length;
  const allImported = state.scanned && newFilesCount === 0 && state.files.length > 0;
  const hasCapacity = existingCount < maxFiles;

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <h2 className="font-heading text-lg font-bold text-gray-900">{title}</h2>
        {badge}
        {existingCount > 0 && (
          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
            {existingCount} {t('filesImported')}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-gray-500">{hint}</p>

      {/* Path input + scan */}
      <div className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <FolderOpen className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={state.path}
            onChange={(e) => setState((prev) => ({ ...prev, path: e.target.value, scanned: false }))}
            onKeyDown={(e) => { if (e.key === 'Enter') onScan(state.path); }}
            placeholder={placeholder}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-700 placeholder:text-gray-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </div>
        <button
          onClick={() => onScan(state.path)}
          disabled={!state.path.trim() || state.scanning}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          {state.scanning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {t('scan')}
        </button>
      </div>

      {/* Scanned files list */}
      {state.scanned && state.files.length > 0 && (
        <div className="mt-4">
          <div className="rounded-lg border border-gray-100 divide-y divide-gray-50">
            {state.files.map((file) => (
              <div
                key={file.filename}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 text-sm',
                  file.alreadyImported ? 'bg-gray-50 text-gray-400' : 'text-gray-700'
                )}
              >
                <FileText className="h-4 w-4 flex-shrink-0 text-gray-400" />
                <span className="flex-1 truncate font-mono text-xs">{file.filename}</span>
                <span className="text-xs text-gray-400">{formatFileSize(file.size)}</span>
                {file.alreadyImported ? (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <Check className="h-3 w-3" />
                    {t('alreadyImported')}
                  </span>
                ) : (
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                    {t('ready')}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Import button */}
          {newFilesCount > 0 && hasCapacity && (
            <button
              onClick={() => onImport(state.path)}
              disabled={state.importing}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
            >
              {state.importing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {state.importing
                ? t('importing')
                : t('importFiles', { count: newFilesCount })}
            </button>
          )}

          {allImported && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-green-600">
              <Check className="h-3.5 w-3.5" />
              {t('allFilesImported')}
            </p>
          )}

          {!hasCapacity && newFilesCount > 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-600">
              <AlertCircle className="h-3.5 w-3.5" />
              {t('maxFiles', { max: String(maxFiles) })}
            </p>
          )}
        </div>
      )}

      {/* Scan result: no files found */}
      {state.scanned && state.files.length === 0 && state.errors.length === 0 && (
        <p className="mt-3 text-xs text-gray-400">{t('noFilesFound')}</p>
      )}

      {/* Import success */}
      {state.imported > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-green-600">
          <Check className="h-3.5 w-3.5" />
          {state.imported} {t('filesImportedSuccess')}
        </p>
      )}

      {/* Errors */}
      {state.errors.length > 0 && (
        <div className="mt-3 space-y-1">
          {state.errors.map((err, i) => (
            <p key={i} className="flex items-start gap-1.5 text-xs text-amber-600">
              <AlertCircle className="mt-0.5 h-3 w-3 flex-shrink-0" />
              {err}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
