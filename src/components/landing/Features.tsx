'use client';

import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { Workflow, ScanText, Users, Palette, ShieldCheck, FileOutput } from 'lucide-react';

const features = [
  { key: 'aiPipeline', icon: Workflow, gradient: 'from-primary-500 to-primary-700' },
  { key: 'ocr', icon: ScanText, gradient: 'from-accent-400 to-accent-600' },
  { key: 'entityDetection', icon: Users, gradient: 'from-emerald-500 to-emerald-700' },
  { key: 'styleMatching', icon: Palette, gradient: 'from-violet-500 to-violet-700' },
  { key: 'verification', icon: ShieldCheck, gradient: 'from-sky-500 to-sky-700' },
  { key: 'export', icon: FileOutput, gradient: 'from-rose-500 to-rose-700' },
] as const;

export function Features() {
  const t = useTranslations('landing.features');

  return (
    <section id="features" className="px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <h2 className="font-heading text-3xl font-bold text-gray-900 sm:text-4xl">
            {t('title')}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
            {t('subtitle')}
          </p>
        </motion.div>

        <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.key}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="group relative rounded-2xl border border-gray-100 bg-white p-8 shadow-sm transition-all hover:border-primary-100 hover:shadow-md"
              >
                <div className={`inline-flex rounded-xl bg-gradient-to-br ${feature.gradient} p-3`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="mt-5 font-heading text-lg font-semibold text-gray-900">
                  {t(`items.${feature.key}.title`)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">
                  {t(`items.${feature.key}.description`)}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
