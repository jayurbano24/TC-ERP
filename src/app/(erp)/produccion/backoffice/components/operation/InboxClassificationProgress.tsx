'use client';

import { erpTypography } from '@/lib/design/tokens';
import { getInboxClassificationStats } from '../../operation/classificationGuideUtils';
import type { BackofficeReception } from '../../types';

type Props = {
  rec: BackofficeReception;
};

export function InboxClassificationProgress({ rec }: Props) {
  const { classified, total, remaining } = getInboxClassificationStats(rec);
  const showGuideProgress = total > 1;

  if (!showGuideProgress) {
    return (
      <div>
        <p className={erpTypography.label}>Unidades</p>
        <p className="text-sm font-black text-[#181c3a] leading-tight mt-1">
          {rec.received_units ?? 1} bulto{(rec.received_units ?? 1) !== 1 ? 's' : ''}
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className={erpTypography.label}>Clasificación</p>
      <div className="flex items-baseline mt-1">
        <span className="text-lg font-black text-[#181c3a] tabular-nums">{classified}</span>
        <span className="text-slate-500 text-xs font-bold mx-1">/</span>
        <span className="text-sm font-bold text-slate-600 tabular-nums">{total}</span>
        <span className="text-slate-600 text-[10px] font-bold ml-1 uppercase">guías</span>
      </div>
      {remaining > 0 ? (
        <p className="text-[9px] font-black text-rose-500 mt-1 tracking-widest uppercase">
          Faltan {remaining}
        </p>
      ) : (
        <p className="text-[9px] font-black text-emerald-700 mt-1 tracking-widest uppercase">
          Completo
        </p>
      )}
    </div>
  );
}
