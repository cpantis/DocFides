'use client';

import { useTranslations } from 'next-intl';
import { Clock } from 'lucide-react';

interface TimeSavedBadgeProps {
  hours: number;
}

export function TimeSavedBadge({ hours }: TimeSavedBadgeProps) {
  const t = useTranslations('dashboard.stats');

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-500">{t('timeSaved')}</h3>
      <div className="mt-4 flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50">
          <Clock className="h-6 w-6 text-emerald-600" />
        </div>
        <div>
          <span className="text-3xl font-bold text-gray-900">{hours}</span>
          <span className="ml-1 text-sm text-gray-500">hrs</span>
        </div>
      </div>
    </div>
  );
}
