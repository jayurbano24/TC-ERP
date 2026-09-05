'use client';

import type { OsInventoryModules } from '@/lib/sap/osInventoryModules';
import { Card } from '@/components/ui';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Package,
  Stethoscope,
  Trash2,
  Wrench,
  Zap,
  RefreshCw,
  ShieldCheck,
  Warehouse,
  Send,
  Truck,
} from 'lucide-react';

type Props = {
  mods: OsInventoryModules | null;
  /** Si falta migración 228, avisamos sin romper la vista. */
  needsMigration?: boolean;
};

type StageChip = {
  key: string;
  label: string;
  value: number;
  icon: typeof Package;
  accent: string;
  bar: string;
};

function pct(part: number, whole: number): number {
  if (!whole || whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

function hasDetailBreakdown(m: OsInventoryModules | null): boolean {
  if (!m) return false;
  return (
    'taller_diagnostico' in m &&
    (m.taller_diagnostico > 0 ||
      m.taller_reparacion > 0 ||
      m.taller_qc > 0 ||
      m.taller_scraps_piso > 0 ||
      m.bodega_scraps > 0 ||
      m.equipo_listo > 0 ||
      m.series_recepcionado_bo > 0)
  );
}

/**
 * Inventario OS · Capacidad instalada — presentación ERP densa.
 * Solo props; sin efectos ni fetch.
 */
export function OsCapacityInstalledPanel({ mods, needsMigration }: Props) {
  const total = Number(mods?.total ?? 0);
  const despachadas = Number(mods?.despachado ?? 0);
  const bodega = Number(mods?.bodega_con_caja ?? 0);
  const bodegaDespacho = Number(mods?.bodega_despacho ?? 0);
  const pistoleo = Number(mods?.pistoleo_en_curso ?? 0);
  const pendienteBodega = Number(mods?.backoffice ?? 0);
  const diag = Number(mods?.taller_diagnostico ?? 0);
  const rep = Number(mods?.taller_reparacion ?? 0);
  const reac = Number(mods?.taller_reacondicionado ?? 0);
  const cq = Number(mods?.taller_qc ?? mods?.qc ?? 0);
  const l3 = Number(mods?.taller_l3 ?? 0);
  const scrapsPiso = Number(mods?.taller_scraps_piso ?? 0);
  const scrapsCaja = Number(mods?.bodega_scraps ?? 0);
  const scrapLedger = Number(mods?.scrap_ledger ?? mods?.scrap ?? 0);
  const equipoListo = Number(mods?.equipo_listo ?? 0);

  const tallerPiso =
    Number(mods?.taller_piso_total ?? 0) || diag + rep + reac + cq + l3 + scrapsPiso;

  const activas =
    Number(mods?.activas ?? 0) ||
    bodega +
      bodegaDespacho +
      pistoleo +
      pendienteBodega +
      diag +
      rep +
      cq +
      l3 +
      scrapsPiso +
      scrapsCaja;

  const activasLedger = Math.max(
    Number(mods?.activas_ledger ?? 0) || total - despachadas,
    0
  );

  const detailOk = hasDetailBreakdown(mods);

  const flow: Array<{
    key: string;
    label: string;
    sub: string;
    value: number;
    icon: typeof Package;
    tone: string;
    ring: string;
  }> = [
    {
      key: 'bo',
      label: 'Pendiente Bodega',
      sub: 'Cola CAC / Backoffice',
      value: pendienteBodega,
      icon: ClipboardList,
      tone: 'text-amber-800',
      ring: 'border-amber-200 bg-amber-50',
    },
    {
      key: 'bodega',
      label: 'Bodega Central',
      sub: pistoleo > 0 ? `+ ${pistoleo.toLocaleString()} TMP` : 'Stock con caja',
      value: bodega,
      icon: Warehouse,
      tone: 'text-emerald-800',
      ring: 'border-emerald-200 bg-emerald-50',
    },
    {
      key: 'taller',
      label: 'Taller (piso)',
      sub: 'Diag · Rep · CQ · L3 · Scrap',
      value: tallerPiso,
      icon: Wrench,
      tone: 'text-blue-800',
      ring: 'border-blue-200 bg-blue-50',
    },
    {
      key: 'scraps',
      label: 'Bodega SCRAPS',
      sub: 'Ya en BOX-BAD',
      value: scrapsCaja,
      icon: Trash2,
      tone: 'text-rose-800',
      ring: 'border-rose-200 bg-rose-50',
    },
    {
      key: 'listo',
      label: 'Equipo Listo',
      sub: 'Listo outbound',
      value: equipoListo,
      icon: Send,
      tone: 'text-cyan-800',
      ring: 'border-cyan-200 bg-cyan-50',
    },
    {
      key: 'despacho',
      label: 'Bodega Despacho',
      sub: 'En caja Outbound',
      value: bodegaDespacho,
      icon: Truck,
      tone: 'text-indigo-800',
      ring: 'border-indigo-200 bg-indigo-50',
    },
  ];

  const tallerStages: StageChip[] = [
    { key: 'd', label: 'Diagnóstico', value: diag, icon: Stethoscope, accent: 'text-amber-700', bar: 'bg-amber-500' },
    { key: 'r', label: 'Reparación', value: rep, icon: Wrench, accent: 'text-blue-700', bar: 'bg-blue-500' },
    { key: 'a', label: 'Reacond.', value: reac, icon: RefreshCw, accent: 'text-emerald-700', bar: 'bg-emerald-500' },
    { key: 'q', label: 'Ctrl. Calidad', value: cq, icon: ShieldCheck, accent: 'text-purple-700', bar: 'bg-purple-500' },
    { key: 'l', label: 'L3', value: l3, icon: Zap, accent: 'text-orange-700', bar: 'bg-orange-500' },
    { key: 's', label: 'SCRAPS piso', value: scrapsPiso, icon: Trash2, accent: 'text-rose-700', bar: 'bg-rose-500' },
  ];

  const composition = [
    { key: 'bodega', label: 'Bodega', value: bodega, color: 'bg-emerald-500' },
    { key: 'taller', label: 'Taller', value: tallerPiso, color: 'bg-blue-500' },
    { key: 'despacho', label: 'Bodega Despacho', value: bodegaDespacho, color: 'bg-indigo-500' },
    { key: 'bo', label: 'Pend. Bodega', value: pendienteBodega, color: 'bg-amber-500' },
    { key: 'scraps', label: 'SCRAPS caja', value: scrapsCaja, color: 'bg-rose-500' },
    { key: 'tmp', label: 'TMP', value: pistoleo, color: 'bg-teal-500' },
  ].filter((s) => s.value > 0);

  const compositionTotal = composition.reduce((a, s) => a + s.value, 0) || 1;

  return (
    <Card className="overflow-hidden border border-[var(--border)] shadow-sm rounded-2xl">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-[var(--accent)]" />
            <h3 className="text-sm font-black uppercase tracking-widest text-[var(--heading)]">
              Inventario OS · Capacidad instalada
            </h3>
          </div>
          <p className="mt-1 text-[11px] font-medium text-[var(--muted)]">
            Unidad = 1 OS · Flujo operativo real (no ledger técnico)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-200/80">
            <CheckCircle2 className="h-3 w-3" />
            En planta {activas.toLocaleString()}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600 ring-1 ring-slate-200/80">
            Despachadas {despachadas.toLocaleString()}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--surface-hover)] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[var(--muted)] ring-1 ring-[var(--border)]">
            Histórico {total.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="space-y-5 p-5">
        {(needsMigration || !detailOk) && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900">
            Desglose incompleto: aplique la migración{' '}
            <span className="font-black">228_os_inventory_reality_detail.sql</span> en Supabase y
            recargue. Hasta entonces Pendiente Bodega puede mostrar el ledger viejo (~3k).
          </div>
        )}

        {/* Pipeline */}
        <div>
          <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-[var(--muted)]">
            Flujo de capacidad
          </p>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch lg:gap-0">
            {flow.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={step.key} className="flex min-w-0 flex-1 items-stretch">
                  <div
                    className={`flex w-full flex-col justify-between rounded-xl border px-3 py-3 ${step.ring}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[9px] font-black uppercase tracking-wider text-[var(--muted)]">
                          {step.label}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] font-medium text-[var(--muted)]">
                          {step.sub}
                        </p>
                      </div>
                      <Icon className={`h-4 w-4 shrink-0 opacity-70 ${step.tone}`} />
                    </div>
                    <p className={`mt-2 text-2xl font-black tabular-nums ${step.tone}`}>
                      {step.value.toLocaleString()}
                    </p>
                  </div>
                  {i < flow.length - 1 ? (
                    <div className="hidden items-center px-1 lg:flex">
                      <ArrowRight className="h-4 w-4 text-[var(--muted)] opacity-40" />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* Composition bar */}
        <div>
          <div className="mb-2 flex items-end justify-between gap-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--muted)]">
              Distribución en planta
            </p>
            <p className="text-[10px] font-bold text-[var(--muted)]">
              {pct(bodega, activas)}% bodega · {pct(tallerPiso, activas)}% taller ·{' '}
              {pct(bodegaDespacho, activas)}% despacho · {pct(pendienteBodega, activas)}% pendiente
              ingreso
            </p>
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--surface-hover)] ring-1 ring-[var(--border)]">
            {composition.map((s) => (
              <div
                key={s.key}
                className={`${s.color} h-full`}
                style={{ width: `${(s.value / compositionTotal) * 100}%` }}
                title={`${s.label}: ${s.value.toLocaleString()}`}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {composition.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[var(--muted)]">
                <span className={`h-2 w-2 rounded-sm ${s.color}`} />
                {s.label} {s.value.toLocaleString()}
              </span>
            ))}
          </div>
        </div>

        {/* Taller stages */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--muted)]">
              Taller por etapa · {tallerPiso.toLocaleString()} OS
            </p>
            {scrapLedger > 0 ? (
              <p className="text-[10px] font-bold text-rose-700/80">
                Scrap total (piso+caja) {scrapLedger.toLocaleString()}
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {tallerStages.map((st) => {
              const Icon = st.icon;
              const share = tallerPiso > 0 ? st.value / tallerPiso : 0;
              return (
                <div
                  key={st.key}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
                >
                  <div className="flex items-center justify-between gap-1">
                    <p className="truncate text-[9px] font-black uppercase tracking-wider text-[var(--muted)]">
                      {st.label}
                    </p>
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${st.accent}`} />
                  </div>
                  <p className={`mt-1 text-xl font-black tabular-nums ${st.accent}`}>
                    {st.value.toLocaleString()}
                  </p>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--surface-hover)]">
                    <div className={`h-full ${st.bar}`} style={{ width: `${share * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Compact ledger footer — no SQL dump */}
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] p-3 sm:grid-cols-5">
          <div>
            <p className="text-[8px] font-black uppercase tracking-widest text-[var(--muted)]">Ledger activas</p>
            <p className="text-sm font-black tabular-nums text-[var(--heading)]">
              {activasLedger.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-[8px] font-black uppercase tracking-widest text-[var(--muted)]">Módulos sumados</p>
            <p className="text-sm font-black tabular-nums text-[var(--heading)]">
              {activas.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-[8px] font-black uppercase tracking-widest text-[var(--muted)]">SCRAPS en caja</p>
            <p className="text-sm font-black tabular-nums text-rose-700">
              {scrapsCaja.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-[8px] font-black uppercase tracking-widest text-[var(--muted)]">Equipo Listo</p>
            <p className="text-sm font-black tabular-nums text-cyan-700">
              {equipoListo.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-[8px] font-black uppercase tracking-widest text-[var(--muted)]">
              En Bodega Despacho
            </p>
            <p className="text-sm font-black tabular-nums text-indigo-700">
              {bodegaDespacho.toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
