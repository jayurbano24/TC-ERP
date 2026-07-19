import React from 'react';
import { Card } from './Card';
import { ErpIcon, type ErpIconName } from '@/lib/design/icons';
import { erpTypography } from '@/lib/design/tokens';

type StatCardAccent = 'cyan' | 'emerald' | 'amber' | 'slate' | 'rose';

const accentBorder: Record<StatCardAccent, string> = {
  cyan: 'border-l-[var(--accent)]',
  emerald: 'border-l-[var(--success)]',
  amber: 'border-l-[var(--warning)]',
  slate: 'border-l-[var(--muted)]',
  rose: 'border-l-[var(--danger)]',
};

type StatCardProps = {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: ErpIconName;
  accent?: StatCardAccent;
  className?: string;
};

/** Tarjeta KPI / resumen — usar para métricas importantes en todos los módulos. */
export function StatCard({ label, value, hint, icon, accent = 'cyan', className = '' }: StatCardProps) {
  return (
    <Card
      padding="md"
      className={`border-l-4 ${accentBorder[accent]} shadow-md ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={erpTypography.label}>{label}</p>
          <div className="mt-2 truncate text-2xl font-bold text-heading sm:text-3xl lg:text-4xl">{value}</div>
          {hint && (
            <p className="mt-1 text-[10px] font-semibold tracking-wide text-muted uppercase">{hint}</p>
          )}
        </div>
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-hover">
            <ErpIcon name={icon} className="h-5 w-5 text-accent" />
          </div>
        )}
      </div>
    </Card>
  );
}
