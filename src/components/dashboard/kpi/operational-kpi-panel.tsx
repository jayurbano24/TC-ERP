import React, { useState } from 'react';
import { Card } from '@/components/ui';
import { ChevronDown, ChevronRight, Layers, Package, Truck, Users, Warehouse, Wrench } from 'lucide-react';
import type { OperationalAreaPayload, OperationalKpiPayload, OperationalKpiRow } from '@/modules/kpi-analytics/client/kpiOperational';

const AREA_ICONS: Record<string, React.ReactNode> = {
  recepcion: <Package className="w-4 h-4" />,
  backoffice: <Users className="w-4 h-4" />,
  bodega: <Warehouse className="w-4 h-4" />,
  taller: <Wrench className="w-4 h-4" />,
  salida: <Truck className="w-4 h-4" />,
};

function OperationalTable({
  rows,
  columnLabels,
  variant = 'wip',
}: {
  rows: OperationalKpiRow[];
  columnLabels?: { real?: string; pendientes?: string };
  variant?: 'flow' | 'wip' | 'quality';
}) {
  const realLabel = columnLabels?.real ?? (variant === 'wip' ? 'Ahora' : 'Real');
  const showMeta = variant === 'flow';

  return (
    <table className="w-full text-xs text-left">
      <thead>
        <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
          <th className="p-2.5 font-bold uppercase tracking-wider">KPI</th>
          {showMeta && <th className="p-2.5 font-bold uppercase tracking-wider text-center">Meta</th>}
          <th className="p-2.5 font-bold uppercase tracking-wider text-center">{realLabel}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60 last:border-0">
            <td className="p-2.5">
              <div className="font-bold text-[#181c3a]">{r.label}</div>
              {r.detalle && <div className="text-[10px] text-slate-400 font-medium mt-0.5">{r.detalle}</div>}
            </td>
            {showMeta && (
              <td className="p-2.5 text-center font-semibold text-slate-500">
                {r.meta !== null ? r.meta : '—'}
              </td>
            )}
            <td className="p-2.5 text-center font-black text-[#181c3a]">
              {r.real === null ? '—' : r.real}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AreaSection({ area, defaultOpen }: { area: OperationalAreaPayload; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <Card className="border border-slate-200 overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#181c3a] text-white">
            {AREA_ICONS[area.id] ?? <Layers className="w-4 h-4" />}
          </div>
          <span className="text-sm font-black text-[#181c3a] uppercase tracking-wide">{area.label}</span>
          <span className="text-[10px] text-slate-400 font-semibold">{area.rows.length} KPIs</span>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>
      {open && (
        <>
          {area.footnote && (
            <p className="px-3 pb-2 text-[10px] text-slate-500 font-medium border-b border-slate-100">{area.footnote}</p>
          )}
          <OperationalTable rows={area.rows} columnLabels={area.columnLabels} variant={area.variant ?? 'wip'} />
        </>
      )}
    </Card>
  );
}

export function OperationalKpiPanel({
  data,
  timeRange = 'Hoy',
}: {
  data: OperationalKpiPayload | undefined;
  timeRange?: string;
}) {
  if (!data?.areas?.length) return null;

  return (
    <div className="mx-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-lg bg-indigo-600 text-white">
          <Layers size={18} />
        </div>
        <div>
          <h3 className="text-sm font-black text-[#181c3a] uppercase tracking-wider">
            KPI Operativo · Inventario actual
          </h3>
          <p className="text-[10px] text-slate-500 font-medium">
            Estado actual por OS · Movimiento {timeRange} solo en traslados/despachos
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {data.areas.map((area, idx) => (
          <AreaSection key={area.id} area={area} defaultOpen={idx <= 2} />
        ))}
      </div>
    </div>
  );
}
