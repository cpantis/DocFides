'use client';

import { useTranslations } from 'next-intl';
import { DollarSign } from 'lucide-react';

interface AiCostCardProps {
  totalCost: number;
  avgCostPerProject: number;
  projectCount: number;
}

export function AiCostCard({ totalCost, avgCostPerProject, projectCount }: AiCostCardProps) {
  const t = useTranslations('dashboard.aiCost');

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-500">{t('title')}</h3>
      <div className="mt-4 flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50">
          <DollarSign className="h-6 w-6 text-primary-600" />
        </div>
        <div>
          <span className="text-2xl font-bold text-gray-900">
            ${totalCost.toFixed(2)}
          </span>
          <p className="text-xs text-gray-500">{t('total')}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-gray-50 pt-3">
        <div>
          <p className="text-xs text-gray-400">{t('avgPerProject')}</p>
          <p className="font-mono text-sm font-semibold text-gray-700">
            ${avgCostPerProject.toFixed(4)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">{t('projectsProcessed')}</p>
          <p className="text-sm font-semibold text-gray-700">{projectCount}</p>
        </div>
      </div>
    </div>
  );
}
