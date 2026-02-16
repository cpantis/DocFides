'use client';

import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { Check, Star } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils/cn';

const plans = [
  { key: 'free', featured: false },
  { key: 'professional', featured: true },
  { key: 'enterprise', featured: false },
] as const;

const planFeatureKeys = {
  free: ['docs', 'storage', 'support'],
  professional: ['docs', 'storage', 'support', 'models'],
  enterprise: ['docs', 'storage', 'support', 'sso'],
} as const;

export function Pricing() {
  const t = useTranslations('landing.pricing');

  return (
    <section id="pricing" className="bg-gray-50 px-6 py-24">
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

        <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3">
          {plans.map((plan, index) => {
            const featureKeys = planFeatureKeys[plan.key];
            return (
              <motion.div
                key={plan.key}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.5, delay: index * 0.15 }}
                className={cn(
                  'relative flex flex-col rounded-2xl border p-8',
                  plan.featured
                    ? 'border-primary-300 bg-white shadow-xl shadow-primary-600/10 ring-1 ring-primary-300'
                    : 'border-gray-200 bg-white'
                )}
              >
                {plan.featured && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-primary-600 px-4 py-1 text-xs font-semibold text-white">
                    <Star className="mr-1 inline h-3 w-3" />
                    {t(`${plan.key}.popular`)}
                  </div>
                )}

                <h3 className="font-heading text-xl font-bold text-gray-900">
                  {t(`${plan.key}.name`)}
                </h3>

                <div className="mt-4 flex items-baseline gap-1">
                  <span className={cn(
                    'text-4xl font-bold',
                    plan.featured ? 'text-primary-600' : 'text-gray-900'
                  )}>
                    {t(`${plan.key}.price`)}
                  </span>
                  {t(`${plan.key}.currency`) && (
                    <span className="text-sm text-gray-500">
                      {t(`${plan.key}.currency`)}/{t(`${plan.key}.period`)}
                    </span>
                  )}
                </div>

                <ul className="mt-8 flex-1 space-y-3">
                  {featureKeys.map((featureKey) => (
                    <li key={featureKey} className="flex items-start gap-3 text-sm text-gray-600">
                      <Check className={cn(
                        'mt-0.5 h-4 w-4 flex-shrink-0',
                        plan.featured ? 'text-primary-600' : 'text-success'
                      )} />
                      {t(`${plan.key}.features.${featureKey}`)}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/dashboard"
                  className={cn(
                    'mt-8 block rounded-xl py-3 text-center text-sm font-semibold transition-colors',
                    plan.featured
                      ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/25 hover:bg-primary-700'
                      : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                  )}
                >
                  {t(`${plan.key}.cta`)}
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
