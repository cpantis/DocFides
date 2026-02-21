'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ArrowLeft, Tags } from 'lucide-react';
import { TagManager } from '@/components/dashboard/TagManager';

export default function TagsPage() {
  const t = useTranslations('dashboard.tags');
  const tc = useTranslations('common');

  return (
    <div className="mx-auto max-w-4xl px-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        {tc('back')}
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <Tags className="h-6 w-6 text-primary-500" />
        <h1 className="font-heading text-2xl font-bold text-gray-900">
          {t('title')}
        </h1>
      </div>
      <p className="mt-2 text-sm text-gray-500">{t('description')}</p>

      <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <TagManager />
      </div>
    </div>
  );
}
