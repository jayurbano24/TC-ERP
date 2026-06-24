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
    return <p className="text-5xl font-black text-[var(--muted)] leading-none animate-pulse">—</p>;
  }
  return (
    <p className="text-5xl font-black text-[var(--foreground)] group-hover:text-[#2ec4f1] leading-none tracking-tighter">
      {value}
    </p>
  );
}

const statCardClass =
  'p-6 border-none shadow-2xl bg-[var(--surface)] text-[var(--foreground)] rounded-[2.5rem] flex flex-col items-center justify-center text-center group hover:bg-[#181c3a] hover:text-white transition-all duration-500 border border-[var(--border)] h-40';

export function HistoryStatsGrid({ stats, loading = false, MASTER_TECNOLOGIAS }: Props) {
  const unknownTechUnits = stats.byTechId['__unknown__'] || 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-9 gap-4 mb-10">
      {MASTER_TECNOLOGIAS.map((tech) => {
        const count = stats.byTechId[tech.id] || 0;
        return (
          <Card key={tech.id} className={statCardClass}>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)] group-hover:text-white/70 mb-4">
              {tech.nombre}
            </p>
            <StatNumber value={count} loading={loading} />
            <p className="text-[9px] font-black text-[var(--muted)] group-hover:text-white/60 uppercase mt-4 tracking-widest">
              Equipos
            </p>
          </Card>
        );
      })}

      {unknownTechUnits > 0 && (
        <Card className="p-6 border-none shadow-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-100 rounded-[2.5rem] flex flex-col items-center justify-center text-center group hover:bg-rose-500 hover:text-white transition-all duration-500 border border-rose-100 dark:border-rose-900 h-40">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-700 dark:text-rose-300 group-hover:text-white mb-4">
            SIN TECNOLOGÍA
          </p>
          <StatNumber value={unknownTechUnits} loading={loading} />
          <p className="text-[9px] font-black text-rose-600 dark:text-rose-400 group-hover:text-white/70 uppercase mt-4 tracking-widest">
            Revisar Modelos
          </p>
        </Card>
      )}

      <Card className={statCardClass}>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)] group-hover:text-white/70 mb-4">
          Total Global
        </p>
        <StatNumber value={stats.total} loading={loading} />
        <p className="text-[9px] font-black text-[var(--muted)] group-hover:text-white/60 uppercase mt-4 tracking-widest">
          Unidades
        </p>
      </Card>

      <Card className="p-6 border-none shadow-2xl bg-[#2ec4f1] rounded-[2.5rem] flex flex-col items-center justify-center text-center text-[#181c3a] h-40">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#181c3a] mb-4">Órdenes (OS)</p>
        <p className="text-6xl font-black text-[#181c3a] leading-none tracking-tighter">
          {loading ? <span className="text-[#181c3a]/30 animate-pulse">—</span> : stats.total}
        </p>
        <p className="text-[9px] font-black text-[#181c3a]/80 uppercase mt-4 tracking-widest">Generadas</p>
      </Card>
    </div>
  );
}
