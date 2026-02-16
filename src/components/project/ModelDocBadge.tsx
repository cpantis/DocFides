'use client';

import { useTranslations } from 'next-intl';
import { Palette } from 'lucide-react';

export function ModelDocBadge() {
  const t = useTranslations('project.upload');

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">
      <Palette className="h-3 w-3" />
      {t('modelHint')}
    </div>
  );
}
