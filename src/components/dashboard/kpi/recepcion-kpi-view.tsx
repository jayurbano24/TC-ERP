import React from 'react';
import { Card, Badge, Button } from '@/components/ui';
import { Calendar, Filter, Users, AlertTriangle, Package, Truck, Layers } from 'lucide-react';

export function RecepcionKpiView({ data }: { data: any }) {
  if (!data) return null;

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
        <Badge className="bg-blue-50 text-blue-600 font-bold px-4 py-1">Hoy</Badge>
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
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Cajas recibidas hoy</p>
          <p className="text-3xl font-black text-blue-600">{data.cajasRecibidasHoy}</p>
        </Card>
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Total unidades</p>
          <p className="text-3xl font-black text-blue-600">{data.totalUnidades}</p>
        </Card>
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-l-[3px] border-l-[#181c3a]">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Origen CAC</p>
          <p className="text-3xl font-black text-[#181c3a]">{data.origenCac}</p>
        </Card>
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-l-[3px] border-l-[#181c3a]">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Origen PX</p>
          <p className="text-3xl font-black text-[#181c3a]">{data.origenPx}</p>
        </Card>
      </div>

      {/* Tables Area */}
      <div className="bg-white mx-4 mb-4 rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="py-2 px-3 font-bold text-[#181c3a] text-xs w-1/4"></th>
              <th className="py-2 px-3 font-bold text-[#181c3a] text-xs text-center border-l border-slate-200">CAJA</th>
              <th className="py-2 px-3 font-bold text-[#181c3a] text-xs text-center border-l border-slate-200">PROCESADA HOY</th>
              <th className="py-2 px-3 font-bold text-[#181c3a] text-xs text-center border-l border-slate-200">ACUMULADA</th>
              <th className="py-2 px-3 border-l border-slate-200"></th>
            </tr>
          </thead>
          <tbody>
            {/* INGRESOS */}
            <tr className="border-b border-slate-200">
              <td colSpan={5} className="py-2 px-3 font-black text-xs text-[#181c3a] underline uppercase">
                INGRESOS
              </td>
            </tr>
            {(data.tables.ingresos || []).map((row:any, i:number) => (
              <tr key={`ingreso-${i}`} className="border-b border-slate-100 last:border-0">
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
