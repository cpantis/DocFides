'use client';

import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { ScanLine, Table2, RotateCcw, Languages, ArrowRight } from 'lucide-react';

export function Parsing() {
  const t = useTranslations('landing.parsing');

  return (
    <section className="bg-gray-900 px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <h2 className="font-heading text-3xl font-bold text-white sm:text-4xl">
            {t('title')}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-400">
            {t('subtitle')}
          </p>
        </motion.div>

        {/* Before / After visual */}
        <div className="mt-16 flex flex-col items-center gap-8 lg:flex-row lg:gap-12">
          {/* Before: messy scan */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex-1"
          >
            <div className="relative overflow-hidden rounded-2xl border border-gray-700 bg-gray-800 p-6">
              <div className="absolute top-3 left-3 flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-error/60" />
                <div className="h-2.5 w-2.5 rounded-full bg-warning/60" />
                <div className="h-2.5 w-2.5 rounded-full bg-success/60" />
              </div>
              <div className="mt-6 rotate-1 space-y-4 opacity-70">
                <div className="h-3 w-3/4 rounded bg-gray-600" />
                <div className="h-3 w-5/6 rounded bg-gray-600" />
                <div className="h-3 w-2/3 rounded bg-gray-600" />
                {/* Simulated table with misalignment */}
                <div className="mt-4 -rotate-1 rounded border border-gray-600 p-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="h-2.5 rounded bg-gray-500" />
                    <div className="h-2.5 rounded bg-gray-500" />
                    <div className="h-2.5 rounded bg-gray-500" />
                    <div className="h-2.5 rounded bg-gray-600/50" />
                    <div className="h-2.5 rounded bg-gray-600/50" />
                    <div className="h-2.5 rounded bg-gray-600/50" />
                    <div className="h-2.5 rounded bg-gray-600/50" />
                    <div className="h-2.5 rounded bg-gray-600/50" />
                    <div className="h-2.5 rounded bg-gray-600/50" />
                  </div>
                </div>
                <div className="h-3 w-4/5 rounded bg-gray-600" />
                <div className="h-3 w-1/2 rounded bg-gray-600" />
              </div>
              <p className="mt-4 text-center text-xs font-medium text-gray-500">
                Scanned PDF — 72 DPI
              </p>

              {/* Scan line */}
              <motion.div
                animate={{ top: ['0%', '100%', '0%'] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent-400 to-transparent"
              />
            </div>
          </motion.div>

          {/* Arrow */}
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="flex-shrink-0"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 shadow-lg shadow-primary-600/30">
              <ArrowRight className="h-6 w-6 text-white" />
            </div>
          </motion.div>

          {/* After: clean structured output */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex-1"
          >
            <div className="overflow-hidden rounded-2xl border border-gray-700 bg-gray-800 p-6">
              <div className="absolute top-3 left-3 flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-error/60" />
                <div className="h-2.5 w-2.5 rounded-full bg-warning/60" />
                <div className="h-2.5 w-2.5 rounded-full bg-success/60" />
              </div>
              {/* Clean JSON-like output */}
              <div className="mt-2 font-mono text-xs leading-relaxed">
                <div className="text-gray-500">{"{"}</div>
                <div className="ml-4">
                  <span className="text-primary-400">&quot;company&quot;</span>
                  <span className="text-gray-500">: </span>
                  <span className="text-success">&quot;SC Innovation SRL&quot;</span>
                </div>
                <div className="ml-4">
                  <span className="text-primary-400">&quot;cui&quot;</span>
                  <span className="text-gray-500">: </span>
                  <span className="text-success">&quot;RO12345678&quot;</span>
                </div>
                <div className="ml-4">
                  <span className="text-primary-400">&quot;table&quot;</span>
                  <span className="text-gray-500">: [</span>
                </div>
                <div className="ml-8">
                  <span className="text-gray-400">[&quot;Item&quot;, &quot;Qty&quot;, &quot;Total&quot;],</span>
                </div>
                <div className="ml-8">
                  <span className="text-gray-400">[&quot;Server&quot;, &quot;2&quot;, &quot;15.000 lei&quot;]</span>
                </div>
                <div className="ml-4">
                  <span className="text-gray-500">]</span>
                </div>
                <div className="ml-4">
                  <span className="text-primary-400">&quot;confidence&quot;</span>
                  <span className="text-gray-500">: </span>
                  <span className="text-accent-400">94.2</span>
                </div>
                <div className="text-gray-500">{"}"}</div>
              </div>

              {/* Confidence meter */}
              <div className="mt-4 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-700">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: '94%' }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.5, delay: 0.5 }}
                    className="h-full rounded-full bg-gradient-to-r from-success to-emerald-400"
                  />
                </div>
                <span className="text-sm font-semibold text-success">94%</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Tech badges */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-12 flex flex-wrap items-center justify-center gap-4"
        >
          {[
            { icon: ScanLine, label: t('badges.tesseract') },
            { icon: Table2, label: t('badges.tables') },
            { icon: RotateCcw, label: t('badges.deskew') },
            { icon: Languages, label: t('badges.languages') },
          ].map((badge) => {
            const Icon = badge.icon;
            return (
              <span
                key={badge.label}
                className="flex items-center gap-2 rounded-full border border-gray-700 px-4 py-2 text-sm text-gray-300"
              >
                <Icon className="h-4 w-4 text-primary-400" />
                {badge.label}
              </span>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
