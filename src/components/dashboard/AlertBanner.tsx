'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Link } from '@/i18n/navigation';

interface AlertBannerProps {
  creditPercent: number;
}

export function AlertBanner({ creditPercent }: AlertBannerProps) {
  const t = useTranslations('dashboard.credits');
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || creditPercent < 80) return null;

  const isExhausted = creditPercent >= 100;

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl px-4 py-3',
        isExhausted ? 'bg-red-50 text-error' : 'bg-amber-50 text-amber-700'
      )}
    >
      <AlertTriangle className="h-5 w-5 flex-shrink-0" />
      <p className="flex-1 text-sm font-medium">
        {isExhausted ? t('exhausted') : t('warning', { percent: String(creditPercent) })}
      </p>
      <Link
        href="/dashboard"
        className={cn(
          'rounded-lg px-3 py-1.5 text-xs font-semibold text-white',
          isExhausted ? 'bg-error' : 'bg-amber-600'
        )}
      >
        Upgrade
      </Link>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
