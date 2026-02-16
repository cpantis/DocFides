'use client';

import { useTranslations } from 'next-intl';
import { ShieldCheck, AlertTriangle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface ConfidenceBadgeProps {
  score: number;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

function getLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 90) return 'high';
  if (score >= 70) return 'medium';
  return 'low';
}

export function ConfidenceBadge({ score, showLabel = true, size = 'sm' }: ConfidenceBadgeProps) {
  const t = useTranslations('project.editor');
  const level = getLevel(score);

  const config = {
    high: {
      icon: ShieldCheck,
      bg: 'bg-green-50',
      text: 'text-success',
      border: 'border-green-200',
      label: t('confidenceHigh'),
    },
    medium: {
      icon: AlertTriangle,
      bg: 'bg-amber-50',
      text: 'text-amber-600',
      border: 'border-amber-200',
      label: t('confidenceMedium'),
    },
    low: {
      icon: AlertCircle,
      bg: 'bg-red-50',
      text: 'text-error',
      border: 'border-red-200',
      label: t('confidenceLow'),
    },
  };

  const c = config[level];
  const Icon = c.icon;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border',
        c.bg,
        c.border,
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      )}
    >
      <Icon className={cn(c.text, size === 'sm' ? 'h-3 w-3' : 'h-4 w-4')} />
      <span className={cn('font-medium', c.text)}>
        {Math.round(score)}%
      </span>
      {showLabel && (
        <span className={cn('font-normal', c.text)}>{c.label}</span>
      )}
    </div>
  );
}
