import React from 'react';
import { Card } from './Card';
import { ErpIcon, type ErpIconName } from '@/lib/design/icons';
import { erpTypography } from '@/lib/design/tokens';

type StatCardAccent = 'cyan' | 'emerald' | 'amber' | 'slate' | 'rose';

const accentBorder: Record<StatCardAccent, string> = {
  cyan: 'border-l-[#2ec4f1]',
  emerald: 'border-l-emerald-500',
  amber: 'border-l-amber-400',
  slate: 'border-l-slate-400',
  rose: 'border-l-rose-400',
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
          <div className="text-2xl sm:text-3xl lg:text-4xl font-black text-[#181c3a] mt-2 truncate">{value}</div>
          {hint && (
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{hint}</p>
          )}
        </div>
        {icon && (
          <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
            <ErpIcon name={icon} className="w-5 h-5 text-[#2ec4f1]" />
          </div>
        )}
      </div>
    </Card>
  );
}
