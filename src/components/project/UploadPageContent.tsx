'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useProject } from '@/lib/hooks/use-projects';
import { ArrowLeft, ArrowRight, FolderOpen, Info, Loader2 } from 'lucide-react';
import { UploadZone } from './UploadZone';
import { ModelDocBadge } from './ModelDocBadge';

interface UploadPageContentProps {
  projectId: string;
}

export function UploadPageContent({ projectId }: UploadPageContentProps) {
  const t = useTranslations('project.upload');
  const { project, isLoading, mutate } = useProject(projectId);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ total: number; errors: string[] } | null>(null);

  const importFromLocal = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch('/api/documents/import-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (res.ok) {
        setImportResult({ total: data.data.total, errors: data.data.errors });
        mutate();
      } else {
        setImportResult({ total: 0, errors: [data.error || 'Import failed'] });
      }
    } catch {
      setImportResult({ total: 0, errors: ['Failed to connect to server'] });
    } finally {
      setImporting(false);
    }
  };

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
          Back to dashboard
        </Link>
      </div>
    );
  }

  const sourceCount = project.sourceDocuments?.length ?? 0;
  const templateCount = project.templateDocument ? 1 : 0;
  const modelCount = project.modelDocuments?.length ?? 0;
  const hasTemplate = templateCount > 0;
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
        {/* Filename hint */}
        <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
          <p className="text-sm text-blue-700">{t('filenameHint')}</p>
        </div>

        {/* Import from local folder (dev shortcut) */}
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FolderOpen className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-700">Import from local folder</p>
                <p className="text-xs text-gray-400">
                  Scans <code className="rounded bg-gray-100 px-1">dev-documents/</code> with <code className="rounded bg-gray-100 px-1">template/</code> <code className="rounded bg-gray-100 px-1">model/</code> <code className="rounded bg-gray-100 px-1">source/</code> subfolders
                </p>
              </div>
            </div>
            <button
              onClick={importFromLocal}
              disabled={importing}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
              {importing ? 'Importing...' : 'Scan & Import'}
            </button>
          </div>
          {importResult && (
            <div className="mt-3 text-xs">
              {importResult.total > 0 && (
                <p className="text-green-600">{importResult.total} file(s) imported successfully</p>
              )}
              {importResult.errors.map((err, i) => (
                <p key={i} className="text-amber-600">{err}</p>
              ))}
            </div>
          )}
        </div>

        {/* Template */}
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="font-heading text-lg font-bold text-gray-900">
            {t('templateLabel')}
          </h2>
          <p className="mt-1 text-sm text-gray-500">{t('templateHint')}</p>
          <div className="mt-4">
            <UploadZone
              projectId={projectId}
              role="template"
              maxFiles={1}
              existingCount={templateCount}
              onUploadComplete={() => mutate()}
            />
          </div>
        </section>

        {/* Model document (optional) */}
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-lg font-bold text-gray-900">
              {t('modelLabel')}
            </h2>
            <ModelDocBadge />
          </div>
          <div className="mt-4">
            <UploadZone
              projectId={projectId}
              role="model"
              maxFiles={2}
              existingCount={modelCount}
              onUploadComplete={() => mutate()}
            />
          </div>
        </section>

        {/* Source documents */}
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="font-heading text-lg font-bold text-gray-900">
            {t('sourceLabel')}
          </h2>
          <p className="mt-1 text-sm text-gray-500">{t('sourceHint')}</p>
          <div className="mt-4">
            <UploadZone
              projectId={projectId}
              role="source"
              maxFiles={10}
              existingCount={sourceCount}
              onUploadComplete={() => mutate()}
            />
          </div>
        </section>

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
            Start Processing
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
