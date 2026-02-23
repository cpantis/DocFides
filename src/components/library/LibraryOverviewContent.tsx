'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
  ArrowLeft,
  LayoutTemplate,
  BookOpen,
  Building2,
  ChevronRight,
  Library,
} from 'lucide-react';

export function LibraryOverviewContent() {
  const tl = useTranslations('library');
  const tn = useTranslations('library.nav');
  const tTemplates = useTranslations('library.templates');
  const tModels = useTranslations('library.models');
  const tEntities = useTranslations('library.entities');

  const libraryLinks = [
    {
      href: '/library/templates' as const,
      title: tn('templates'),
      description: tTemplates('description'),
      icon: LayoutTemplate,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      href: '/library/models' as const,
      title: tn('models'),
      description: tModels('description'),
      icon: BookOpen,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
    {
      href: '/library/entities' as const,
      title: tn('entities'),
      description: tEntities('description'),
      icon: Building2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-5">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Library className="h-6 w-6 text-primary-600" />
          <div>
            <h1 className="font-heading text-2xl font-bold text-gray-900">
              {tl('title')}
            </h1>
            <p className="text-sm text-gray-500">{tl('description')}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {libraryLinks.map((link) => {
            const Icon = link.icon;

            return (
              <Link
                key={link.href}
                href={link.href}
                className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-primary-200 hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${link.bg}`}>
                    <Icon className={`h-6 w-6 ${link.color}`} />
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-300 transition-colors group-hover:text-primary-500" />
                </div>
                <h2 className="mt-4 font-heading text-lg font-bold text-gray-900">
                  {link.title}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {link.description}
                </p>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
