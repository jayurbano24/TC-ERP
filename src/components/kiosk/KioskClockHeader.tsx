'use client';

import { Clock, Lock } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';

type KioskClockHeaderProps = {
  time: Date | null;
  onLock: () => void;
};

export function KioskClockHeader({ time, onLock }: KioskClockHeaderProps) {
  const { seasonId } = useTheme();
  const lightOnDark = seasonId === 'autumn' || seasonId === 'christmas';

  const timeLabel = time
    ? time.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
    : '00:00:00';

  const dateLabel = time
    ? time.toLocaleDateString('es-GT', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Cargando fecha...';

  return (
    <div className="relative mb-6 flex w-full flex-col items-center text-center sm:mb-8">
      <button
        type="button"
        onClick={onLock}
        className={[
          'absolute top-0 right-0 flex min-h-11 min-w-11 items-center justify-center rounded-xl transition-colors',
          lightOnDark
            ? 'text-white/70 hover:bg-white/15 hover:text-white'
            : 'text-neutral-500 hover:bg-neutral-200 hover:text-danger',
        ].join(' ')}
        title="Bloquear Terminal"
        aria-label="Bloquear terminal"
      >
        <Lock className="h-5 w-5" />
      </button>

      <div
        className={[
          'mb-4 inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 shadow-sm backdrop-blur-md',
          lightOnDark
            ? 'border-white/30 bg-black/25'
            : 'border-white/50 bg-white/40',
        ].join(' ')}
      >
        <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
        <span
          className={[
            'text-xs font-semibold uppercase tracking-wide',
            lightOnDark ? 'text-white' : 'text-neutral-800',
          ].join(' ')}
        >
          Terminal Kiosko Activa
        </span>
      </div>

      <h1
        className={[
          'mb-2 font-mono text-5xl font-bold tabular-nums tracking-tight sm:text-7xl md:text-8xl',
          lightOnDark
            ? 'text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]'
            : 'text-neutral-900',
        ].join(' ')}
      >
        {timeLabel}
      </h1>
      <p
        className={[
          'flex items-center justify-center gap-2 text-sm font-medium uppercase tracking-wide sm:text-base',
          lightOnDark ? 'text-white/85' : 'text-neutral-600',
        ].join(' ')}
      >
        <Clock className="h-4 w-4 text-accent" aria-hidden />
        {dateLabel}
      </p>
    </div>
  );
}
