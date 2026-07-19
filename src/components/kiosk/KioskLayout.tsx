'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { LoginBrand } from '@/components/auth/LoginBrand';
import {
  LoginSeasonBadge,
  LoginSeasonalScene,
} from '@/components/auth/LoginSeasonalScene';

type KioskLayoutProps = {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  /** Show discreet link back to login (`/`). Default true. */
  showBackToLogin?: boolean;
};

/**
 * Fullscreen kiosk — logo TC + atmósfera de temporada fuera de la tarjeta.
 */
export function KioskLayout({
  children,
  header,
  footer,
  showBackToLogin = true,
}: KioskLayoutProps) {
  const { seasonId } = useTheme();
  const isClassic = seasonId === 'classic';
  const lightOnDark = seasonId === 'autumn' || seasonId === 'christmas';

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-100 font-sans text-neutral-900">
      <LoginSeasonalScene seasonId={seasonId} />

      {isClassic ? (
        <div className="pointer-events-none absolute inset-0 z-0 opacity-[0.04]" aria-hidden>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
              backgroundSize: '32px 32px',
            }}
          />
        </div>
      ) : (
        <div
          className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-white/20 via-transparent to-black/15"
          aria-hidden
        />
      )}

      {showBackToLogin && (
        <div className="absolute top-4 left-4 z-20 sm:top-6 sm:left-6">
          <Link
            href="/"
            className={[
              'inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide shadow-sm backdrop-blur-md transition-colors',
              lightOnDark
                ? 'border-white/30 bg-black/25 text-white hover:bg-black/40'
                : 'border-white/50 bg-white/40 text-neutral-800 hover:bg-white/60 hover:text-neutral-950',
            ].join(' ')}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Volver al login</span>
            <span className="sm:hidden">Login</span>
          </Link>
        </div>
      )}

      <main className="relative z-10 mt-10 flex w-full max-w-5xl flex-col items-center p-4 sm:mt-4 sm:p-6 md:p-8">
        <div className="mb-2 flex w-full max-w-4xl flex-col items-center">
          <LoginBrand compact />
          <div className="mb-4 flex items-center justify-center gap-2">
            <LoginSeasonBadge seasonId={seasonId} />
          </div>
        </div>

        {header}
        {children}
        {footer}
      </main>
    </div>
  );
}
