import { SignUp } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';

export default function SignUpPage() {
  const t = useTranslations('auth.signUp');

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-heading text-2xl font-bold text-gray-900">{t('title')}</h1>
          <p className="mt-2 text-gray-600">{t('subtitle')}</p>
        </div>
        <SignUp />
      </div>
    </div>
  );
}
