import { useTranslations } from 'next-intl';

export default async function AdminPage() {
  return <AdminContent />;
}

function AdminContent() {
  const t = useTranslations('admin');

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <h1 className="font-heading text-3xl font-bold text-gray-900">{t('title')}</h1>
    </div>
  );
}
