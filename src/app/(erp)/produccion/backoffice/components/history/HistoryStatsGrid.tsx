'use client';

import { Card } from '@/components/ui';
import type { CacTrayStatsResponse } from '@/lib/backoffice/cacTrayTypes';
import type { CatalogTech } from '../../types';

type Props = {
  stats: CacTrayStatsResponse;
  loading?: boolean;
  MASTER_TECNOLOGIAS: CatalogTech[];
};

function StatNumber({ value, loading }: { value: number; loading?: boolean }) {
  if (loading) {
    return <p className="text-base font-semibold text-[var(--muted)] leading-none animate-pulse">—</p>;
  }
  return (
    <p className="text-base font-semibold text-[var(--foreground)] leading-none tabular-nums">
      {value.toLocaleString()}
    </p>
  );
}

const statCardClass =
  'px-2 py-2 border border-[var(--border)] shadow-sm bg-[var(--surface)] text-[var(--foreground)] rounded-xl flex flex-col items-center justify-center text-center gap-0.5 min-w-[4.5rem] shrink-0';

export function HistoryStatsGrid({ stats, loading = false, MASTER_TECNOLOGIAS }: Props) {
  const unknownTechUnits = stats.byTechId['__unknown__'] || 0;

  return (
    <div className="flex flex-nowrap gap-2 mb-4 overflow-x-auto custom-scrollbar pb-1 -mx-1 px-1">
      {MASTER_TECNOLOGIAS.map((tech) => {
        const count = stats.byTechId[tech.id] || 0;
        return (
          <Card key={tech.id} className={statCardClass}>
            <p className="text-[8px] font-medium uppercase tracking-wider text-[var(--muted)] truncate max-w-full px-0.5">
              {tech.nombre}
            </p>
            <StatNumber value={count} loading={loading} />
            <p className="text-[7px] font-medium text-[var(--muted)] uppercase tracking-wider">Equipos</p>
          </Card>
        );
      })}

      {unknownTechUnits > 0 && (
        <Card className="px-2 py-2 border border-rose-200 dark:border-rose-900 shadow-sm bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-100 rounded-xl flex flex-col items-center justify-center text-center gap-0.5 min-w-[4.5rem] shrink-0">
          <p className="text-[8px] font-medium uppercase tracking-wider text-rose-600 dark:text-rose-300 truncate">
            Sin Tec.
          </p>
          <StatNumber value={unknownTechUnits} loading={loading} />
          <p className="text-[7px] font-medium text-rose-500 dark:text-rose-400 uppercase tracking-wider">Revisar</p>
        </Card>
      )}

      <Card className="px-3 py-2 border-none shadow-sm bg-[var(--accent)] rounded-xl flex flex-col items-center justify-center text-center text-[var(--heading)] gap-0.5 min-w-[5.5rem] shrink-0">
        <p className="text-[8px] font-medium uppercase tracking-wider text-[var(--heading)]/80">Total OS</p>
        <p className="text-base font-semibold text-[var(--heading)] leading-none tabular-nums">
          {loading ? <span className="opacity-40 animate-pulse">—</span> : stats.total.toLocaleString()}
        </p>
        <p className="text-[7px] font-medium text-[var(--heading)]/70 uppercase tracking-wider">Unidades</p>
      </Card>
    </div>
  );
}
