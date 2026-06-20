import React from 'react';
import { Card } from './Card';
import { erpTypography } from '@/lib/design/tokens';

type PageSectionProps = {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  accent?: 'none' | 'cyan' | 'emerald' | 'amber';
  className?: string;
};

const accentMap = {
  none: '',
  cyan: 'border-l-4 border-l-[#2ec4f1]',
  emerald: 'border-l-4 border-l-emerald-500',
  amber: 'border-l-4 border-l-amber-400',
};

/** Sección con tarjeta — agrupa información importante dentro de un módulo. */
export function PageSection({
  title,
  subtitle,
  actions,
  children,
  padding = 'md',
  accent = 'none',
  className = '',
}: PageSectionProps) {
  return (
    <section className={`space-y-4 ${className}`}>
      {(title || actions) && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            {title && <h2 className={erpTypography.sectionTitle}>{title}</h2>}
            {subtitle && (
              <p className="text-xs font-bold text-slate-400 mt-1 max-w-2xl">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      <Card padding={padding} className={`shadow-sm ${accentMap[accent]}`}>
        {children}
      </Card>
    </section>
  );
}
