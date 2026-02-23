'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import {
  Plus,
  LayoutTemplate,
  AlertCircle,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { useTemplates } from '@/lib/hooks/use-library';
import { LibraryItemCard } from './LibraryItemCard';
import { SingleDocFormDialog } from './SingleDocFormDialog';

export function TemplateLibraryContent() {
  const t = useTranslations('library.templates');
  const tl = useTranslations('library');
  const tc = useTranslations('common');
  const { items: templates, isLoading, isError, mutate } = useTemplates();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) {
      setCreateError(t('errors.nameRequired'));
      return;
    }
    setCreateError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/library/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim() || undefined,
        }),
      });

      if (!res.ok) throw new Error();

      const { data } = await res.json();
      setNewName('');
      setNewDescription('');
      setIsCreating(false);
      await mutate();
      setSelectedId(data._id);
    } catch {
      setCreateError(t('errors.createFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/library/templates/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      mutate();
    } catch {
      // silent
    }
  };

  const icon = <LayoutTemplate className="h-5 w-5 text-primary-600" />;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/library"
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <LayoutTemplate className="h-6 w-6 text-primary-600" />
            <div>
              <h1 className="font-heading text-2xl font-bold text-gray-900">
                {t('title')}
              </h1>
              <p className="text-sm text-gray-500">{tl('title')}</p>
            </div>
          </div>
          <button
            onClick={() => setIsCreating(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
          >
            <Plus className="h-4 w-4" />
            {t('addTemplate')}
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <p className="text-sm text-gray-500">{t('description')}</p>

        {isError && (
          <div className="mt-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{tc('error')}</span>
            <button
              onClick={() => mutate()}
              className="ml-auto text-xs font-medium underline hover:no-underline"
            >
              {tc('retry')}
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <div className="mt-8 flex flex-col items-center rounded-2xl border-2 border-dashed border-gray-200 py-16">
            <LayoutTemplate className="h-12 w-12 text-gray-300" />
            <p className="mt-4 text-gray-500">{t('noTemplates')}</p>
            <button
              onClick={() => setIsCreating(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
            >
              <Plus className="h-4 w-4" />
              {t('addTemplate')}
            </button>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((item) => (
              <LibraryItemCard
                key={item._id}
                item={item}
                icon={icon}
                translationPrefix="library.templates"
                onSelect={setSelectedId}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create dialog */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => { setIsCreating(false); setCreateError(null); }}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50">
                  <LayoutTemplate className="h-5 w-5 text-primary-600" />
                </div>
                <h2 className="font-heading text-lg font-semibold text-gray-900">
                  {t('addTemplate')}
                </h2>
              </div>
              <button
                onClick={() => { setIsCreating(false); setCreateError(null); }}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <span className="sr-only">{tc('close')}</span>
                &times;
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {createError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <div>
                <label htmlFor="template-name" className="block text-sm font-medium text-gray-700">
                  {t('templateName')}
                </label>
                <input
                  id="template-name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t('templateNamePlaceholder')}
                  className="mt-1.5 w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>

              <div>
                <label htmlFor="template-desc" className="block text-sm font-medium text-gray-700">
                  {t('templateDescription')}
                </label>
                <input
                  id="template-desc"
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder={t('templateDescriptionPlaceholder')}
                  className="mt-1.5 w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button
                onClick={() => { setIsCreating(false); setCreateError(null); }}
                className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
              >
                {tc('cancel')}
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || isSubmitting}
                className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 disabled:opacity-50"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {tc('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail dialog */}
      {selectedId && (
        <SingleDocFormDialog
          itemId={selectedId}
          type="template"
          icon={<LayoutTemplate className="h-5 w-5 text-primary-600" />}
          onClose={() => setSelectedId(null)}
          onSaved={() => mutate()}
        />
      )}
    </div>
  );
}
