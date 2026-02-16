'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { UserButton } from '@clerk/nextjs';
import { Shield } from 'lucide-react';
import { LocaleSwitcher } from './LocaleSwitcher';

export function DashboardHeader() {
  const tc = useTranslations('common');

  return (
    <header className="border-b border-gray-100 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary-600" />
          <span className="font-heading text-lg font-bold text-gray-900">
            {tc('appName')}
          </span>
        </Link>

        <div className="flex items-center gap-4">
          <LocaleSwitcher />
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: {
                avatarBox: 'h-8 w-8',
              },
            }}
          />
        </div>
      </div>
    </header>
  );
}
