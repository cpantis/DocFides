'use client';

import { useTranslations } from 'next-intl';

interface UsageChartProps {
  data?: { month: string; count: number }[];
}

export function UsageChart({ data }: UsageChartProps) {
  const t = useTranslations('dashboard.stats');

  // Generate placeholder data if none provided
  const chartData = data ?? [
    { month: 'Sep', count: 0 },
    { month: 'Oct', count: 0 },
    { month: 'Nov', count: 0 },
    { month: 'Dec', count: 0 },
    { month: 'Jan', count: 0 },
    { month: 'Feb', count: 0 },
  ];

  const maxCount = Math.max(...chartData.map((d) => d.count), 1);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-500">{t('projects')}</h3>
      <div className="mt-6 flex h-32 items-end gap-2">
        {chartData.map((item) => (
          <div key={item.month} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t bg-primary-500 transition-all duration-500"
              style={{ height: `${(item.count / maxCount) * 100}%`, minHeight: item.count > 0 ? '4px' : '2px' }}
            />
            <span className="text-xs text-gray-400">{item.month}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
