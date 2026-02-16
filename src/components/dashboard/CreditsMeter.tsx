'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';

interface CreditsMeterProps {
  used: number;
  total: number;
}

export function CreditsMeter({ used, total }: CreditsMeterProps) {
  const t = useTranslations('dashboard.credits');
  const percent = total > 0 ? Math.round((used / total) * 100) : 0;
  const circumference = 2 * Math.PI * 40;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-500">{t('title')}</h3>
      <div className="mt-4 flex items-center gap-6">
        <div className="relative h-24 w-24 flex-shrink-0">
          <svg className="h-24 w-24 -rotate-90" viewBox="0 0 96 96">
            <circle
              cx="48"
              cy="48"
              r="40"
              fill="none"
              stroke="#F1F5F9"
              strokeWidth="8"
            />
            <circle
              cx="48"
              cy="48"
              r="40"
              fill="none"
              stroke={percent >= 100 ? '#EF4444' : percent >= 80 ? '#EAB308' : '#3B82F6'}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={cn(
              'text-lg font-bold',
              percent >= 100 ? 'text-error' : percent >= 80 ? 'text-warning' : 'text-primary-600'
            )}>
              {percent}%
            </span>
          </div>
        </div>
        <div>
          <p className="text-sm text-gray-600">{t('used', { used: String(used), total: String(total) })}</p>
          {percent >= 80 && percent < 100 && (
            <p className="mt-1 text-xs text-warning">{t('warning', { percent: String(percent) })}</p>
          )}
          {percent >= 100 && (
            <p className="mt-1 text-xs text-error">{t('exhausted')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
