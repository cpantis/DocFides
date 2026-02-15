import { useTranslations } from 'next-intl';

export default function LandingPage() {
  const t = useTranslations('landing');

  return (
    <main className="flex min-h-screen flex-col">
      {/* Hero Section */}
      <section className="relative flex items-center justify-center px-6 py-24 lg:py-32">
        <div className="mx-auto max-w-7xl text-center">
          <h1 className="font-heading text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
            {t('hero.title')}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600">
            {t('hero.subtitle')}
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <a
              href="/dashboard"
              className="rounded-lg bg-primary-600 px-8 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 transition-colors"
            >
              {t('hero.cta')}
            </a>
            <a
              href="#how-it-works"
              className="rounded-lg border border-gray-300 px-8 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {t('hero.secondaryCta')}
            </a>
          </div>
        </div>
      </section>

      {/* Placeholder sections — will be replaced by landing components */}
      <section id="how-it-works" className="bg-gray-50 px-6 py-24">
        <div className="mx-auto max-w-7xl text-center">
          <h2 className="font-heading text-3xl font-bold text-gray-900">
            {t('howItWorks.title')}
          </h2>
          <p className="mt-4 text-gray-600">{t('howItWorks.subtitle')}</p>
        </div>
      </section>

      <section id="features" className="px-6 py-24">
        <div className="mx-auto max-w-7xl text-center">
          <h2 className="font-heading text-3xl font-bold text-gray-900">
            {t('features.title')}
          </h2>
          <p className="mt-4 text-gray-600">{t('features.subtitle')}</p>
        </div>
      </section>

      <section id="pricing" className="bg-gray-50 px-6 py-24">
        <div className="mx-auto max-w-7xl text-center">
          <h2 className="font-heading text-3xl font-bold text-gray-900">
            {t('pricing.title')}
          </h2>
          <p className="mt-4 text-gray-600">{t('pricing.subtitle')}</p>
        </div>
      </section>

      <section id="faq" className="px-6 py-24">
        <div className="mx-auto max-w-7xl text-center">
          <h2 className="font-heading text-3xl font-bold text-gray-900">
            {t('faq.title')}
          </h2>
        </div>
      </section>
    </main>
  );
}
