import React from 'react';
import { Card, Badge, Button } from '@/components/ui';
import { Users, AlertTriangle, Calendar } from 'lucide-react';

export function BackofficeKpiView({ data, timeRange = 'Hoy' }: { data: any, timeRange?: string }) {
  if (!data) return null;
  const timeLabel = timeRange.toUpperCase();

  return (
    <div className="flex flex-col gap-4 border-2 border-slate-200 rounded-xl bg-[#f9f8f4] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-teal-50 text-teal-600 rounded-lg">
            <Users size={20} />
          </div>
          <h3 className="text-lg font-black text-[#181c3a]">Backoffice</h3>
        </div>
        <Badge className="bg-[#f0eadd] text-[#86754d] font-bold px-4 py-1">Devoluciones pendientes</Badge>
      </div>

      {/* Warning Banner */}
      <div className="mx-4 mt-2 px-4 py-3 bg-[#f3efe6] border border-[#e8dfc8] rounded-lg flex items-center gap-3">
        <AlertTriangle className="text-[#a48e58] w-5 h-5" />
        <span className="text-sm font-semibold text-[#665a3d]">
          Devoluciones pendientes de retornar: <span className="font-black text-[#181c3a]">{data.devolucionesPendientesRetornar}</span> | Sin ingresar a bodega: <span className="font-black text-[#181c3a]">{data.sinIngresarBodega}</span>
        </span>
      </div>

      {/* Main Metrics */}
      <div className="grid grid-cols-3 gap-4 px-4">
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Unidades registradas ({timeLabel})</p>
          <p className="text-3xl font-black text-blue-600">{data.registradasHoy}</p>
        </Card>
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-l-[3px] border-l-[#181c3a]">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Devoluciones pendientes</p>
          <p className="text-3xl font-black text-[#86754d]">{data.devolucionesPendientes}</p>
        </Card>
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-l-[3px] border-l-emerald-600">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Ingresadas a bodega</p>
          <p className="text-3xl font-black text-emerald-600">{data.ingresadasBodega}</p>
        </Card>
      </div>

      {/* Filters (Removed redundant date range) */}
      <div className="bg-white mx-4 rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex gap-4 items-center">
          <span className="text-xs font-bold text-slate-400">Ver por:</span>
          <div className="flex gap-2">
            <Button variant="outline" className="text-xs font-bold border-[#181c3a] text-[#181c3a]">Usuario</Button>
            <Button variant="outline" className="text-xs font-bold text-slate-500">Tecnología</Button>
            <Button variant="outline" className="text-xs font-bold text-slate-500">Modelo</Button>
          </div>
        </div>
      </div>

      {/* Tables Area */}
      <div className="bg-white mx-4 mb-4 rounded-xl border border-slate-200 overflow-hidden">
        
        {/* Top Row: 3 columns */}
        <div className="grid grid-cols-3 border-b border-slate-200">
          {/* Registro por usuario */}
          <div className="border-r border-slate-200 flex flex-col">
            <div className="flex items-center p-2 bg-white">
              <span className="text-xs font-bold text-[#181c3a]">Registro por usuario</span>
            </div>
            <table className="w-full text-xs text-left">
              <thead className="text-slate-800 border-b border-slate-200 bg-white">
                <tr>
                  <th className="p-2 font-bold">Usuario</th>
                  <th className="p-2 font-bold text-center">Registradas ({timeLabel})</th>
                  <th className="p-2 font-bold text-center">Totales</th>
                </tr>
              </thead>
              <tbody>
                {data.tables.registro.map((r:any, i:number) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0">
                    <td className="p-2 font-medium text-slate-600">{r.usuario}</td>
                    <td className="p-2 text-center font-medium text-slate-600">{r.registradas || '-'}</td>
                    <td className="p-2 text-center font-medium text-slate-600">{r.totales || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Devoluciones pendientes */}
          <div className="border-r border-slate-200 flex flex-col">
            <div className="flex items-center p-2 bg-white">
              <span className="text-xs font-bold text-[#181c3a]">Devoluciones pendientes</span>
            </div>
            <table className="w-full text-xs text-left">
              <thead className="text-slate-800 border-b border-slate-200 bg-white">
                <tr>
                  <th className="p-2 font-bold">Usuario</th>
                  <th className="p-2 font-bold text-center">Registradas ({timeLabel})</th>
                  <th className="p-2 font-bold text-center">Totales</th>
                </tr>
              </thead>
              <tbody>
                {data.tables.devoluciones.map((r:any, i:number) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0">
                    <td className="p-2 font-medium text-slate-600">{r.usuario}</td>
                    <td className="p-2 text-center font-medium text-slate-600">{r.devoluciones || '-'}</td>
                    <td className="p-2 text-center font-medium text-slate-600">{r.totales || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totales (PX, CAC) */}
          <div className="flex flex-col">
            <div className="flex items-center p-2 bg-white">
              <span className="text-xs font-bold text-white select-none">.</span>
            </div>
            <table className="w-full text-xs text-left">
              <thead className="text-slate-800 border-b border-slate-200 bg-white">
                <tr>
                  <th className="p-2 font-bold">Usuario</th>
                  <th className="p-2 font-bold text-center">Registradas ({timeLabel})</th>
                  <th className="p-2 font-bold text-center">PX</th>
                  <th className="p-2 font-bold text-center">CAC</th>
                </tr>
              </thead>
              <tbody>
                {(data.tables.totales || [{usuario: 'N/A'}]).map((r:any, i:number) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0">
                    <td className="p-2 font-medium text-slate-600">{r.usuario}</td>
                    <td className="p-2 text-center font-medium text-slate-600">{r.registradas || '-'}</td>
                    <td className="p-2 text-center font-medium text-slate-600">{r.px || '-'}</td>
                    <td className="p-2 text-center font-medium text-slate-600">{r.cac || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom Row: Tecnología */}
        <div className="flex flex-col">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="text-slate-800 border-b border-slate-200 bg-white">
              <tr>
                <th className="p-2 font-bold">Tecnología</th>
                <th className="p-2 font-bold text-center">Ingresada ({timeLabel})</th>
                <th className="p-2 font-bold text-center">Acumulada Esta Semana</th>
                <th className="p-2 font-bold text-center">Acumulada este mes</th>
              </tr>
            </thead>
            <tbody>
              {(data.tables.tecnologia || []).map((r:any, i:number) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  <td className="p-2 font-medium text-slate-800">{r.tecnologia}</td>
                  <td className="p-2 text-center font-medium text-slate-600">{r.ingresada || 0}</td>
                  <td className="p-2 text-center font-medium text-slate-600">{r.acumuladaSemana || 0}</td>
                  <td className="p-2 text-center font-medium text-slate-600">{r.acumuladaMes || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
