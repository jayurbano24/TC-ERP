import React from 'react';
import { Card, Badge, Button } from '@/components/ui';
import { Calendar, Filter, Users, AlertTriangle, Package, Truck, Layers } from 'lucide-react';

export function RecepcionKpiView({ data, timeRange = 'Hoy' }: { data: any, timeRange?: string }) {
  if (!data) return null;
  const timeLabel = timeRange.toUpperCase();

  return (
    <div className="flex flex-col gap-4 border-2 border-slate-200 rounded-xl bg-[#f9f8f4] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
            <Package size={20} />
          </div>
          <h3 className="text-lg font-black text-[#181c3a]">Recepción general</h3>
        </div>
        <Badge variant="blue" className="bg-slate-100 text-[#181c3a] border-none font-bold px-4">{timeLabel}</Badge>
      </div>

      {/* Warning Banner */}
      <div className="mx-4 mt-2 px-4 py-3 bg-[#f3efe6] border border-[#e8dfc8] rounded-lg flex items-center gap-3">
        <AlertTriangle className="text-[#a48e58] w-5 h-5" />
        <span className="text-sm font-semibold text-[#665a3d]">
          Cajas pendientes de verificar: <span className="font-black text-[#181c3a]">{data.pendientesVerificar}</span> | Sin asignar a bodega: <span className="font-black text-[#181c3a]">{data.sinAsignarBodega}</span>
        </span>
      </div>

      {/* Main Metrics */}
      <div className="grid grid-cols-4 gap-4 px-4">
        {/* Breakdown de Cajas Recibidas */}
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 col-span-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">CAJAS RECIBIDAS ({timeLabel})</p>
          <div className="flex items-center gap-6">
            <div>
              <p className="text-3xl font-black text-blue-600">{data.cajasRecibidasHoy}</p>
              <p className="text-[10px] font-semibold text-slate-400 mt-1">TOTAL</p>
            </div>
            <div className="h-10 w-px bg-slate-200"></div>
            <div className="flex gap-4">
              <div className="text-center">
                <p className="text-lg font-bold text-slate-700">{data.breakdown?.equipos || 0}</p>
                <p className="text-[9px] font-semibold text-slate-500 uppercase">Equipos</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-slate-700">{data.breakdown?.accesorios || 0}</p>
                <p className="text-[9px] font-semibold text-slate-500 uppercase">Accesorios</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-slate-700">{data.breakdown?.moviles || 0}</p>
                <p className="text-[9px] font-semibold text-slate-500 uppercase">Móviles</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Total Unidades (Solo Equipos) */}
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 flex flex-col justify-center">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
            Total unidades <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold">Solo Equipos</span>
          </p>
          <p className="text-3xl font-black text-blue-600">{data.totalUnidades}</p>
        </Card>

        {/* Origen */}
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-l-[3px] border-l-[#181c3a] flex flex-col justify-center">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Origen CAC</p>
              <p className="text-2xl font-black text-[#181c3a]">{data.origenCac}</p>
            </div>
            <div className="h-8 w-px bg-slate-200"></div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Origen PX</p>
              <p className="text-2xl font-black text-[#181c3a]">{data.origenPx}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tables Area */}
      <div className="bg-white mx-4 mb-4 rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="py-2 px-3 font-bold text-[#181c3a] text-xs w-1/4"></th>
              <th className="py-2 px-3 font-bold text-[#181c3a] text-xs text-center border-l border-slate-200">CAJA</th>
              <th className="px-6 py-4 text-[10px] font-black tracking-widest text-[#181c3a] uppercase text-center w-32 border-x border-slate-100 bg-blue-50/50">PROCESADA ({timeLabel})</th>
              <th className="py-2 px-3 font-bold text-[#181c3a] text-xs text-center border-l border-slate-200">ACUMULADA</th>
              <th className="py-2 px-3 border-l border-slate-200"></th>
            </tr>
          </thead>
          <tbody>
            {/* INGRESOS — solo origen CAC/PX (cajas físicas) */}
            <tr className="border-b border-slate-200">
              <td colSpan={5} className="py-2 px-3 font-black text-xs text-[#181c3a] underline uppercase">
                INGRESOS · Origen (cajas {timeLabel})
              </td>
            </tr>
            {(data.tables.ingresos || []).map(
              (row: { courier: string; cajas: number; procesadasHoy: number; acumulada: number }, i: number) => (
              <tr key={`origen-${i}`} className="border-b border-slate-100 last:border-0">
                <td className="py-1.5 px-3 pl-6 font-medium text-[#181c3a] text-xs flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-[#181c3a]"></span> {row.courier}
                </td>
                <td className="py-1.5 px-3 text-center border-l border-slate-200 text-xs font-bold">{row.cajas}</td>
                <td className="py-1.5 px-3 text-center border-l border-slate-200 text-xs font-bold">{row.procesadasHoy}</td>
                <td className="py-1.5 px-3 text-center border-l border-slate-200 text-xs text-slate-500 font-semibold">{row.acumulada}</td>
                <td className="py-1.5 px-3 border-l border-slate-200"></td>
              </tr>
            ))}
            {(!data.tables.ingresos || data.tables.ingresos.length === 0) && (
              <tr className="border-b border-slate-100">
                <td colSpan={5} className="py-2 text-center text-xs text-slate-400">No hay ingresos registrados</td>
              </tr>
            )}

            {/* DEVOLUCION */}
            <tr className="border-y border-slate-200">
              <td colSpan={5} className="py-2 px-3 font-black text-xs text-[#181c3a] underline uppercase mt-2 block border-0">
                DEVOLUCION
              </td>
            </tr>
            {(data.tables.devoluciones || []).map((row:any, i:number) => (
              <tr key={`devolucion-${i}`} className="border-b border-slate-100 last:border-0">
                <td className="py-1.5 px-3 pl-6 font-medium text-[#181c3a] text-xs flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-[#181c3a]"></span> {row.courier}
                </td>
                <td className="py-1.5 px-3 text-center border-l border-slate-200 text-xs font-bold">{row.cajas}</td>
                <td className="py-1.5 px-3 text-center border-l border-slate-200 text-xs font-bold">{row.procesadasHoy}</td>
                <td className="py-1.5 px-3 text-center border-l border-slate-200 text-xs text-slate-500 font-semibold">{row.acumulada}</td>
                <td className="py-1.5 px-3 border-l border-slate-200"></td>
              </tr>
            ))}
            {(!data.tables.devoluciones || data.tables.devoluciones.length === 0) && (
              <tr>
                <td colSpan={5} className="py-2 text-center text-xs text-slate-400">No hay devoluciones registradas</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
