'use client';

import { FileText, Loader2, Check, AlertCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { ConfidenceBadge } from './ConfidenceBadge';

interface DocumentStatusCardProps {
  filename: string;
  status: 'uploaded' | 'processing' | 'extracted' | 'failed';
  confidence?: number | null;
  language?: string | null;
  blockCount?: number;
  tableCount?: number;
  processingTimeMs?: number | null;
  errors?: string[];
}

const statusConfig = {
  uploaded: {
    icon: Clock,
    color: 'text-gray-400',
    bg: 'bg-gray-50',
    label: 'Queued',
  },
  processing: {
    icon: Loader2,
    color: 'text-primary-500',
    bg: 'bg-primary-50',
    label: 'Processing',
  },
  extracted: {
    icon: Check,
    color: 'text-success',
    bg: 'bg-green-50',
    label: 'Extracted',
  },
  failed: {
    icon: AlertCircle,
    color: 'text-error',
    bg: 'bg-red-50',
    label: 'Failed',
  },
};

export function DocumentStatusCard({
  filename,
  status,
  confidence,
  language,
  blockCount = 0,
  tableCount = 0,
  processingTimeMs,
  errors = [],
}: DocumentStatusCardProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', config.bg)}>
          <Icon
            className={cn(
              'h-4 w-4',
              config.color,
              status === 'processing' && 'animate-spin'
            )}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
            <span className="truncate text-sm font-medium text-gray-900">
              {filename}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={cn('text-xs font-medium', config.color)}>
              {config.label}
            </span>

            {status === 'extracted' && confidence !== null && confidence !== undefined && (
              <ConfidenceBadge score={confidence} showLabel={false} />
            )}

            {language && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                {language.toUpperCase()}
              </span>
            )}

            {blockCount > 0 && (
              <span className="text-xs text-gray-400">
                {blockCount} blocks
              </span>
            )}

            {tableCount > 0 && (
              <span className="text-xs text-gray-400">
                {tableCount} tables
              </span>
            )}

            {processingTimeMs !== null && processingTimeMs !== undefined && (
              <span className="text-xs text-gray-400">
                {(processingTimeMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>

          {errors.length > 0 && (
            <div className="mt-2 space-y-1">
              {errors.map((err, i) => (
                <p key={i} className="text-xs text-error">
                  {err}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
