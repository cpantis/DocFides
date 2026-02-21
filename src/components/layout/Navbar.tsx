'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Menu, X, Shield } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const navLinks = [
  { href: '#how-it-works', key: 'howItWorks' },
  { href: '#features', key: 'features' },
] as const;

export function Navbar() {
  const t = useTranslations('nav');
  const tc = useTranslations('common');
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        isScrolled
          ? 'bg-white/95 backdrop-blur-sm shadow-sm'
          : 'bg-transparent'
      )}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <Shield className="h-7 w-7 text-primary-600" />
          <span className="font-heading text-xl font-bold text-gray-900">
            {tc('appName')}
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.key}
              href={link.href}
              className="text-sm font-medium text-gray-600 transition-colors hover:text-primary-600"
            >
              {t(link.key)}
            </a>
          ))}
        </div>

        {/* Desktop actions */}
        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/sign-in"
            className="text-sm font-medium text-gray-600 transition-colors hover:text-primary-600"
          >
            {tc('signIn')}
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
          >
            {tc('getStarted')}
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden"
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          aria-label="Toggle menu"
        >
          {isMobileOpen ? (
            <X className="h-6 w-6 text-gray-700" />
          ) : (
            <Menu className="h-6 w-6 text-gray-700" />
          )}
        </button>
      </nav>

      {/* Mobile menu */}
      {isMobileOpen && (
        <div className="border-t border-gray-100 bg-white px-6 py-4 md:hidden">
          <div className="flex flex-col gap-4">
            {navLinks.map((link) => (
              <a
                key={link.key}
                href={link.href}
                className="text-sm font-medium text-gray-600"
                onClick={() => setIsMobileOpen(false)}
              >
                {t(link.key)}
              </a>
            ))}
            <hr className="border-gray-100" />
            <Link
              href="/sign-in"
              className="text-sm font-medium text-gray-600"
            >
              {tc('signIn')}
            </Link>
            <Link
              href="/dashboard"
              className="rounded-lg bg-primary-600 px-5 py-2.5 text-center text-sm font-semibold text-white shadow-sm"
            >
              {tc('getStarted')}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
