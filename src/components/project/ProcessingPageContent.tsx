'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useProject } from '@/lib/hooks/use-projects';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { ProcessingProgress } from './ProcessingProgress';

interface ProcessingPageContentProps {
  projectId: string;
}

const PIPELINE_STAGES = [
  { id: 'extraction', translationKey: 'extracting' },
  { id: 'model_analysis', translationKey: 'analyzing' },
  { id: 'mapping', translationKey: 'mapping' },
  { id: 'writing', translationKey: 'writing' },
  { id: 'verification', translationKey: 'verifying' },
] as const;

export function ProcessingPageContent({ projectId }: ProcessingPageContentProps) {
  const t = useTranslations('project');
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

  const isProcessing = project.status === 'processing';
  const isReady = project.status === 'ready' || project.status === 'exported';

  const stages = PIPELINE_STAGES.map((stage) => ({
    ...stage,
    status: isReady
      ? ('completed' as const)
      : isProcessing
      ? ('pending' as const)
      : ('pending' as const),
  }));

  const overallStatus = isReady ? 'completed' : isProcessing ? 'processing' : 'processing';

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
            {t('processing.title')}
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <ProcessingProgress stages={stages} overallStatus={overallStatus} />

        {isReady && (
          <div className="mt-6 flex justify-end">
            <Link
              href={`/project/${projectId}/editor`}
              className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
            >
              {t('editor.title')}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
