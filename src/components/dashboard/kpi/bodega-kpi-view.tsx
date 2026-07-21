import React from 'react';
import { Card, Badge } from '@/components/ui';
import { Warehouse, AlertTriangle, Clock } from 'lucide-react';

export function BodegaKpiView({ data, timeRange = 'Hoy' }: { data: any; timeRange?: string }) {
  if (!data) return null;
  /** BOX recibidas / ingresos por usuario siempre van a mes (kpi-engine). */
  const boxesLabel = String(data.boxesTimeLabel || 'Este Mes').toUpperCase();
  const timeLabel = timeRange.toUpperCase();
  const ingresos = data.tables?.ingresos || [];
  const pendientes = data.tables?.pendientes || [];

  return (
    <div className="flex flex-col gap-4 border-2 border-slate-200 rounded-xl bg-[#f9f8f4] overflow-hidden">
      <div className="flex items-center justify-between p-4 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
            <Warehouse size={20} />
          </div>
          <h3 className="text-lg font-black text-[#181c3a]">Bodega</h3>
        </div>
        <Badge className="bg-[#f0eadd] text-[#86754d] font-bold px-4 py-1">Pendientes de ingreso</Badge>
      </div>

      <div className="mx-4 mt-2 px-4 py-3 bg-[#f3efe6] border border-[#e8dfc8] rounded-lg flex items-center gap-3">
        <AlertTriangle className="text-[#a48e58] w-5 h-5" />
        <span className="text-sm font-semibold text-[#665a3d]">
          Pendientes de ingresar (OS):{' '}
          <span className="font-black text-[#181c3a]">{data.pendientesIngreso}</span> | Pendientes
          de Recepción (OS):{' '}
          <span className="font-black text-[#181c3a]">{data.pendientesRecepcion}</span>
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 px-4">
        <Card
          className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-t-[3px] border-t-emerald-600"
          title="Cajas distintas ingresadas a Bodega central en el mes · origen CAC vs PX"
        >
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 line-clamp-1">
            BOX a Bodega central ({boxesLabel})
          </p>
          <p className="text-2xl font-black text-emerald-600">{data.ingresadasHoy}</p>
          <div className="mt-1 flex gap-3 text-[10px] font-bold text-slate-500">
            <span>
              CAC: <span className="text-[#181c3a]">{data.ingresadasCac ?? 0}</span>
            </span>
            <span>
              PX: <span className="text-[#181c3a]">{data.ingresadasPx ?? 0}</span>
            </span>
          </div>
        </Card>
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-t-[3px] border-t-amber-500">
          <p
            className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 line-clamp-1"
            title="OS pendientes de ingresar a bodega"
          >
            Pendientes Ingresar (OS)
          </p>
          <p className="text-2xl font-black text-amber-600">{data.pendientesIngreso}</p>
        </Card>
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-t-[3px] border-t-orange-500">
          <p
            className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 line-clamp-1"
            title="OS en validación backoffice"
          >
            Pendiente Recepción (OS)
          </p>
          <p className="text-2xl font-black text-orange-600">{data.pendientesRecepcion}</p>
        </Card>
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-t-[3px] border-t-blue-500">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 line-clamp-1">
            Traslados (OS)
          </p>
          <p className="text-2xl font-black text-blue-600">{data.traslados}</p>
        </Card>
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-t-[3px] border-t-purple-500">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 line-clamp-1">
            Despachos (OS)
          </p>
          <p className="text-2xl font-black text-purple-600">{data.despachos}</p>
        </Card>
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-t-[3px] border-t-[#181c3a]">
          <p
            className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 line-clamp-1"
            title="Misma base que /bodega/inventario (Detalle de Inventario)"
          >
            Inv. Disponible (OS)
          </p>
          <p className="text-2xl font-black text-[#181c3a]">{data.inventario}</p>
          <p className="text-[9px] font-semibold text-slate-400 mt-1">Detalle de Inventario</p>
        </Card>
      </div>

      <div className="bg-white mx-4 mb-4 rounded-xl border border-slate-200 overflow-hidden grid grid-cols-1 lg:grid-cols-2">
        <div className="border-r border-slate-100 flex flex-col">
          <div className="flex justify-between items-center p-3 bg-emerald-50/50 border-b border-slate-100">
            <span className="text-xs font-bold text-emerald-700">
              Ingreso a Bodega central · por usuario ({boxesLabel})
            </span>
            <span className="text-[10px] font-bold text-emerald-600">
              Total: {ingresos.reduce((a: number, b: { ingresadas?: number }) => a + (b.ingresadas || 0), 0)}
            </span>
          </div>
          <table className="w-full text-xs text-left">
            <thead className="text-slate-500 border-b border-slate-100">
              <tr>
                <th className="p-2 font-semibold">Usuario</th>
                <th className="p-2 font-semibold text-center">Cajas</th>
                <th className="p-2 font-semibold text-center">CAC</th>
                <th className="p-2 font-semibold text-center">PX</th>
                <th className="p-2 font-semibold text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {ingresos.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-3 text-center text-slate-400">
                    Sin ingresos de cajas en el periodo
                  </td>
                </tr>
              )}
              {ingresos.map((r: any, i: number) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  <td className="p-2 font-bold text-[#181c3a]">{r.usuario}</td>
                  <td className="p-2 text-center font-bold text-[#181c3a]">{r.ingresadas}</td>
                  <td className="p-2 text-center text-slate-600 font-semibold">{r.cac ?? 0}</td>
                  <td className="p-2 text-center text-slate-600 font-semibold">{r.px ?? 0}</td>
                  <td className="p-2 text-center">
                    <Badge
                      className={`px-2 py-0.5 text-[9px] ${
                        r.estado === 'Ok'
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

        <div className="flex flex-col">
          <div className="flex justify-between items-center p-3 bg-[#faf9f5] border-b border-slate-100">
            <span className="text-xs font-bold text-[#86754d] flex items-center gap-2">
              <Clock className="w-4 h-4" /> Pendientes · Historial Backoffice (OS)
            </span>
            <span className="text-[10px] font-bold text-[#86754d]">
              Pendientes:{' '}
              {pendientes.reduce((a: number, b: { pendientes?: number }) => a + (b.pendientes || 0), 0)}
            </span>
          </div>
          <table className="w-full text-xs text-left">
            <thead className="text-slate-500 border-b border-slate-100">
              <tr>
                <th className="p-2 font-semibold">Tecnología</th>
                <th className="p-2 font-semibold">Bandeja</th>
                <th className="p-2 font-semibold text-center">OS pendientes</th>
                <th className="p-2 font-semibold text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {pendientes.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-3 text-center text-slate-400">
                    Sin pendientes en bandeja
                  </td>
                </tr>
              )}
              {pendientes.map((r: any, i: number) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  <td className="p-2 font-bold text-[#181c3a]">{r.tecnologia}</td>
                  <td className="p-2 text-slate-600 font-semibold">{r.bandeja || '—'}</td>
                  <td className="p-2 text-center text-slate-800 font-bold">{r.pendientes}</td>
                  <td className="p-2 text-center">
                    <Badge
                      className={`px-2 py-0.5 text-[9px] ${
                        r.estado === 'Ok'
                          ? 'bg-emerald-50 text-emerald-600'
                          : r.estado === 'Urgente'
                            ? 'bg-rose-50 text-rose-600'
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
    </div>
  );
}
