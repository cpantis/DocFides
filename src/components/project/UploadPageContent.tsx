'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useProject } from '@/lib/hooks/use-projects';
import {
  ArrowLeft,
  ArrowRight,
  Info,
  Loader2,
  Plus,
  Shield,
} from 'lucide-react';
import { ModelDocBadge } from './ModelDocBadge';
import { UploadZone } from './UploadZone';
import { SourceDocumentList } from './SourceDocumentList';

interface UploadPageContentProps {
  projectId: string;
}

export function UploadPageContent({ projectId }: UploadPageContentProps) {
  const t = useTranslations('project.upload');
  const tc = useTranslations('common');
  const { project, isLoading, mutate } = useProject(projectId);

  const openFilePicker = (role: string, maxFiles: number) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = maxFiles > 1;
    input.accept = '.pdf,.docx,.doc,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.tiff,.tif';
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files) return;
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('projectId', projectId);
        formData.append('role', role);
        try {
          await fetch('/api/documents', { method: 'POST', body: formData });
        } catch {
          // Errors handled silently — user will see in document list
        }
      }
      mutate();
    };
    input.click();
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
        {/* Upload instructions */}
        <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
          <div className="text-sm text-blue-700">
            <p>{t('uploadHint')}</p>
            <p className="mt-1 text-blue-600">{t('filenameHint')}</p>
          </div>
        </div>

        {/* Privacy notice */}
        <div className="flex items-start gap-3 rounded-xl border border-green-100 bg-green-50 p-4">
          <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
          <div className="text-sm text-green-700">
            <p className="font-medium">{t('privacyTitle')}</p>
            <p className="mt-1 text-green-600">{t('privacyDescription')}</p>
          </div>
        </div>

        {/* Template */}
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-lg font-bold text-gray-900">
              {t('templateLabel')}
            </h2>
            {hasTemplate && (
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                1 {t('uploaded')}
              </span>
            )}
            {!hasTemplate && (
              <button
                type="button"
                onClick={() => openFilePicker('template', 1)}
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-600"
                title={t('dropFiles')}
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">{t('templateHint')}</p>
          <div className="mt-4">
            <UploadZone
              projectId={projectId}
              role="template"
              maxFiles={1}
              existingCount={hasTemplate ? 1 : 0}
              onUploadComplete={() => mutate()}
            />
          </div>
        </section>

        {/* Model (optional) */}
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-lg font-bold text-gray-900">
              {t('modelLabel')}
            </h2>
            <ModelDocBadge />
            {(project.modelDocuments?.length ?? 0) > 0 && (
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                {project.modelDocuments?.length} {t('uploaded')}
              </span>
            )}
            {(project.modelDocuments?.length ?? 0) < 2 && (
              <button
                type="button"
                onClick={() => openFilePicker('model', 2)}
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-600"
                title={t('dropFiles')}
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">{t('modelHint')}</p>
          <div className="mt-4">
            <UploadZone
              projectId={projectId}
              role="model"
              maxFiles={2}
              existingCount={project.modelDocuments?.length ?? 0}
              onUploadComplete={() => mutate()}
            />
          </div>
        </section>

        {/* Sources */}
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-lg font-bold text-gray-900">
              {t('sourceLabel')}
            </h2>
            {sourceCount > 0 && (
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                {sourceCount} {t('uploaded')}
              </span>
            )}
            {sourceCount < 10 && (
              <button
                type="button"
                onClick={() => openFilePicker('source', 10)}
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-600"
                title={t('dropFiles')}
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">{t('sourceHint')}</p>

          {/* Uploaded source documents with tag selectors */}
          {sourceCount > 0 && (
            <SourceDocumentList projectId={projectId} />
          )}

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
            {t('startProcessing')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
