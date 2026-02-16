'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useProject } from '@/lib/hooks/use-projects';
import { ArrowLeft, ArrowRight, Loader2, FileText, Check, Edit3, SkipForward } from 'lucide-react';

interface EditorPageContentProps {
  projectId: string;
}

export function EditorPageContent({ projectId }: EditorPageContentProps) {
  const t = useTranslations('project.editor');
  const { project, isLoading } = useProject(projectId);

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
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href={`/project/${projectId}`}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="font-heading text-lg font-bold text-gray-900">
              {t('title')} — {project.name}
            </h1>
          </div>
          <Link
            href={`/project/${projectId}/export`}
            className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
          >
            Export
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {/* Split screen placeholder */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — source preview */}
        <div className="flex w-1/2 flex-col border-r border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-700">Source Documents</h2>
          </div>
          <div className="flex flex-1 items-center justify-center p-6 text-gray-400">
            <div className="text-center">
              <FileText className="mx-auto h-10 w-10" />
              <p className="mt-3 text-sm">Source document preview will appear here</p>
            </div>
          </div>
        </div>

        {/* Right panel — field suggestions */}
        <div className="flex w-1/2 flex-col bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-700">Template Fields</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Placeholder field cards */}
            {[1, 2, 3].map((n) => (
              <div key={n} className="rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">{t('field', { number: String(n) })}</span>
                  <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-success">
                    {t('confidenceHigh')}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-600">AI-generated suggestion will appear here.</p>
                <div className="mt-3 flex gap-2">
                  <button className="inline-flex items-center gap-1 rounded-lg bg-success px-3 py-1.5 text-xs font-semibold text-white">
                    <Check className="h-3 w-3" /> {t('accept')}
                  </button>
                  <button className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                    <Edit3 className="h-3 w-3" /> {t('edit')}
                  </button>
                  <button className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-400 hover:bg-gray-50">
                    <SkipForward className="h-3 w-3" /> {t('skip')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
