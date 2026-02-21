import createIntlMiddleware from 'next-intl/middleware';
import { locales, defaultLocale } from '@/i18n/config';

const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'as-needed',
});

export default function middleware(req: Parameters<typeof intlMiddleware>[0]) {
  return intlMiddleware(req);
}

export const config = {
  matcher: [
    '/((?!api|_next|_vercel|.*\\..*).*)',
    '/(en|ro)/:path*',
  ],
};
