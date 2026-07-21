'use client';

import type { SparkPoint } from '@/modules/system-health/types';

type Props = {
  points: SparkPoint[];
  className?: string;
};

export function Sparkline({ points, className }: Props) {
  if (!points.length) {
    return (
      <div className={`flex h-10 items-end text-[10px] text-[var(--muted)] ${className ?? ''}`}>
        Sin serie
      </div>
    );
  }
  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 120;
  const h = 36;
  const d = points
    .map((p, i) => {
      const x = (i / Math.max(1, points.length - 1)) * w;
      const y = h - ((p.v - min) / span) * (h - 4) - 2;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className ?? 'h-10 w-full'} aria-hidden>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" />
    </svg>
  );
}
