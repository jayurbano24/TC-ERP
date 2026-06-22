import React from 'react';
import { Card, Badge } from '@/components/ui';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Package,
  Target,
  TrendingUp,
  Truck,
} from 'lucide-react';
import type { ExecutiveKpiPayload, ExecutiveProjectionStatus } from '@/lib/database/kpi-executive';
import { EXECUTIVE_TARGETS } from '@/lib/database/kpi-executive';

const PROJECTION_STYLES: Record<
  ExecutiveProjectionStatus,
  { label: string; badge: string; ring: string }
> = {
  verde: {
    label: 'En camino',
    badge: 'bg-emerald-100 text-emerald-800',
    ring: 'ring-emerald-400',
  },
  amarillo: {
    label: 'Riesgo medio',
    badge: 'bg-amber-100 text-amber-800',
    ring: 'ring-amber-400',
  },
  rojo: {
    label: 'Riesgo alto',
    badge: 'bg-rose-100 text-rose-800',
    ring: 'ring-rose-400',
  },
  neutral: {
    label: 'Sin meta',
    badge: 'bg-slate-100 text-slate-600',
    ring: 'ring-slate-300',
  },
};

function MetricCard({
  label,
  value,
  sub,
  accent,
  target,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent: string;
  target?: string;
}) {
  return (
    <Card className="p-3 bg-white border border-slate-100 shadow-sm rounded-xl min-w-0">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">{label}</p>
      <p className={`text-2xl font-black mt-1 ${accent}`}>{value}</p>
      {target && <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Meta: {target}</p>}
      {sub && <p className="text-[10px] text-slate-500 font-medium mt-0.5 truncate">{sub}</p>}
    </Card>
  );
}

function pctDisplay(value: number | null) {
  if (value === null) return '—';
  return `${value}%`;
}

export function ExecutiveKpiBanner({
  data,
  timeRange = 'Hoy',
}: {
  data: ExecutiveKpiPayload | undefined;
  timeRange?: string;
}) {
  if (!data) return null;

  const timeLabel = timeRange.toUpperCase();
  const proj = PROJECTION_STYLES[data.metas.estadoProyeccion];
  const topAlert = data.alertas[0];

  return (
    <div className="mx-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-[#181c3a] text-white">
            <Activity size={18} />
          </div>
          <div>
            <h3 className="text-sm font-black text-[#181c3a] uppercase tracking-wider">
              KPI Ejecutivo · Nivel 1
            </h3>
            <p className="text-[10px] text-slate-500 font-medium">
              Volumen · Eficiencia · Calidad · Metas · Alertas · {timeLabel}
            </p>
          </div>
        </div>
        <Badge className={`font-bold px-3 py-1 ${proj.badge} ring-1 ${proj.ring}`}>
          Proyección semanal: {proj.label}
        </Badge>
      </div>

      {topAlert && (
        <div
          className={`px-4 py-2.5 rounded-lg border flex items-start gap-2 text-sm ${
            topAlert.nivel === 'critico'
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : topAlert.nivel === 'advertencia'
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="font-semibold">{topAlert.mensaje}</span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
        <MetricCard
          label="Recepcionados"
          value={data.volumen.equiposRecepcionados}
          accent="text-blue-600"
          sub="Equipos (OS)"
        />
        <MetricCard
          label="Despachados"
          value={data.volumen.equiposDespachados}
          accent="text-emerald-600"
          sub={timeLabel}
        />
        <MetricCard
          label="Listos"
          value={data.volumen.equiposProducidos}
          accent="text-teal-600"
          sub={timeLabel}
        />
        <MetricCard
          label="Backlog total"
          value={data.volumen.backlogTotal}
          accent="text-amber-600"
          sub="Pipeline activo"
        />
        <MetricCard
          label="TAT prom."
          value={data.eficiencia.tatPromedioHoras !== null ? `${data.eficiencia.tatPromedioHoras}h` : '—'}
          accent={
            data.eficiencia.tatCumple === false
              ? 'text-rose-600'
              : data.eficiencia.tatCumple
                ? 'text-emerald-600'
                : 'text-slate-700'
          }
          target={`< ${EXECUTIVE_TARGETS.tatHoras}h`}
        />
        <MetricCard
          label="Yield QC"
          value={pctDisplay(data.calidad.yieldPct)}
          accent={
            data.calidad.yieldPct !== null && data.calidad.yieldPct >= EXECUTIVE_TARGETS.yieldPct
              ? 'text-emerald-600'
              : 'text-violet-600'
          }
          target={`≥ ${EXECUTIVE_TARGETS.yieldPct}%`}
          sub={`${data.calidad.aprobadosQC} ok · ${data.calidad.rechazadosQC} rech.`}
        />
        <MetricCard
          label="Scrap rate"
          value={pctDisplay(data.calidad.scrapRatePct)}
          accent={
            data.calidad.scrapRatePct !== null && data.calidad.scrapRatePct > EXECUTIVE_TARGETS.scrapPct
              ? 'text-rose-600'
              : 'text-slate-700'
          }
          target={`< ${EXECUTIVE_TARGETS.scrapPct}%`}
        />
        <MetricCard
          label="Cumpl. metas"
          value={pctDisplay(data.metas.cumplimientoPct)}
          accent="text-indigo-600"
          target={`≥ ${EXECUTIVE_TARGETS.cumplimientoPct}%`}
        />
      </div>

      <Card className="p-4 bg-white border border-slate-200 rounded-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <TrendingUp className="w-4 h-4 text-indigo-600 shrink-0" />
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-[#181c3a]">
                Proyección de cierre semanal
              </p>
              <p className="text-[10px] text-slate-500">
                Listos + despachos · meta configurada en taller
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Meta sem.</p>
              <p className="text-lg font-black text-[#181c3a]">{data.metas.metaSemanal}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Actual sem.</p>
              <p className="text-lg font-black text-indigo-600">{data.metas.actualSemanal}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Proyección</p>
              <p className="text-lg font-black text-emerald-600">{data.metas.proyeccionSemanal}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Req./día</p>
              <p className="text-lg font-black text-amber-600">
                {data.metas.requeridoPorDia ?? '—'}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="px-4 py-3 bg-white border border-slate-200 rounded-xl">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Flujo operativo (equipos en etapa)
          </span>
          <div className="flex items-center gap-2 text-xs font-bold text-[#181c3a] flex-wrap justify-center">
            <span className="inline-flex items-center gap-1">
              <Package className="w-3 h-3 text-blue-500" />
              {data.funnel.recepcion}
            </span>
            <ArrowRight className="w-3 h-3 text-slate-300" />
            <span>{data.funnel.backoffice}</span>
            <ArrowRight className="w-3 h-3 text-slate-300" />
            <span>{data.funnel.taller}</span>
            <ArrowRight className="w-3 h-3 text-slate-300" />
            <span>{data.funnel.bodega}</span>
            <ArrowRight className="w-3 h-3 text-slate-300" />
            <span className="inline-flex items-center gap-1">
              <Truck className="w-3 h-3 text-orange-500" />
              {data.funnel.despacho}
            </span>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400">
            <CheckCircle2 className="w-3 h-3" />
            Revisión &lt; 2 min
          </span>
        </div>
      </Card>
    </div>
  );
}
