'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Fingerprint } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { LoginSeasonBadge, LoginSeasonalScene } from './LoginSeasonalScene';

type LoginLayoutProps = {
  brand: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

/**
 * Centered auth shell — marca e iconos fuera de la tarjeta; formulario dentro.
 */
export function LoginLayout({ brand, children, footer }: LoginLayoutProps) {
  const { seasonId } = useTheme();
  const isClassic = seasonId === 'classic';

  return (
    <div
      className={[
        'relative flex min-h-screen flex-col items-center justify-center overflow-hidden font-sans text-foreground',
        isClassic ? 'bg-background' : 'bg-slate-100',
      ].join(' ')}
    >
      <LoginSeasonalScene seasonId={seasonId} />

      {isClassic ? (
        <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
          <div
            className="absolute -top-[20%] -left-[10%] h-[50%] w-[50%] rounded-full blur-3xl"
            style={{
              background:
                'var(--login-blob-1, color-mix(in srgb, var(--accent) 22%, transparent))',
            }}
          />
          <div
            className="absolute -right-[10%] -bottom-[20%] h-[45%] w-[45%] rounded-full blur-3xl"
            style={{
              background:
                'var(--login-blob-2, color-mix(in srgb, var(--primary) 14%, transparent))',
            }}
          />
          <div
            className="absolute inset-0 opacity-[0.035] dark:opacity-[0.06]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
              backgroundSize: '28px 28px',
            }}
          />
        </div>
      ) : (
        <div
          className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-white/25 via-transparent to-black/20"
          aria-hidden
        />
      )}

      <main className="relative z-10 mt-6 w-full max-w-md px-4 py-8 sm:mt-0 sm:px-6">
        {brand}

        <div className="mb-3 flex items-center justify-end gap-2">
          <LoginSeasonBadge seasonId={seasonId} />
          <Link
            href="/kiosko"
            title="Abrir Reloj Marcador"
            aria-label="Abrir Reloj Marcador"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-accent/30 bg-white/85 text-accent shadow-sm backdrop-blur-sm transition-colors hover:bg-white"
          >
            <Fingerprint className="h-5 w-5" aria-hidden />
          </Link>
        </div>

        <div
          className={[
            'rounded-[1.35rem]',
            !isClassic ? 'p-[3px] shadow-xl' : '',
          ].join(' ')}
          style={
            !isClassic
              ? {
                  background:
                    'linear-gradient(160deg, var(--login-ribbon), color-mix(in srgb, var(--login-ribbon) 35%, white) 45%, var(--login-ribbon))',
                }
              : undefined
          }
        >
          {children}
        </div>
        {footer}
      </main>
    </div>
  );
}
