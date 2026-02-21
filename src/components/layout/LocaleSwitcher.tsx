'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils/cn';
import type { Locale } from '@/i18n/config';

const localeLabels: Record<Locale, string> = {
  ro: 'RO',
};

export function LocaleSwitcher() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();

  function switchLocale(newLocale: Locale) {
    router.replace(pathname, { locale: newLocale });
  }

  return (
    <div className="flex items-center rounded-lg border border-gray-200 p-0.5">
      {(Object.keys(localeLabels) as Locale[]).map((loc) => (
        <button
          key={loc}
          onClick={() => switchLocale(loc)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
            locale === loc
              ? 'bg-primary-600 text-white'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          {localeLabels[loc]}
        </button>
      ))}
    </div>
  );
}
