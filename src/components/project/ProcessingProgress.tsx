'use client';

import { useTranslations } from 'next-intl';
import { Check, Loader2, Circle, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type StageStatus = 'pending' | 'running' | 'completed' | 'failed';

interface PipelineStage {
  id: string;
  translationKey: string;
  status: StageStatus;
  error?: string;
}

interface ProcessingProgressProps {
  stages: PipelineStage[];
  overallStatus: 'processing' | 'completed' | 'failed';
  onRetry?: () => void;
}

export function ProcessingProgress({ stages, overallStatus, onRetry }: ProcessingProgressProps) {
  const t = useTranslations('project.processing');

  // Find the first failed stage's error message
  const failedStage = stages.find((s) => s.status === 'failed');

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
      <h2 className="font-heading text-xl font-bold text-gray-900">{t('title')}</h2>

      <div className="mt-8 space-y-1">
        {stages.map((stage, index) => (
          <div key={stage.id}>
            <div className="flex items-start gap-4">
              {/* Indicator */}
              <div className="flex flex-col items-center">
                <div className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full',
                  stage.status === 'completed' ? 'bg-success text-white' :
                  stage.status === 'running' ? 'bg-primary-100 text-primary-600' :
                  stage.status === 'failed' ? 'bg-error text-white' :
                  'bg-gray-100 text-gray-400'
                )}>
                  {stage.status === 'completed' ? (
                    <Check className="h-4 w-4" />
                  ) : stage.status === 'running' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : stage.status === 'failed' ? (
                    <XCircle className="h-4 w-4" />
                  ) : (
                    <Circle className="h-3 w-3" />
                  )}
                </div>
                {index < stages.length - 1 && (
                  <div className={cn(
                    'h-8 w-0.5',
                    stage.status === 'completed' ? 'bg-success' : 'bg-gray-200'
                  )} />
                )}
              </div>

              {/* Text */}
              <div className="pt-1">
                <p className={cn(
                  'text-sm font-medium',
                  stage.status === 'completed' ? 'text-success' :
                  stage.status === 'running' ? 'text-primary-600' :
                  stage.status === 'failed' ? 'text-error' :
                  'text-gray-400'
                )}>
                  {t(`steps.${stage.translationKey}`)}
                </p>
                {/* Show error message inline */}
                {stage.status === 'failed' && stage.error && (
                  <p className="mt-1 text-xs text-error/80">
                    {stage.error}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {overallStatus === 'completed' && (
        <div className="mt-6 rounded-xl bg-green-50 p-4 text-center">
          <p className="text-sm font-semibold text-success">{t('complete')}</p>
        </div>
      )}

      {overallStatus === 'failed' && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-error" />
            <div>
              <p className="text-sm font-semibold text-error">{t('failed')}</p>
              {failedStage?.error && (
                <p className="mt-1.5 text-sm text-red-700/80">{failedStage.error}</p>
              )}
            </div>
          </div>
          <div className="mt-4 text-center">
            <button
              onClick={onRetry}
              className="rounded-lg bg-error px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
            >
              {t('retryButton')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
