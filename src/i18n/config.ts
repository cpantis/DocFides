export const locales = ['ro'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'ro';
