'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { motion } from 'framer-motion';
import { CheckCircle, FileText, FileSpreadsheet, Image as ImageIcon } from 'lucide-react';

export function Hero() {
  const t = useTranslations('landing.hero');

  return (
    <section className="relative overflow-hidden px-6 pt-32 pb-20 lg:pt-40 lg:pb-28">
      {/* Background gradient */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary-50/60 to-white" />

      <div className="mx-auto flex max-w-7xl flex-col items-center gap-16 lg:flex-row lg:items-center">
        {/* Text content */}
        <div className="flex-1 text-center lg:text-left">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="font-heading text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl"
          >
            {t('title')}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-600 lg:mx-0"
          >
            {t('subtitle')}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 flex flex-col items-center gap-4 sm:flex-row lg:justify-start"
          >
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
          </motion.div>

          {/* Trust badges */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500 lg:justify-start"
          >
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
          </motion.div>
        </div>

        {/* Animated document visual */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="flex-1"
        >
          <div className="relative mx-auto w-full max-w-lg">
            {/* Source documents floating in */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -top-4 -left-4 z-10 rounded-xl border border-gray-200 bg-white p-4 shadow-lg"
            >
              <FileText className="h-8 w-8 text-primary-500" />
              <div className="mt-2 h-2 w-16 rounded bg-gray-200" />
              <div className="mt-1 h-2 w-12 rounded bg-gray-100" />
            </motion.div>

            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
              className="absolute top-8 -right-4 z-10 rounded-xl border border-gray-200 bg-white p-4 shadow-lg"
            >
              <FileSpreadsheet className="h-8 w-8 text-success" />
              <div className="mt-2 h-2 w-14 rounded bg-gray-200" />
              <div className="mt-1 h-2 w-10 rounded bg-gray-100" />
            </motion.div>

            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              className="absolute bottom-12 -left-8 z-10 rounded-xl border border-gray-200 bg-white p-4 shadow-lg"
            >
              <ImageIcon className="h-8 w-8 text-accent-500" />
              <div className="mt-2 h-2 w-12 rounded bg-gray-200" />
              <div className="mt-1 h-2 w-8 rounded bg-gray-100" />
            </motion.div>

            {/* Central "processed" document */}
            <div className="relative rounded-2xl border border-primary-200 bg-gradient-to-br from-white to-primary-50 p-8 shadow-xl">
              <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                <div className="h-3 w-3 rounded-full bg-success" />
                <div className="h-3 w-24 rounded bg-gray-200" />
              </div>
              <div className="mt-6 space-y-3">
                <div className="h-3 w-full rounded bg-primary-100" />
                <div className="h-3 w-5/6 rounded bg-primary-100" />
                <div className="h-3 w-4/6 rounded bg-primary-100" />
              </div>
              <div className="mt-6 rounded-lg border border-gray-100 p-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="h-3 rounded bg-gray-200" />
                  <div className="h-3 rounded bg-gray-200" />
                  <div className="h-3 rounded bg-gray-200" />
                  <div className="h-3 rounded bg-primary-100" />
                  <div className="h-3 rounded bg-primary-100" />
                  <div className="h-3 rounded bg-primary-100" />
                  <div className="h-3 rounded bg-primary-100" />
                  <div className="h-3 rounded bg-primary-100" />
                  <div className="h-3 rounded bg-primary-100" />
                </div>
              </div>
              <div className="mt-6 space-y-3">
                <div className="h-3 w-full rounded bg-primary-100" />
                <div className="h-3 w-3/4 rounded bg-primary-100" />
              </div>

              {/* Scan line animation */}
              <motion.div
                animate={{ top: ['0%', '100%', '0%'] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary-400 to-transparent"
              />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
