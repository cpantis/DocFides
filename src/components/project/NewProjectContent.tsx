'use client';

import { useTranslations } from 'next-intl';
import { NewProjectForm } from './NewProjectForm';

export function NewProjectContent() {
  const t = useTranslations('project');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="font-heading text-3xl font-bold text-gray-900">{t('new')}</h1>
        <p className="mt-2 text-gray-500">
          Create a new project to start your documentation workflow.
        </p>
        <div className="mt-8 rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <NewProjectForm />
        </div>
      </div>
    </div>
  );
}
