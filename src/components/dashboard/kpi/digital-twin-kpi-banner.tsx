import React from 'react';
import { Card, Badge } from '@/components/ui';
import { CheckCircle2, Database, Layers } from 'lucide-react';
import type { DigitalTwinKpiPayload } from '@/modules/kpi-analytics/client/digitalTwin';

const STAGE_LABELS: Record<string, string> = {
  clasificacion_cac: 'Clasificación CAC',
  clasificacion_px: 'Clasificación PX',
  diagnostico: 'Diagnóstico',
  ingreso_bodega: 'Ingreso bodega',
  reacondicionado: 'Reacondicionado',
  reparacion: 'Reparación',
  qc: 'Control calidad',
};

function stageLabel(code: string) {
  return STAGE_LABELS[code] ?? code;
}

export function DigitalTwinKpiBanner({
  data,
  timeRange = 'Hoy',
}: {
  data: DigitalTwinKpiPayload | null | undefined;
  timeRange?: string;
}) {
  if (!data) return null;

  const cacProd = data.production.find((r) => r.stageCode === 'clasificacion_cac');
  const pxProd = data.production.find((r) => r.stageCode === 'clasificacion_px');
  const diagProd = data.production.find((r) => r.stageCode === 'diagnostico');
  const prodTodayTotal = data.productionToday.reduce((sum, r) => sum + r.produccionHoy, 0);
  const reworkTotal = data.quality.reduce((sum, r) => sum + r.retrabajos, 0);

  const topSnapshot = data.snapshot.slice(0, 4);

  return (
    <Card className="mx-4 p-4 bg-gradient-to-br from-slate-900 to-[#181c3a] text-white border-0 shadow-lg rounded-xl">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-white/10">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider">Gemelo digital · Motor 1–4</h3>
            <p className="text-[10px] text-slate-300 font-medium">
              Libro mayor · Snapshot · Producción consolidada · {timeRange.toUpperCase()}
            </p>
          </div>
        </div>
        {data.reconciled ? (
          <Badge className="bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 font-bold gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Δ = 0
          </Badge>
        ) : (
          <Badge className="bg-rose-500/20 text-rose-200 border border-rose-400/30 font-bold">
            Δ = {data.delta}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-3">
        <div className="rounded-lg bg-white/5 px-3 py-2">
          <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Libro mayor</p>
          <p className="text-xl font-black">{data.ledgerTotal}</p>
        </div>
        <div className="rounded-lg bg-white/5 px-3 py-2">
          <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Snapshot</p>
          <p className="text-xl font-black">{data.snapshotTotal}</p>
        </div>
        <div className="rounded-lg bg-white/5 px-3 py-2">
          <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Pipeline CAC</p>
          <p className="text-xl font-black">{cacProd?.produccionOs ?? '—'}</p>
        </div>
        <div className="rounded-lg bg-white/5 px-3 py-2">
          <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">PX</p>
          <p className="text-xl font-black">{pxProd?.produccionOs ?? '—'}</p>
        </div>
        <div className="rounded-lg bg-white/5 px-3 py-2">
          <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Prod. hoy</p>
          <p className="text-xl font-black">{prodTodayTotal}</p>
        </div>
        <div className="rounded-lg bg-white/5 px-3 py-2">
          <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Retrabajos</p>
          <p className="text-xl font-black text-amber-300">{reworkTotal}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-[10px]">
        <div className="rounded-lg bg-white/5 p-2">
          <p className="font-bold text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Layers className="w-3 h-3" /> Snapshot (top)
          </p>
          <div className="flex flex-wrap gap-1">
            {topSnapshot.map((s) => (
              <span key={s.stateCode} className="px-2 py-0.5 rounded bg-white/10 text-slate-200">
                {s.stateLabel}: <strong>{s.osCount}</strong>
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-lg bg-white/5 p-2">
          <p className="font-bold text-slate-300 uppercase tracking-wider mb-1">Producción acumulada</p>
          <div className="flex flex-wrap gap-1">
            {data.production.map((r) => (
              <span key={r.stageCode} className="px-2 py-0.5 rounded bg-white/10 text-slate-200">
                {stageLabel(r.stageCode)}: <strong>{r.produccionOs}</strong>
                {r.retrabajosEventos > 0 && (
                  <span className="text-amber-300"> (+{r.retrabajosEventos} retr.)</span>
                )}
              </span>
            ))}
            {diagProd && diagProd.retrabajosEventos > 0 && (
              <span className="text-slate-400 w-full mt-0.5">
                Calidad diagnóstico: {diagProd.retrabajosEventos} re-entradas en {diagProd.produccionOs} OS
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
