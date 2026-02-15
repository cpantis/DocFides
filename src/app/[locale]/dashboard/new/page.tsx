import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default async function NewProjectPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  return <NewProjectContent />;
}

function NewProjectContent() {
  const t = useTranslations('project');

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="font-heading text-3xl font-bold text-gray-900">{t('new')}</h1>
      <p className="mt-2 text-gray-500">
        {/* New project form will go here */}
      </p>
    </div>
  );
}
