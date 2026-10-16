'use client';

import React, { useMemo } from 'react';
import type { WarrantyBreakdownRow } from './WarrantyPackPanel';

export type WarrantyTrendPoint = {
  period: string;
  despachadas: number;
  elegibles: number;
  enGarantia: number;
  vencida: number;
};

const CHART_W = 560;
const CHART_H = 220;
const PAD = { t: 16, r: 12, b: 36, l: 44 };

function formatPeriod(period: string): string {
  const [y, m] = period.split('-');
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const mi = Number(m) - 1;
  return mi >= 0 && mi < 12 ? `${months[mi]} ${y?.slice(2) ?? ''}` : period;
}

/** Barras agrupadas: en garantía vs vencida por tecnología (top N). */
export function WarrantyTechBarChart({ rows, maxItems = 8 }: { rows: WarrantyBreakdownRow[]; maxItems?: number }) {
  const data = useMemo(() => rows.slice(0, maxItems), [rows, maxItems]);
  const maxVal = useMemo(
    () => Math.max(1, ...data.flatMap((d) => [d.enGarantia, d.vencida, d.total])),
    [data]
  );

  if (!data.length) {
    return (
      <p className="text-sm text-[var(--muted)] py-8 text-center">Sin datos para gráfico de barras.</p>
    );
  }

  const innerW = CHART_W - PAD.l - PAD.r;
  const innerH = CHART_H - PAD.t - PAD.b;
  const groupW = innerW / data.length;
  const barW = Math.min(22, groupW * 0.32);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full min-w-[320px] max-h-[240px]">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = PAD.t + innerH * (1 - t);
          const val = Math.round(maxVal * t);
          return (
            <g key={t}>
              <line x1={PAD.l} y1={y} x2={CHART_W - PAD.r} y2={y} stroke="var(--border)" strokeWidth={1} />
              <text x={PAD.l - 6} y={y + 4} textAnchor="end" className="fill-[var(--muted)] text-[9px]">
                {val.toLocaleString('es-GT')}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const cx = PAD.l + groupW * i + groupW / 2;
          const hG = (d.enGarantia / maxVal) * innerH;
          const hV = (d.vencida / maxVal) * innerH;
          const label = d.label.length > 10 ? `${d.label.slice(0, 9)}…` : d.label;
          return (
            <g key={d.id}>
              <rect
                x={cx - barW - 2}
                y={PAD.t + innerH - hG}
                width={barW}
                height={hG}
                rx={2}
                className="fill-emerald-500/80"
              />
              <rect
                x={cx + 2}
                y={PAD.t + innerH - hV}
                width={barW}
                height={hV}
                rx={2}
                className="fill-rose-400/80"
              />
              <text
                x={cx}
                y={CHART_H - 8}
                textAnchor="middle"
                className="fill-[var(--muted)] text-[8px]"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 justify-center text-[9px] font-bold uppercase tracking-wider mt-1">
        <span className="flex items-center gap-1.5 text-emerald-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/80" /> En garantía
        </span>
        <span className="flex items-center gap-1.5 text-rose-400">
          <span className="w-2.5 h-2.5 rounded-sm bg-rose-400/80" /> Vencida
        </span>
      </div>
    </div>
  );
}

/** Línea + área: elegibles despachados por mes y cuántos siguen en garantía. */
export function WarrantyTrendChart({ points }: { points: WarrantyTrendPoint[] }) {
  const data = points ?? [];
  const maxVal = useMemo(
    () => Math.max(1, ...data.flatMap((p) => [p.despachadas, p.elegibles, p.enGarantia])),
    [data]
  );

  if (!data.length) {
    return (
      <p className="text-sm text-[var(--muted)] py-8 text-center">
        Sin tendencia (refresque snapshot tras migración 266).
      </p>
    );
  }

  const innerW = CHART_W - PAD.l - PAD.r;
  const innerH = CHART_H - PAD.t - PAD.b;

  const xAt = (i: number) => PAD.l + (data.length <= 1 ? innerW / 2 : (innerW * i) / (data.length - 1));
  const yAt = (v: number) => PAD.t + innerH - (v / maxVal) * innerH;

  const lineElegibles = data.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.elegibles)}`).join(' ');
  const lineGarantia = data.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.enGarantia)}`).join(' ');
  const areaGarantia = `${lineGarantia} L ${xAt(data.length - 1)} ${PAD.t + innerH} L ${xAt(0)} ${PAD.t + innerH} Z`;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full min-w-[320px] max-h-[240px]">
        {[0, 0.5, 1].map((t) => {
          const y = PAD.t + innerH * (1 - t);
          return (
            <line key={t} x1={PAD.l} y1={y} x2={CHART_W - PAD.r} y2={y} stroke="var(--border)" strokeWidth={1} />
          );
        })}
        <path d={areaGarantia} className="fill-violet-500/15" />
        <path d={lineElegibles} fill="none" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 3" />
        <path d={lineGarantia} fill="none" className="stroke-emerald-500" strokeWidth={2.5} />
        {data.map((p, i) => (
          <g key={p.period}>
            <circle cx={xAt(i)} cy={yAt(p.enGarantia)} r={3.5} className="fill-emerald-500" />
            <text x={xAt(i)} y={CHART_H - 6} textAnchor="middle" className="fill-[var(--muted)] text-[8px]">
              {formatPeriod(p.period)}
            </text>
          </g>
        ))}
      </svg>
      <div className="flex flex-wrap gap-4 justify-center text-[9px] font-bold uppercase tracking-wider mt-1">
        <span className="flex items-center gap-1.5 text-emerald-500">
          <span className="w-4 h-0.5 bg-emerald-500" /> En garantía (mes despacho)
        </span>
        <span className="flex items-center gap-1.5 text-slate-400">
          <span className="w-4 h-0.5 border-t-2 border-dashed border-slate-400" /> Elegibles despachados
        </span>
      </div>
    </div>
  );
}

/** Barra apilada: composición 6K despachadas vs elegibles vs en garantía. */
export function WarrantyCoverageBar(props: {
  total: number;
  elegibles: number;
  enGarantia: number;
  noElegibles: number;
  sinFecha: number;
}) {
  const { total, elegibles, enGarantia, noElegibles, sinFecha } = props;
  if (total <= 0) return null;

  const pct = (n: number) => (n / total) * 100;

  return (
    <div className="space-y-2">
      <div className="flex h-8 w-full rounded-lg overflow-hidden border border-[var(--border)]">
        <div
          className="bg-emerald-500/85 h-full flex items-center justify-center text-[9px] font-black text-white min-w-[2px]"
          style={{ width: `${pct(enGarantia)}%` }}
          title={`En garantía: ${enGarantia}`}
        >
          {pct(enGarantia) >= 8 ? `${Math.round(pct(enGarantia))}%` : ''}
        </div>
        <div
          className="bg-rose-400/70 h-full min-w-[1px]"
          style={{ width: `${pct(Math.max(0, elegibles - enGarantia))}%` }}
          title="Elegibles vencidos"
        />
        <div
          className="bg-slate-500/40 h-full min-w-[1px]"
          style={{ width: `${pct(noElegibles)}%` }}
          title="Sin perfil Listo/Bueno"
        />
        <div
          className="bg-amber-400/60 h-full min-w-[1px]"
          style={{ width: `${pct(sinFecha)}%` }}
          title="Sin fecha despacho"
        />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-[var(--muted)]">
        <span>
          <strong className="text-emerald-500">{enGarantia.toLocaleString('es-GT')}</strong> en garantía
        </span>
        <span>
          <strong>{elegibles.toLocaleString('es-GT')}</strong> elegibles Listo/Bueno
        </span>
        <span>
          <strong>{noElegibles.toLocaleString('es-GT')}</strong> despachadas sin perfil garantía
        </span>
        <span>
          <strong>{total.toLocaleString('es-GT')}</strong> OS despachadas total
        </span>
      </div>
      <p className="text-[10px] text-[var(--muted)] leading-relaxed">
        Las ~3.8K en garantía son un subconjunto: solo equipos <strong className="text-[var(--foreground)]">Listo</strong> o{' '}
        <strong className="text-[var(--foreground)]">Bueno (B)</strong> aún dentro de 90 días. El resto de las 6.3K
        despachadas no califica perfil o ya venció la ventana.
      </p>
    </div>
  );
}
