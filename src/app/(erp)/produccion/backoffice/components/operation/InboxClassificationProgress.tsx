'use client';

import { erpTypography } from '@/lib/design/tokens';
import { getInboxClassificationStats } from '../../operation/classificationGuideUtils';
import type { BackofficeReception } from '../../types';

type Props = {
  rec: BackofficeReception;
  allReceptions?: BackofficeReception[];
};

export function InboxClassificationProgress({ rec, allReceptions = [] }: Props) {
  const { classified, total, remaining } = getInboxClassificationStats(rec, allReceptions);
  const showGuideProgress = total > 1;

  if (!showGuideProgress) {
    return (
      <div>
        <p className={erpTypography.label}>Unidades</p>
        <p className="text-sm font-black text-[var(--foreground)] leading-tight mt-1">
          {rec.received_units ?? 1} bulto{(rec.received_units ?? 1) !== 1 ? 's' : ''}
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className={erpTypography.label}>Clasificación</p>
      <div className="flex items-baseline mt-1">
        <span className="text-lg font-black text-[var(--foreground)] tabular-nums">{classified}</span>
        <span className="text-[var(--muted)] text-xs font-bold mx-1">/</span>
        <span className="text-sm font-bold text-[var(--muted)] tabular-nums">{total}</span>
        <span className="text-[var(--muted)] text-[10px] font-bold ml-1 uppercase">guías</span>
      </div>
      {remaining > 0 ? (
        <p className="text-[9px] font-black text-rose-400 mt-1 tracking-widest uppercase">
          Faltan {remaining}
        </p>
      ) : (
        <p className="text-[9px] font-black text-emerald-400 mt-1 tracking-widest uppercase">
          Completo
        </p>
      )}
    </div>
  );
}
