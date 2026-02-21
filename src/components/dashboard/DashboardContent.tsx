'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Plus, LayoutDashboard, AlertCircle, BookOpen } from 'lucide-react';
import { useProjects } from '@/lib/hooks/use-projects';
import { ProjectCard } from '@/components/project/ProjectCard';

export function DashboardContent() {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');
  const { projects, isLoading, isError, mutate } = useProjects();

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        console.error(`[Dashboard] Delete failed for project ${id}: ${res.status}`);
      }
      mutate();
    } catch (error) {
      console.error('[Dashboard] Delete request failed:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-6 py-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <LayoutDashboard className="h-6 w-6 text-primary-600" />
            <h1 className="font-heading text-2xl font-bold text-gray-900">
              {t('title')}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/library"
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
            >
              <BookOpen className="h-4 w-4" />
              {t('library')}
            </Link>
            <Link
              href="/dashboard/new"
              className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
            >
              <Plus className="h-4 w-4" />
              {t('newProject')}
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Connection error */}
        {isError && (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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

        {/* Projects list */}
        <div>
          <h2 className="font-heading text-lg font-semibold text-gray-900">
            {t('projectsHeading')}
          </h2>

          {isLoading ? (
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-40 animate-pulse rounded-2xl bg-gray-100" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="mt-6 flex flex-col items-center rounded-2xl border-2 border-dashed border-gray-200 py-16">
              <LayoutDashboard className="h-12 w-12 text-gray-300" />
              <p className="mt-4 text-gray-500">{t('noProjects')}</p>
              <Link
                href="/dashboard/new"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
              >
                <Plus className="h-4 w-4" />
                {t('newProject')}
              </Link>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <ProjectCard
                  key={project._id}
                  id={project._id}
                  name={project.name}
                  status={project.status}
                  sourceCount={project.sourceDocuments.length}
                  updatedAt={project.updatedAt}
                  aiCost={project.aiCost}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
