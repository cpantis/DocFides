import { useTranslations } from 'next-intl';
import { Shield } from 'lucide-react';

export function Footer() {
  const t = useTranslations('footer');
  const tc = useTranslations('common');
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-100 bg-gray-50 px-6 py-16">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary-600" />
              <span className="font-heading text-lg font-bold text-gray-900">
                {tc('appName')}
              </span>
            </div>
            <p className="mt-3 text-sm text-gray-500">
              {tc('tagline')}
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900">{t('product')}</h4>
            <ul className="mt-4 space-y-3">
              <li><a href="#features" className="text-sm text-gray-500 hover:text-primary-600">{t('product')}</a></li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900">{t('company')}</h4>
            <ul className="mt-4 space-y-3">
              <li><a href="#" className="text-sm text-gray-500 hover:text-primary-600">{t('about')}</a></li>
              <li><a href="#" className="text-sm text-gray-500 hover:text-primary-600">{t('contact')}</a></li>
              <li><a href="#" className="text-sm text-gray-500 hover:text-primary-600">{t('blog')}</a></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900">{t('legal')}</h4>
            <ul className="mt-4 space-y-3">
              <li><a href="#" className="text-sm text-gray-500 hover:text-primary-600">{t('privacy')}</a></li>
              <li><a href="#" className="text-sm text-gray-500 hover:text-primary-600">{t('terms')}</a></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-gray-200 pt-8 text-center">
          <p className="text-sm text-gray-400">
            {t('copyright', { year: String(year) })}
          </p>
        </div>
      </div>
    </footer>
  );
}
