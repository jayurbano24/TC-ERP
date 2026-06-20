'use client';

import { Card } from '@/components/ui';
import type { HistoryUnitEntry } from '../../historyTrayUtils';
import type { CatalogModel, CatalogTech } from '../../types';

type Props = {
  trayEntries: HistoryUnitEntry[];
  MASTER_TECNOLOGIAS: CatalogTech[];
  MASTER_MODELOS: CatalogModel[];
};

export function HistoryStatsGrid({ trayEntries, MASTER_TECNOLOGIAS, MASTER_MODELOS }: Props) {
  const techCounts: Record<string, number> = {};
  let unknownTechUnits = 0;

  trayEntries.forEach((entry) => {
    const model = MASTER_MODELOS.find((m) => m.id === entry.grp.modelId);
    if (model?.tecnologiaId) {
      techCounts[model.tecnologiaId] = (techCounts[model.tecnologiaId] || 0) + 1;
    } else {
      unknownTechUnits += 1;
    }
  });

  const totalGlobalUnits = trayEntries.length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-9 gap-4 mb-10">
      {MASTER_TECNOLOGIAS.map((tech) => {
        const count = Math.ceil(techCounts[tech.id] || 0);
        return (
          <Card
            key={tech.id}
            className="p-6 border-none shadow-2xl bg-white rounded-[2.5rem] flex flex-col items-center justify-center text-center group hover:bg-[#181c3a] transition-all duration-500 border border-slate-100/50 h-40"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 group-hover:text-white/50 mb-4">
              {tech.nombre}
            </p>
            <p className="text-5xl font-black text-[#181c3a] group-hover:text-[#2ec4f1] leading-none tracking-tighter">
              {count}
            </p>
            <p className="text-[9px] font-black text-slate-300 group-hover:text-white/20 uppercase mt-4 tracking-widest">
              Equipos
            </p>
          </Card>
        );
      })}

      {unknownTechUnits > 0 && (
        <Card className="p-6 border-none shadow-2xl bg-rose-50 rounded-[2.5rem] flex flex-col items-center justify-center text-center group hover:bg-rose-500 transition-all duration-500 border border-rose-100 h-40">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-400 group-hover:text-white mb-4">
            SIN TECNOLOGÍA
          </p>
          <p className="text-5xl font-black text-rose-500 group-hover:text-white leading-none tracking-tighter">
            {Math.ceil(unknownTechUnits)}
          </p>
          <p className="text-[9px] font-black text-rose-200 group-hover:text-white/50 uppercase mt-4 tracking-widest">
            Revisar Modelos
          </p>
        </Card>
      )}

      <Card className="p-6 border-none shadow-2xl bg-white rounded-[2.5rem] flex flex-col items-center justify-center text-center group hover:bg-[#181c3a] transition-all duration-500 border border-slate-100/50 h-40">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 group-hover:text-white/50 mb-4">
          Total Global
        </p>
        <p className="text-5xl font-black text-[#181c3a] group-hover:text-[#2ec4f1] leading-none tracking-tighter">
          {Math.ceil(totalGlobalUnits)}
        </p>
        <p className="text-[9px] font-black text-slate-300 group-hover:text-white/20 uppercase mt-4 tracking-widest">
          Unidades
        </p>
      </Card>

      <Card className="p-6 border-none shadow-2xl bg-[#2ec4f1] rounded-[2.5rem] flex flex-col items-center justify-center text-center text-[#181c3a] h-40">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#181c3a]/30 mb-4">Órdenes (OS)</p>
        <p className="text-6xl font-black text-[#181c3a] leading-none tracking-tighter">
          {new Set(trayEntries.map((e) => e.osLabel)).size}
        </p>
        <p className="text-[9px] font-black text-[#181c3a]/20 uppercase mt-4 tracking-widest">Generadas</p>
      </Card>
    </div>
  );
}
