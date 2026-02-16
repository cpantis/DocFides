'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Plus, LayoutDashboard } from 'lucide-react';
import { useProjects } from '@/lib/hooks/use-projects';
import { useUserStats } from '@/lib/hooks/use-user-stats';
import { ProjectCard } from '@/components/project/ProjectCard';
import { CreditsMeter } from './CreditsMeter';
import { UsageChart } from './UsageChart';
import { TimeSavedBadge } from './TimeSavedBadge';
import { RecentActivity } from './RecentActivity';
import { AlertBanner } from './AlertBanner';

export function DashboardContent() {
  const t = useTranslations('dashboard');
  const { projects, isLoading, mutate } = useProjects();
  const { stats } = useUserStats();

  const handleDelete = async (id: string) => {
    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    mutate();
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
          <Link
            href="/dashboard/new"
            className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
          >
            <Plus className="h-4 w-4" />
            {t('newProject')}
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Credit alerts */}
        {stats && <AlertBanner creditPercent={stats.credits.percentUsed} />}

        {/* Stats grid */}
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <CreditsMeter
            used={stats?.credits.used ?? 0}
            total={stats?.credits.total ?? 3}
          />
          <UsageChart />
          <TimeSavedBadge hours={stats?.timeSavedHours ?? 0} />
          <RecentActivity items={stats?.recentActivity ?? []} />
        </div>

        {/* Projects list */}
        <div className="mt-10">
          <h2 className="font-heading text-lg font-semibold text-gray-900">
            Projects
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
