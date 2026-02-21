'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Shield, User } from 'lucide-react';
import { LocaleSwitcher } from './LocaleSwitcher';
import { MOCK_USER } from '@/lib/auth/mock-auth';

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
          <div className="flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5">
            <User className="h-4 w-4 text-gray-600" />
            <span className="text-sm font-medium text-gray-700">{MOCK_USER.name}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
