'use client';

import React, { useState } from 'react';
import { Card, Badge } from '@/components/ui';
import { Wrench, AlertTriangle, Search, CheckCircle, Activity, Clock, CheckCircle2 } from 'lucide-react';

type TallerVista = 'realizado' | 'pendiente';

type PorTecnicoRow = {
  tecnico: string;
  diagnostico: number;
  reacondicionado: number;
  reparacion: number;
  qcAprobadas: number;
  qcRechazadas: number;
  qc: number;
  totalEtapas: number;
  metaDiaria?: number;
  meta?: number;
  porcentaje?: number;
  estadoMeta?: string;
};

/** Matriz KPO desde API o armada desde tablas por etapa (fallback). */
function buildPorTecnico(data: any): PorTecnicoRow[] {
  const fromApi = data?.tables?.porTecnico as PorTecnicoRow[] | undefined;
  if (Array.isArray(fromApi) && fromApi.length > 0) return fromApi;

  const map = new Map<string, PorTecnicoRow>();
  const bump = (name: string, patch: Partial<PorTecnicoRow>) => {
    if (!name || name === 'Sin registros') return;
    let row = map.get(name);
    if (!row) {
      row = {
        tecnico: name,
        diagnostico: 0,
        reacondicionado: 0,
        reparacion: 0,
        qcAprobadas: 0,
        qcRechazadas: 0,
        qc: 0,
        totalEtapas: 0,
      };
      map.set(name, row);
    }
    Object.assign(row, {
      diagnostico: row.diagnostico + (patch.diagnostico || 0),
      reacondicionado: row.reacondicionado + (patch.reacondicionado || 0),
      reparacion: row.reparacion + (patch.reparacion || 0),
      qcAprobadas: row.qcAprobadas + (patch.qcAprobadas || 0),
      qcRechazadas: row.qcRechazadas + (patch.qcRechazadas || 0),
    });
    row.qc = row.qcAprobadas + row.qcRechazadas;
    row.totalEtapas = row.diagnostico + row.reacondicionado + row.reparacion + row.qc;
  };

  for (const r of data?.tables?.diagnostico || []) {
    bump(r.tecnico, { diagnostico: Number(r.procesadas || 0) });
  }
  for (const r of data?.tables?.reacondicionado || []) {
    bump(r.tecnico, { reacondicionado: Number(r.completadas || r.reacondicionadas || 0) });
  }
  for (const r of data?.tables?.reparacion || []) {
    bump(r.tecnico, { reparacion: Number(r.reparadas || 0) });
  }
  for (const r of data?.tables?.cc || []) {
    bump(r.inspector || r.tecnico, {
      qcAprobadas: Number(r.aprobadas || 0),
      qcRechazadas: Number(r.rechazadas || 0),
    });
  }

  return [...map.values()]
    .filter((r) => r.totalEtapas > 0)
    .sort((a, b) => b.totalEtapas - a.totalEtapas);
}

export function TallerKpiView({ data, timeRange = 'Hoy' }: { data: any; timeRange?: string }) {
  const [vista, setVista] = useState<TallerVista>('realizado');
  const [mostrarDetalleEtapas, setMostrarDetalleEtapas] = useState(false);
  if (!data) return null;

  const timeLabel = timeRange.toUpperCase();
  const isRealizado = vista === 'realizado';
  const porTecnico = buildPorTecnico(data);
  const colaTotal =
    Number(data.pendientesDiagnostico || 0) +
    Number(data.pendientesCC || 0) +
    Number(data.pendientesL3 || 0) +
    Number(data.pendientesScraps || 0);

  return (
    <div className="flex flex-col gap-4 border-2 border-slate-200 rounded-xl bg-[#f9f8f4] overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
            <Wrench size={20} />
          </div>
          <div>
            <h3 className="text-lg font-black text-[#181c3a]">Taller — KPO por técnico</h3>
            <p className="text-[11px] font-semibold text-slate-500">
              {isRealizado
                ? `Equipos completados por persona y etapa (${timeRange}) · 1 OS = 1 equipo`
                : 'Cola actual (lo que aún falta) · no es del día'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => setVista('realizado')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-black uppercase tracking-wide transition-colors ${
                isRealizado
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white'
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Realizado
            </button>
            <button
              type="button"
              onClick={() => setVista('pendiente')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-black uppercase tracking-wide transition-colors ${
                !isRealizado
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white'
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              Pendiente
            </button>
          </div>
          <a
            href="/configuracion/metas"
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
          >
            <Activity size={14} /> Metas
          </a>
          <Badge className="bg-[#181c3a] text-white font-bold px-3 py-1.5">{timeRange}</Badge>
        </div>
      </div>

      {isRealizado ? (
        <>
          <div className="mx-4 mt-1 rounded-lg border border-indigo-100 bg-indigo-50/70 px-3 py-2 text-[12px] font-semibold text-indigo-900">
            <span className="font-black">KPO Taller</span>: equipos por etapa en{' '}
            <span className="font-black">{timeRange}</span>, total del día y{' '}
            <span className="font-black">% vs meta</span> (metas de Rendimiento / user targets).
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 px-4">
            <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Diag. hechas ({timeLabel})
              </p>
              <p className="text-3xl font-black text-blue-600">{data.diagnosticadas}</p>
            </Card>
            <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-l-[3px] border-l-blue-600">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Reacond. hechos ({timeLabel})
              </p>
              <p className="text-3xl font-black text-blue-600">{data.reacondicionadas}</p>
            </Card>
            <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-l-[3px] border-l-blue-600">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Rep. hechas ({timeLabel})
              </p>
              <p className="text-3xl font-black text-blue-600">{data.reparadas}</p>
            </Card>
            <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-l-[3px] border-l-emerald-600">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                CC aprobó ({timeLabel})
              </p>
              <p className="text-3xl font-black text-emerald-600">{data.aprobadasCC}</p>
            </Card>
            <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-l-[3px] border-l-rose-600">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                CC rechazó ({timeLabel})
              </p>
              <p className="text-3xl font-black text-rose-600">{data.rechazadasCC}</p>
            </Card>
          </div>

          {/* Matriz KPO principal */}
          <div className="bg-white mx-4 rounded-xl border-2 border-indigo-200 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-indigo-50 border-b border-indigo-100">
              <span className="text-xs font-black uppercase tracking-widest text-indigo-900">
                Por técnico · equipos por etapa ({timeRange})
              </span>
              <span className="text-[10px] font-bold text-indigo-700">
                {porTecnico.length} técnicos · Total etapas:{' '}
                {porTecnico.reduce((a, r) => a + r.totalEtapas, 0)}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left min-w-[860px]">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="p-3 font-bold sticky left-0 bg-slate-50">Técnico</th>
                    <th className="p-3 font-bold text-center text-blue-700">Diagnóstico</th>
                    <th className="p-3 font-bold text-center text-emerald-700">Reacondicionado</th>
                    <th className="p-3 font-bold text-center text-amber-700">Reparación</th>
                    <th className="p-3 font-bold text-center text-emerald-700">QC aprobó</th>
                    <th className="p-3 font-bold text-center text-rose-700">QC rechazó</th>
                    <th className="p-3 font-black text-center text-[#181c3a] bg-indigo-50/80">
                      Total
                    </th>
                    <th className="p-3 font-bold text-center">Meta</th>
                    <th className="p-3 font-bold text-center">% meta</th>
                    <th className="p-3 font-bold text-center">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {porTecnico.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-6 text-center text-slate-400 font-semibold">
                        Sin trabajo de taller en {timeRange}
                      </td>
                    </tr>
                  )}
                  {porTecnico.map((r) => {
                    const pct = Number(r.porcentaje ?? 0);
                    const meta = Number(r.meta ?? r.metaDiaria ?? 0);
                    const pctColor =
                      pct >= 100
                        ? 'text-emerald-700'
                        : pct >= 80
                          ? 'text-amber-700'
                          : 'text-rose-700';
                    const badgeClass =
                      r.estadoMeta === 'Meta'
                        ? 'bg-emerald-100 text-emerald-800'
                        : r.estadoMeta === 'Cerca'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800';
                    return (
                      <tr key={r.tecnico} className="border-b border-slate-50 hover:bg-slate-50/80">
                        <td className="p-3 font-black text-[#181c3a] sticky left-0 bg-white">
                          {r.tecnico}
                        </td>
                        <td className="p-3 text-center font-bold text-blue-600 tabular-nums">
                          {r.diagnostico || '—'}
                        </td>
                        <td className="p-3 text-center font-bold text-emerald-600 tabular-nums">
                          {r.reacondicionado || '—'}
                        </td>
                        <td className="p-3 text-center font-bold text-amber-600 tabular-nums">
                          {r.reparacion || '—'}
                        </td>
                        <td className="p-3 text-center font-bold text-emerald-600 tabular-nums">
                          {r.qcAprobadas || '—'}
                        </td>
                        <td className="p-3 text-center font-bold text-rose-600 tabular-nums">
                          {r.qcRechazadas || '—'}
                        </td>
                        <td className="p-3 text-center font-black text-[#181c3a] bg-indigo-50/40 tabular-nums">
                          {r.totalEtapas}
                        </td>
                        <td className="p-3 text-center font-bold text-slate-600 tabular-nums">
                          {meta > 0 ? meta : '—'}
                        </td>
                        <td className={`p-3 text-center font-black tabular-nums ${pctColor}`}>
                          {meta > 0 ? `${pct}%` : '—'}
                        </td>
                        <td className="p-3 text-center">
                          {meta > 0 ? (
                            <Badge className={`px-2 py-0.5 text-[9px] font-black ${badgeClass}`}>
                              {r.estadoMeta === 'Meta'
                                ? 'Llegó'
                                : r.estadoMeta === 'Cerca'
                                  ? 'Cerca'
                                  : 'Bajo'}
                            </Badge>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {porTecnico.length > 0 && (
                  <tfoot className="bg-slate-100 border-t border-slate-200 font-black text-[#181c3a]">
                    <tr>
                      <td className="p-3">TOTAL TALLER</td>
                      <td className="p-3 text-center text-blue-700">{data.diagnosticadas}</td>
                      <td className="p-3 text-center text-emerald-700">{data.reacondicionadas}</td>
                      <td className="p-3 text-center text-amber-700">{data.reparadas}</td>
                      <td className="p-3 text-center text-emerald-700">{data.aprobadasCC}</td>
                      <td className="p-3 text-center text-rose-700">{data.rechazadasCC}</td>
                      <td className="p-3 text-center bg-indigo-100">
                        {Number(data.diagnosticadas || 0) +
                          Number(data.reacondicionadas || 0) +
                          Number(data.reparadas || 0) +
                          Number(data.aprobadasCC || 0) +
                          Number(data.rechazadasCC || 0)}
                      </td>
                      <td className="p-3 text-center text-slate-500" colSpan={3}>
                        —
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <div className="mx-4">
            <button
              type="button"
              onClick={() => setMostrarDetalleEtapas((v) => !v)}
              className="w-full py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              {mostrarDetalleEtapas ? 'Ocultar detalle por etapa (metas)' : 'Ver detalle por etapa + metas'}
            </button>
          </div>

          {mostrarDetalleEtapas && (
          <div className="bg-white mx-4 mb-2 rounded-xl border border-slate-200 overflow-hidden grid grid-cols-1 lg:grid-cols-2">
            {/* Diagnóstico */}
            <div className="border-r border-b border-slate-100 flex flex-col">
              <div className="flex justify-between items-center p-3 bg-blue-50/50 border-b border-slate-100">
                <span className="text-xs font-bold text-blue-700 flex items-center gap-2">
                  <Search className="w-4 h-4" /> Diagnóstico · realizado
                </span>
                <span className="text-[10px] font-bold text-blue-600">
                  Total: {data.tables.diagnostico.reduce((a: number, b: { procesadas?: number }) => a + (b.procesadas || 0), 0)}
                </span>
              </div>
              <table className="w-full text-xs text-left">
                <thead className="text-slate-400 border-b border-slate-100">
                  <tr>
                    <th className="p-2 font-semibold">Técnico</th>
                    <th className="p-2 font-semibold text-center">Hechas ({timeLabel})</th>
                    <th className="p-2 font-semibold text-center">Meta periodo</th>
                    <th className="p-2 font-semibold text-center text-blue-600">Meta sem.</th>
                    <th className="p-2 font-semibold text-center">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tables.diagnostico.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0">
                      <td className="p-2 font-bold text-[#181c3a]">{r.tecnico}</td>
                      <td className="p-2 text-center font-bold text-[#181c3a]">{r.procesadas}</td>
                      <td className="p-2 text-center font-bold text-slate-500">{r.meta}</td>
                      <td className="p-2 text-center font-black text-blue-600">{r.semana}</td>
                      <td className="p-2 text-center">
                        <Badge
                          className={`px-2 py-0.5 text-[9px] ${
                            r.estado === 'Bono'
                              ? 'bg-purple-100 text-purple-700'
                              : r.estado === 'Ok'
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-amber-50 text-amber-600'
                          }`}
                        >
                          {r.estado}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Reacondicionado */}
            <div className="border-b border-slate-100 flex flex-col">
              <div className="flex justify-between items-center p-3 bg-emerald-50/50 border-b border-slate-100">
                <span className="text-xs font-bold text-emerald-700 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> Reacondicionado · realizado
                </span>
                <span className="text-[10px] font-bold text-emerald-600">
                  Total: {data.tables.reacondicionado.reduce((a: number, b: { completadas?: number }) => a + (b.completadas || 0), 0)}
                </span>
              </div>
              <table className="w-full text-xs text-left">
                <thead className="text-slate-400 border-b border-slate-100">
                  <tr>
                    <th className="p-2 font-semibold">Técnico</th>
                    <th className="p-2 font-semibold text-center">Hechas ({timeLabel})</th>
                    <th className="p-2 font-semibold text-center">Meta periodo</th>
                    <th className="p-2 font-semibold text-center text-emerald-600">Meta sem.</th>
                    <th className="p-2 font-semibold text-center">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tables.reacondicionado.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0">
                      <td className="p-2 font-bold text-[#181c3a]">{r.tecnico}</td>
                      <td className="p-2 text-center font-bold text-[#181c3a]">{r.completadas}</td>
                      <td className="p-2 text-center font-bold text-slate-500">{r.meta}</td>
                      <td className="p-2 text-center font-black text-emerald-600">{r.semana}</td>
                      <td className="p-2 text-center">
                        <Badge
                          className={`px-2 py-0.5 text-[9px] ${
                            r.estado === 'Bono'
                              ? 'bg-purple-100 text-purple-700'
                              : r.estado === 'Ok'
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-amber-50 text-amber-600'
                          }`}
                        >
                          {r.estado}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Reparación */}
            <div className="border-r border-slate-100 flex flex-col">
              <div className="flex justify-between items-center p-3 bg-amber-50/50 border-b border-slate-100">
                <span className="text-xs font-bold text-amber-700 flex items-center gap-2">
                  <Wrench className="w-4 h-4" /> Reparación · realizado
                </span>
                <span className="text-[10px] font-bold text-amber-600">
                  Total: {data.tables.reparacion.reduce((a: number, b: { reparadas?: number }) => a + (b.reparadas || 0), 0)}
                </span>
              </div>
              <table className="w-full text-xs text-left">
                <thead className="text-slate-400 border-b border-slate-100">
                  <tr>
                    <th className="p-2 font-semibold">Técnico</th>
                    <th className="p-2 font-semibold text-center">Hechas ({timeLabel})</th>
                    <th className="p-2 font-semibold text-center">Meta periodo</th>
                    <th className="p-2 font-semibold text-center text-amber-600">Meta sem.</th>
                    <th className="p-2 font-semibold text-center">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tables.reparacion.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0">
                      <td className="p-2 font-bold text-[#181c3a]">{r.tecnico}</td>
                      <td className="p-2 text-center font-bold text-[#181c3a]">{r.reparadas}</td>
                      <td className="p-2 text-center font-bold text-slate-500">{r.meta}</td>
                      <td className="p-2 text-center font-black text-amber-600">{r.semana}</td>
                      <td className="p-2 text-center">
                        <Badge
                          className={`px-2 py-0.5 text-[9px] ${
                            r.estado === 'Bono'
                              ? 'bg-purple-100 text-purple-700'
                              : r.estado === 'Ok'
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-amber-50 text-amber-600'
                          }`}
                        >
                          {r.estado}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Control de calidad */}
            <div className="flex flex-col">
              <div className="flex justify-between items-center p-3 bg-rose-50/50 border-b border-slate-100">
                <span className="text-xs font-bold text-rose-700 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> Control de calidad · realizado
                </span>
                <span className="text-[10px] font-bold text-rose-600">
                  Total:{' '}
                  {data.tables.cc.reduce(
                    (a: number, b: { aprobadas?: number; rechazadas?: number }) =>
                      a + (b.aprobadas || 0) + (b.rechazadas || 0),
                    0
                  )}
                </span>
              </div>
              <table className="w-full text-xs text-left">
                <thead className="text-slate-400 border-b border-slate-100">
                  <tr>
                    <th className="p-2 font-semibold">Inspector</th>
                    <th className="p-2 font-semibold text-center">Aprobadas ({timeLabel})</th>
                    <th className="p-2 font-semibold text-center">Rechazadas</th>
                    <th className="p-2 font-semibold text-center text-rose-600">Meta sem.</th>
                    <th className="p-2 font-semibold text-center">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tables.cc.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0">
                      <td className="p-2 font-bold text-[#181c3a]">{r.inspector}</td>
                      <td className="p-2 text-center font-bold text-emerald-600">{r.aprobadas}</td>
                      <td className="p-2 text-center text-rose-600 font-bold">{r.rechazadas}</td>
                      <td className="p-2 text-center font-black text-rose-600">{r.semana}</td>
                      <td className="p-2 text-center">
                        <Badge
                          className={`px-2 py-0.5 text-[9px] ${
                            r.estado === 'Bono'
                              ? 'bg-purple-100 text-purple-700'
                              : r.estado === 'Ok'
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-amber-50 text-amber-600'
                          }`}
                        >
                          {r.estado}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          )}

          <div className="bg-white mx-4 mb-4 rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex justify-between items-center p-3 bg-slate-50 border-b border-slate-200">
              <span className="text-xs font-black uppercase tracking-widest text-[#181c3a]">
                Tecnología procesada · realizado ({timeRange})
              </span>
            </div>
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="p-3 font-bold uppercase tracking-wider">Tecnología</th>
                  <th className="p-3 font-bold uppercase tracking-wider text-center">Diagnóstico</th>
                  <th className="p-3 font-bold uppercase tracking-wider text-center">Reacondicionado</th>
                  <th className="p-3 font-bold uppercase tracking-wider text-center">Reparación</th>
                  <th className="p-3 font-bold uppercase tracking-wider text-center">Control de Calidad</th>
                </tr>
              </thead>
              <tbody>
                {data.tables.tecnologia.map((r: any, i: number) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0">
                    <td className="p-3 font-black text-[#181c3a]">{r.tecnologia}</td>
                    <td className="p-3 text-center font-bold text-blue-600">{r.diagnostico}</td>
                    <td className="p-3 text-center font-bold text-emerald-600">{r.reacondicionado}</td>
                    <td className="p-3 text-center font-bold text-amber-600">{r.reparacion}</td>
                    <td className="p-3 text-center font-bold text-[#86754d]">{r.cc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="mx-4 mt-1 rounded-lg border border-amber-200 bg-[#f3efe6] px-3 py-2 text-[12px] font-semibold text-[#665a3d] flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-[#a48e58]" />
            <p>
              Vista <span className="font-black">Pendiente</span>: esto es la{' '}
              <span className="font-black">cola en vivo</span> (WIP). No son aprobados de hoy ni el
              filtro {timeRange}. Son equipos que <span className="font-black">todavía esperan</span>{' '}
              en cada etapa.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 px-4 pb-2">
            <Card className="p-4 bg-white shadow-sm rounded-lg border border-amber-200 border-l-[3px] border-l-amber-500 md:col-span-1">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Total en cola
              </p>
              <p className="text-3xl font-black text-amber-700">{colaTotal}</p>
            </Card>
            <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Pend. Diagnóstico
              </p>
              <p className="text-3xl font-black text-[#181c3a]">{data.pendientesDiagnostico}</p>
            </Card>
            <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Pend. CC
              </p>
              <p className="text-3xl font-black text-[#181c3a]">{data.pendientesCC}</p>
            </Card>
            <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Pend. L3
              </p>
              <p className="text-3xl font-black text-[#181c3a]">{data.pendientesL3}</p>
            </Card>
            <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Pend. Scraps
              </p>
              <p className="text-3xl font-black text-[#181c3a]">{data.pendientesScraps}</p>
            </Card>
          </div>

          <div className="bg-white mx-4 mb-4 rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-3 bg-amber-50/60 border-b border-slate-100">
              <span className="text-xs font-bold text-amber-800">Cola por etapa (ahora)</span>
            </div>
            <table className="w-full text-xs text-left">
              <thead className="text-slate-400 border-b border-slate-100">
                <tr>
                  <th className="p-3 font-semibold">Etapa</th>
                  <th className="p-3 font-semibold text-center">OS pendientes</th>
                  <th className="p-3 font-semibold">Significado</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-50">
                  <td className="p-3 font-bold text-[#181c3a]">Diagnóstico</td>
                  <td className="p-3 text-center font-black text-amber-700">{data.pendientesDiagnostico}</td>
                  <td className="p-3 text-slate-600 font-semibold">Esperan diagnóstico en taller</td>
                </tr>
                <tr className="border-b border-slate-50">
                  <td className="p-3 font-bold text-[#181c3a]">Control de calidad</td>
                  <td className="p-3 text-center font-black text-amber-700">{data.pendientesCC}</td>
                  <td className="p-3 text-slate-600 font-semibold">Esperan revisión / aprobación CC</td>
                </tr>
                <tr className="border-b border-slate-50">
                  <td className="p-3 font-bold text-[#181c3a]">L3</td>
                  <td className="p-3 text-center font-black text-amber-700">{data.pendientesL3}</td>
                  <td className="p-3 text-slate-600 font-semibold">En cola L3</td>
                </tr>
                <tr>
                  <td className="p-3 font-bold text-[#181c3a]">Scraps / irreparable</td>
                  <td className="p-3 text-center font-black text-amber-700">{data.pendientesScraps}</td>
                  <td className="p-3 text-slate-600 font-semibold">Marcados scrap o irreparables</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
