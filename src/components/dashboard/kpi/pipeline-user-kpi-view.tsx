'use client';

import React, { useMemo, useState } from 'react';
import { Card, Badge } from '@/components/ui';
import { Users, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import type { PipelineUserRow } from '@/modules/kpi-analytics/client/kpiEngine';

type Props = {
  rows: PipelineUserRow[];
  timeRange?: string;
};

const STAGE_COLUMNS: Array<{
  key: keyof PipelineUserRow;
  label: string;
  group: 'bodega' | 'taller' | 'qc';
  accent?: string;
}> = [
  { key: 'bodegaIngreso', label: 'Ing. bodega', group: 'bodega', accent: 'text-emerald-600' },
  { key: 'bodegaSalida', label: 'Sal. bodega', group: 'bodega', accent: 'text-purple-600' },
  { key: 'diagnostico', label: 'Diagnóstico', group: 'taller', accent: 'text-blue-600' },
  { key: 'diagAReacondicionado', label: '→ Reac.', group: 'taller', accent: 'text-teal-600' },
  { key: 'diagAReparacion', label: '→ Rep.', group: 'taller', accent: 'text-amber-600' },
  { key: 'reacondicionado', label: 'Reacond.', group: 'taller', accent: 'text-emerald-600' },
  { key: 'reacEnviadoQC', label: 'Reac.→QC', group: 'taller', accent: 'text-indigo-500' },
  { key: 'reparacion', label: 'Reparación', group: 'taller', accent: 'text-orange-600' },
  { key: 'repEnviadoQC', label: 'Rep.→QC', group: 'taller', accent: 'text-indigo-500' },
  { key: 'controlCalidad', label: 'Ctrl. calidad', group: 'qc', accent: 'text-violet-600' },
  { key: 'qcAprobado', label: 'Aprobado', group: 'qc', accent: 'text-emerald-600' },
  { key: 'qcDevuelto', label: 'Devuelto', group: 'qc', accent: 'text-rose-600' },
];

function formatFlowSummary(row: PipelineUserRow): string {
  const parts: string[] = [];
  if (row.diagnostico > 0) {
    parts.push(
      `Diagnóstico ${row.diagnostico} (→ Reac. ${row.diagAReacondicionado}, → Rep. ${row.diagAReparacion})`
    );
  }
  if (row.reacondicionado > 0) {
    parts.push(`Reacondicionado ${row.reacondicionado} (→ QC ${row.reacEnviadoQC})`);
  }
  if (row.reparacion > 0) {
    parts.push(`Reparación ${row.reparacion} (→ QC ${row.repEnviadoQC})`);
  }
  if (row.controlCalidad > 0) {
    parts.push(`CC ${row.controlCalidad} (Aprob. ${row.qcAprobado}, Dev. ${row.qcDevuelto})`);
  }
  if (row.bodegaIngreso > 0 || row.bodegaSalida > 0) {
    parts.push(`Bodega: ingreso ${row.bodegaIngreso}, salida ${row.bodegaSalida}`);
  }
  return parts.join(' · ');
}

export function PipelineUserKpiView({ rows, timeRange = 'Hoy' }: Props) {
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const timeLabel = timeRange.toUpperCase();

  const totals = useMemo(() => {
    const base: Record<string, number> = {};
    STAGE_COLUMNS.forEach((col) => {
      base[col.key] = rows.reduce((sum, row) => sum + (Number(row[col.key]) || 0), 0);
    });
    return base;
  }, [rows]);

  if (!rows.length) {
    return (
      <Card className="mx-4 p-6 bg-white border border-slate-200 rounded-xl">
        <p className="text-sm font-semibold text-slate-500">
          Sin movimientos registrados por persona en el rango seleccionado ({timeLabel}).
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4 border-2 border-[#181c3a]/15 rounded-xl bg-[#f9f8f4] overflow-hidden mx-4">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-[#181c3a]/5 text-[#181c3a] rounded-lg">
            <Users size={20} />
          </div>
          <div>
            <h3 className="text-lg font-black text-[#181c3a]">Movimiento por persona</h3>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Equipos únicos por etapa · {timeLabel}
            </p>
          </div>
        </div>
        <Badge className="bg-[#2ec4f1]/10 text-[#181c3a] font-bold px-4 py-1">
          {rows.length} operadores
        </Badge>
      </div>

      <p className="mx-4 text-[11px] text-slate-500 leading-relaxed">
        Cada columna cuenta <strong>equipos distintos</strong> que esa persona movió en la etapa (desde{' '}
        <code className="text-[10px] bg-slate-100 px-1 rounded">erp_audit_logs</code>). Las flechas (→)
        muestran a dónde envió el equipo según el resultado registrado.
      </p>

      <div className="mx-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1100px] text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="p-3 font-black text-[#181c3a] uppercase tracking-wider sticky left-0 bg-slate-50 z-10 min-w-[140px]">
                Persona
              </th>
              <th colSpan={2} className="p-2 font-bold text-emerald-700 text-center border-l border-slate-200">
                Bodega
              </th>
              <th colSpan={7} className="p-2 font-bold text-blue-700 text-center border-l border-slate-200">
                Taller
              </th>
              <th colSpan={3} className="p-2 font-bold text-violet-700 text-center border-l border-slate-200">
                Control calidad
              </th>
            </tr>
            <tr className="bg-white border-b border-slate-100 text-[9px] uppercase tracking-wider text-slate-400">
              <th className="p-2 sticky left-0 bg-white z-10" />
              {STAGE_COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`p-2 text-center font-bold border-l border-slate-50 whitespace-nowrap ${
                    col.group === 'bodega'
                      ? 'text-emerald-600'
                      : col.group === 'qc'
                        ? 'text-violet-600'
                        : 'text-blue-600'
                  }`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isOpen = expandedUser === row.usuario;
              const rowTotal = STAGE_COLUMNS.reduce(
                (sum, col) => sum + (Number(row[col.key]) || 0),
                0
              );
              return (
                <React.Fragment key={row.usuario}>
                  <tr className="border-b border-slate-50 hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 sticky left-0 bg-white z-10 border-r border-slate-100">
                      <button
                        type="button"
                        onClick={() => setExpandedUser(isOpen ? null : row.usuario)}
                        className="flex items-center gap-2 text-left w-full group"
                      >
                        {isOpen ? (
                          <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                        )}
                        <span className="font-black text-[#181c3a]">{row.usuario}</span>
                        <span className="text-[9px] font-bold text-slate-300 ml-auto">{rowTotal}</span>
                      </button>
                    </td>
                    {STAGE_COLUMNS.map((col) => {
                      const value = Number(row[col.key]) || 0;
                      return (
                        <td
                          key={col.key}
                          className="p-2 text-center border-l border-slate-50 font-bold text-[#181c3a]"
                        >
                          {value > 0 ? (
                            <span className={col.accent}>{value}</span>
                          ) : (
                            <span className="text-slate-200">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  {isOpen && (
                    <tr className="bg-[#181c3a]/5 border-b border-slate-100">
                      <td colSpan={STAGE_COLUMNS.length + 1} className="px-4 py-3">
                        <div className="flex items-start gap-2 text-[11px] text-slate-600">
                          <ArrowRight className="w-4 h-4 text-[#2ec4f1] shrink-0 mt-0.5" />
                          <p>{formatFlowSummary(row) || 'Sin detalle de flujo.'}</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            <tr className="bg-slate-100 font-black text-[#181c3a] border-t border-slate-200">
              <td className="p-3 sticky left-0 bg-slate-100 z-10">Total</td>
              {STAGE_COLUMNS.map((col) => (
                <td key={col.key} className="p-2 text-center border-l border-slate-200">
                  {totals[col.key] > 0 ? totals[col.key] : '—'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
