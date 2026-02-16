'use client';

import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { Upload, Cpu, PenLine, Download } from 'lucide-react';

const steps = [
  { key: 'upload', icon: Upload, color: 'text-primary-600 bg-primary-100' },
  { key: 'process', icon: Cpu, color: 'text-accent-500 bg-accent-300/30' },
  { key: 'review', icon: PenLine, color: 'text-success bg-green-100' },
  { key: 'export', icon: Download, color: 'text-primary-700 bg-primary-100' },
] as const;

export function HowItWorks() {
  const t = useTranslations('landing.howItWorks');

  return (
    <section id="how-it-works" className="bg-gray-50 px-6 py-24">
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

        <div className="relative mt-20">
          {/* Connecting line (desktop) */}
          <div className="absolute top-16 left-[12.5%] right-[12.5%] hidden h-0.5 bg-gradient-to-r from-primary-200 via-accent-300 to-primary-200 lg:block" />

          <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.key}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-50px' }}
                  transition={{ duration: 0.5, delay: index * 0.15 }}
                  className="relative flex flex-col items-center text-center"
                >
                  {/* Step number */}
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary-600 px-2.5 py-0.5 text-xs font-bold text-white lg:-top-4">
                    {index + 1}
                  </div>
                  {/* Icon circle */}
                  <div className={`flex h-32 w-32 items-center justify-center rounded-2xl ${step.color}`}>
                    <Icon className="h-12 w-12" />
                  </div>
                  <h3 className="mt-6 font-heading text-lg font-semibold text-gray-900">
                    {t(`steps.${step.key}.title`)}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">
                    {t(`steps.${step.key}.description`)}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
