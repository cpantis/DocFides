'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { CheckCircle } from 'lucide-react';

export function Hero() {
  const t = useTranslations('landing.hero');

  return (
    <section className="relative overflow-hidden px-6 pt-32 pb-20 lg:pt-40 lg:pb-28">
      {/* Background gradient */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary-50/60 to-white" />

      <div className="mx-auto max-w-4xl text-center">
        <h1 className="font-heading text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
          {t('title')}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-600">
          {t('subtitle')}
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard"
            className="rounded-xl bg-primary-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-primary-600/25 transition-all hover:bg-primary-700 hover:shadow-xl hover:shadow-primary-600/30"
          >
            {t('cta')}
          </Link>
          <a
            href="#how-it-works"
            className="rounded-xl border border-gray-300 px-8 py-3.5 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50"
          >
            {t('secondaryCta')}
          </a>
        </div>

        {/* Trust badges */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500">
          <span className="flex items-center gap-1.5">
            <CheckCircle className="h-4 w-4 text-success" />
            {t('badges.ocr')}
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle className="h-4 w-4 text-success" />
            {t('badges.languages')}
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle className="h-4 w-4 text-success" />
            {t('badges.gdpr')}
          </span>
        </div>
      </div>
    </section>
  );
}
