import React, { useState } from 'react';
import { Card, Badge } from '@/components/ui';
import { Award, Cpu, Layers, User } from 'lucide-react';
import type { ProductivityKpiPayload } from '@/modules/kpi-analytics/client/kpiProductivity';

type TabId = 'personas' | 'tecnologias' | 'modelos';

function pct(value: number | null) {
  if (value === null) return '—';
  return `${value}%`;
}

function RankingBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Badge className="bg-amber-100 text-amber-800 font-black text-[10px]">#1</Badge>;
  if (rank === 2) return <Badge className="bg-slate-200 text-slate-700 font-black text-[10px]">#2</Badge>;
  if (rank === 3) return <Badge className="bg-orange-100 text-orange-800 font-black text-[10px]">#3</Badge>;
  return <span className="text-[10px] font-bold text-slate-400">#{rank}</span>;
}

export function ProductivityKpiPanel({
  data,
}: {
  data: ProductivityKpiPayload | undefined;
}) {
  const [tab, setTab] = useState<TabId>('personas');
  if (!data) return null;

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'personas', label: 'Por persona', icon: <User className="w-3.5 h-3.5" /> },
    { id: 'tecnologias', label: 'Por tecnología', icon: <Cpu className="w-3.5 h-3.5" /> },
    { id: 'modelos', label: 'Por modelo', icon: <Layers className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="mx-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-violet-600 text-white">
            <Award size={18} />
          </div>
          <div>
            <h3 className="text-sm font-black text-[#181c3a] uppercase tracking-wider">
              KPI Productividad · Nivel 3
            </h3>
            <p className="text-[10px] text-slate-500 font-medium">
              Ranking · metas · productividad ponderada · yield · equipos únicos (listo)
            </p>
          </div>
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide transition-colors ${
                tab === t.id ? 'bg-white text-[#181c3a] shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <Card className="border border-slate-200 overflow-hidden bg-white">
        {tab === 'personas' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left min-w-[960px]">
              <thead>
                <tr className="bg-[#181c3a] text-white">
                  <th className="p-2.5 font-bold">#</th>
                  <th className="p-2.5 font-bold">Persona</th>
                  <th className="p-2.5 font-bold text-center">Meta día</th>
                  <th className="p-2.5 font-bold text-center">Hoy</th>
                  <th className="p-2.5 font-bold text-center">Ayer</th>
                  <th className="p-2.5 font-bold text-center">Semana</th>
                  <th className="p-2.5 font-bold text-center">Mes</th>
                  <th className="p-2.5 font-bold text-center">Cumpl.</th>
                  <th className="p-2.5 font-bold text-center">Pond.</th>
                  <th className="p-2.5 font-bold text-center">Efic.</th>
                  <th className="p-2.5 font-bold text-center">Yield</th>
                  <th className="p-2.5 font-bold text-center">Rech.</th>
                  <th className="p-2.5 font-bold text-center">Scrap</th>
                </tr>
              </thead>
              <tbody>
                {data.personas.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="p-8 text-center text-slate-400">
                      Sin actividad de productividad
                    </td>
                  </tr>
                ) : (
                  data.personas.map((row) => (
                    <tr key={row.usuario} className="border-b border-slate-50 hover:bg-slate-50/80">
                      <td className="p-2.5">
                        <RankingBadge rank={row.ranking} />
                      </td>
                      <td className="p-2.5 font-black text-[#181c3a]">{row.usuario}</td>
                      <td className="p-2.5 text-center font-semibold text-slate-500">
                        {row.metaDia > 0 ? row.metaDia : '—'}
                      </td>
                      <td className="p-2.5 text-center font-black text-indigo-600">{row.hoy}</td>
                      <td className="p-2.5 text-center font-semibold">{row.ayer || '—'}</td>
                      <td className="p-2.5 text-center font-bold text-blue-600">{row.semana || '—'}</td>
                      <td className="p-2.5 text-center font-bold text-slate-700">{row.mes || '—'}</td>
                      <td className="p-2.5 text-center font-bold">{pct(row.cumplimientoPct)}</td>
                      <td className="p-2.5 text-center font-black text-violet-600">
                        {row.productividadPonderada}
                      </td>
                      <td className="p-2.5 text-center font-semibold">{pct(row.eficienciaPct)}</td>
                      <td className="p-2.5 text-center font-semibold text-emerald-600">
                        {pct(row.yieldPct)}
                      </td>
                      <td className="p-2.5 text-center font-bold text-rose-600">
                        {row.rechazosQC || '—'}
                      </td>
                      <td className="p-2.5 text-center font-bold text-amber-600">{row.scrap || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'tecnologias' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left min-w-[640px]">
              <thead>
                <tr className="bg-[#181c3a] text-white">
                  <th className="p-2.5 font-bold">Tecnología</th>
                  <th className="p-2.5 font-bold text-center">Backlog</th>
                  <th className="p-2.5 font-bold text-center">Pendientes</th>
                  <th className="p-2.5 font-bold text-center">Listos hoy</th>
                  <th className="p-2.5 font-bold text-center">Listos sem.</th>
                  <th className="p-2.5 font-bold text-center">Yield</th>
                  <th className="p-2.5 font-bold text-center">Scrap hoy</th>
                </tr>
              </thead>
              <tbody>
                {data.tecnologias.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      Sin datos por tecnología
                    </td>
                  </tr>
                ) : (
                  data.tecnologias.map((row) => (
                    <tr key={row.techId} className="border-b border-slate-50 hover:bg-slate-50/80">
                      <td className="p-2.5 font-black text-[#181c3a]">{row.tecnologia}</td>
                      <td className="p-2.5 text-center font-bold text-amber-600">{row.backlog}</td>
                      <td className="p-2.5 text-center font-semibold">{row.pendientes}</td>
                      <td className="p-2.5 text-center font-black text-indigo-600">
                        {row.procesadosHoy}
                      </td>
                      <td className="p-2.5 text-center font-bold text-blue-600">
                        {row.procesadosSemana}
                      </td>
                      <td className="p-2.5 text-center font-semibold text-emerald-600">
                        {pct(row.yieldPct)}
                      </td>
                      <td className="p-2.5 text-center font-bold text-rose-600">{row.scrap || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'modelos' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left min-w-[720px]">
              <thead>
                <tr className="bg-[#181c3a] text-white">
                  <th className="p-2.5 font-bold">Modelo</th>
                  <th className="p-2.5 font-bold text-center">Peso</th>
                  <th className="p-2.5 font-bold text-center">Listos hoy</th>
                  <th className="p-2.5 font-bold text-center">Listos mes</th>
                  <th className="p-2.5 font-bold text-center">Pond. mes</th>
                  <th className="p-2.5 font-bold text-center">Yield</th>
                  <th className="p-2.5 font-bold text-center">Scrap</th>
                  <th className="p-2.5 font-bold text-center">Retrab.</th>
                </tr>
              </thead>
              <tbody>
                {data.modelos.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      Sin datos por modelo
                    </td>
                  </tr>
                ) : (
                  data.modelos.map((row) => (
                    <tr key={row.modelId} className="border-b border-slate-50 hover:bg-slate-50/80">
                      <td className="p-2.5 font-black text-[#181c3a]">{row.modelo}</td>
                      <td className="p-2.5 text-center font-semibold text-slate-500">{row.peso}</td>
                      <td className="p-2.5 text-center font-black text-indigo-600">
                        {row.procesadosHoy}
                      </td>
                      <td className="p-2.5 text-center font-bold">{row.procesadosMes}</td>
                      <td className="p-2.5 text-center font-black text-violet-600">
                        {row.productividadPonderada}
                      </td>
                      <td className="p-2.5 text-center font-semibold text-emerald-600">
                        {pct(row.yieldPct)}
                      </td>
                      <td className="p-2.5 text-center font-bold text-amber-600">{row.scrap || '—'}</td>
                      <td className="p-2.5 text-center font-bold text-rose-600">
                        {row.retrabajos || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-[10px] text-slate-400 font-medium px-1">
        Productividad ponderada = equipos listos × peso del modelo (default 1.0). Retrabajos = rechazos QC
        en el mes. Garantías 90d → Fase 4.
      </p>
    </div>
  );
}
