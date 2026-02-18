'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useProject } from '@/lib/hooks/use-projects';
import { ArrowLeft, FileDown, FileText, Loader2, AlertCircle } from 'lucide-react';
import { useState } from 'react';

interface ExportPageContentProps {
  projectId: string;
}

export function ExportPageContent({ projectId }: ExportPageContentProps) {
  const t = useTranslations('project.export');
  const { project, isLoading } = useProject(projectId);
  const [exporting, setExporting] = useState<'docx' | 'pdf' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async (format: 'docx' | 'pdf') => {
    setExporting(format);
    setExportError(null);
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, format }),
      });

      if (!res.ok) {
        let errorMessage = `Export failed (${res.status})`;
        try {
          const errorData = await res.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
          if (errorData.summary) {
            errorMessage += `: ${errorData.summary}`;
          }
        } catch {
          // Response wasn't JSON — use status text
        }
        setExportError(errorMessage);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project?.name ?? 'document'}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'An unexpected error occurred during export'
      );
    } finally {
      setExporting(null);
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

  return (
    <div className="min-h-screen bg-gray-50">
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

      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* Error banner */}
        {exportError && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-red-800">{t('exportFailed')}</p>
              <p className="mt-1 text-sm text-red-600">{exportError}</p>
            </div>
            <button
              onClick={() => setExportError(null)}
              className="text-sm text-red-400 hover:text-red-600"
            >
              &times;
            </button>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* DOCX export */}
          <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
                <FileText className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h2 className="font-heading text-lg font-bold text-gray-900">DOCX</h2>
                <p className="text-sm text-gray-500">Microsoft Word format</p>
              </div>
            </div>
            <button
              onClick={() => handleExport('docx')}
              disabled={exporting !== null}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {exporting === 'docx' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('downloading')}
                </>
              ) : (
                <>
                  <FileDown className="h-4 w-4" />
                  {t('docx')}
                </>
              )}
            </button>
          </div>

          {/* PDF export */}
          <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50">
                <FileText className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <h2 className="font-heading text-lg font-bold text-gray-900">PDF</h2>
                <p className="text-sm text-gray-500">Portable Document Format</p>
              </div>
            </div>
            <button
              onClick={() => handleExport('pdf')}
              disabled={exporting !== null}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {exporting === 'pdf' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('downloading')}
                </>
              ) : (
                <>
                  <FileDown className="h-4 w-4" />
                  {t('pdf')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
