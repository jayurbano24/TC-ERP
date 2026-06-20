import React from 'react';
import { Card } from './Card';
import { erpCard } from '@/lib/design/tokens';

type RecordListCardAccent = keyof typeof erpCard.listMetaAccent;

type RecordListCardProps = {
  accent?: RecordListCardAccent;
  meta: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  highlight?: boolean;
};

/**
 * Tarjeta de bandeja / listado — acento lateral suave (no bloque sólido oscuro).
 */
export function RecordListCard({
  accent = 'default',
  meta,
  footer,
  children,
  className = '',
  highlight = false,
}: RecordListCardProps) {
  return (
    <Card
      padding="none"
      className={`${erpCard.list} ${highlight ? 'border-rose-200 ring-1 ring-rose-100' : ''} ${className}`}
    >
      <div className="flex flex-col sm:flex-row">
        <div className={`${erpCard.listMeta} ${erpCard.listMetaAccent[accent]}`}>{meta}</div>
        <div className={erpCard.listBody}>
          {children}
          {footer && <div className="mt-4 pt-3 border-t border-slate-100">{footer}</div>}
        </div>
      </div>
    </Card>
  );
}
