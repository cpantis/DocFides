'use client';

import { useTranslations } from 'next-intl';
import { Upload, Cpu, Download, FileText } from 'lucide-react';

interface ActivityItem {
  type: string;
  projectName: string;
  timestamp: string;
}

interface RecentActivityProps {
  items: ActivityItem[];
}

const activityIcons: Record<string, typeof Upload> = {
  file_uploaded: Upload,
  pipeline_started: Cpu,
  pipeline_completed: Cpu,
  export_generated: Download,
};

export function RecentActivity({ items }: RecentActivityProps) {
  const t = useTranslations('dashboard.stats');

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-500">{t('recentActivity')}</h3>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-gray-400">No recent activity</p>
        ) : (
          items.slice(0, 5).map((item, index) => {
            const Icon = activityIcons[item.type] ?? FileText;
            return (
              <div key={index} className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50">
                  <Icon className="h-4 w-4 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm text-gray-700">{item.projectName}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(item.timestamp).toLocaleDateString()}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
