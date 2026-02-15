import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  return <DashboardContent />;
}

function DashboardContent() {
  const t = useTranslations('dashboard');

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl font-bold text-gray-900">{t('title')}</h1>
        <a
          href="/dashboard/new"
          className="rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 transition-colors"
        >
          {t('newProject')}
        </a>
      </div>
      <div className="mt-8">
        <p className="text-gray-500">{t('noProjects')}</p>
      </div>
    </div>
  );
}
