'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useProject } from '@/lib/hooks/use-projects';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { ProcessingProgress } from './ProcessingProgress';
import useSWR from 'swr';

interface ProcessingPageContentProps {
  projectId: string;
}

interface StageProgress {
  stage: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

interface PipelineStatusResponse {
  data: {
    status: string;
    currentStage: string | null;
    stages: StageProgress[];
  };
}

const STAGE_TRANSLATION_MAP: Record<string, string> = {
  extractor: 'extracting',
  model: 'analyzing',
  template: 'templateAnalysis',
  mapping: 'mapping',
  writing: 'writing',
  verification: 'verifying',
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function ProcessingPageContent({ projectId }: ProcessingPageContentProps) {
  const t = useTranslations('project');
  const { project, isLoading } = useProject(projectId);
  const [pipelineStarted, setPipelineStarted] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const triggerRef = useRef(false);

  // Poll pipeline status every 2 seconds once pipeline is started
  const { data: statusData } = useSWR<PipelineStatusResponse>(
    pipelineStarted ? `/api/pipeline/${projectId}/status` : null,
    fetcher,
    { refreshInterval: 2000 }
  );

  const projectStatus = statusData?.data?.status;
  const stagesFromAPI = statusData?.data?.stages ?? [];
  const isReady = projectStatus === 'ready' || projectStatus === 'exported';
  const isFailed = stagesFromAPI.some((s) => s.status === 'failed');

  // Trigger pipeline on mount
  const startPipeline = useCallback(async () => {
    if (triggerRef.current) return;
    triggerRef.current = true;

    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });

      if (res.ok || res.status === 409) {
        // 409 = already running, that's fine
        setPipelineStarted(true);
      } else {
        const data = await res.json();
        setStartError(data.error || 'Failed to start pipeline');
        setPipelineStarted(true);
      }
    } catch {
      setStartError('Failed to connect to server');
      setPipelineStarted(true);
    }
  }, [projectId]);

  useEffect(() => {
    startPipeline();
  }, [startPipeline]);

  // Build stage display from API response
  const stages = stagesFromAPI.length > 0
    ? stagesFromAPI.map((s) => ({
        id: s.stage,
        translationKey: STAGE_TRANSLATION_MAP[s.stage] ?? s.stage,
        status: s.status === 'queued' ? ('pending' as const) : s.status,
      }))
    : [
        { id: 'extractor', translationKey: 'extracting', status: 'pending' as const },
        { id: 'model', translationKey: 'analyzing', status: 'pending' as const },
        { id: 'template', translationKey: 'templateAnalysis', status: 'pending' as const },
        { id: 'mapping', translationKey: 'mapping', status: 'pending' as const },
        { id: 'writing', translationKey: 'writing', status: 'pending' as const },
        { id: 'verification', translationKey: 'verifying', status: 'pending' as const },
      ];

  const overallStatus = isReady
    ? 'completed'
    : isFailed
    ? 'failed'
    : 'processing';

  if (isLoading || !pipelineStarted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
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
            {project?.name ?? 'Project'}
          </Link>
          <h1 className="mt-3 font-heading text-2xl font-bold text-gray-900">
            {t('processing.title')}
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        {startError && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-700">{startError}</p>
          </div>
        )}

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
