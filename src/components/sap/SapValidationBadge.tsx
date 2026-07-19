'use client';

import {
  getSapStatusMeta,
  normalizeSeriesSapStatus,
  type SapValidationState,
} from '@/lib/sap/sapValidationStatus';

type Props = {
  status: SapValidationState;
  compact?: boolean;
};

export function SapValidationBadge({ status, compact }: Props) {
  const meta = getSapStatusMeta(status);
  return (
    <span
      className={`inline-flex items-center text-[9px] uppercase font-black tracking-widest px-2.5 py-1 rounded-full whitespace-nowrap ${meta.className}`}
      title={meta.label}
    >
      {compact ? meta.shortLabel : meta.label}
    </span>
  );
}

type SeriesProps = {
  statuses: (string | null | undefined)[];
};

/** Indicador por serie (S1–S4) según sap_status de Integración SAP. */
export function SeriesSapValidationDots({ statuses }: SeriesProps) {
  const visible = statuses.filter((raw) => {
    const t = String(raw ?? '').trim();
    return t.length > 0 && t !== '—';
  });
  if (!visible.length) return <span className="text-[10px] text-[var(--muted)]">—</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((raw, idx) => {
        const state = normalizeSeriesSapStatus(raw);
        const meta = getSapStatusMeta(state);
        return (
          <span
            key={`sap-s${idx + 1}`}
            className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${meta.className}`}
            title={`S${idx + 1}: ${meta.label}`}
          >
            S{idx + 1}
          </span>
        );
      })}
    </div>
  );
}
