import React from 'react';
import { Card, Badge, Button } from '@/components/ui';
import { Warehouse, AlertTriangle, Clock } from 'lucide-react';

export function BodegaKpiView({ data, timeRange = 'Hoy' }: { data: any, timeRange?: string }) {
  if (!data) return null;
  const timeLabel = timeRange.toUpperCase();

  return (
    <div className="flex flex-col gap-4 border-2 border-slate-200 rounded-xl bg-[#f9f8f4] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
            <Warehouse size={20} />
          </div>
          <h3 className="text-lg font-black text-[#181c3a]">Bodega</h3>
        </div>
        <Badge className="bg-[#f0eadd] text-[#86754d] font-bold px-4 py-1">Pendientes de ingreso</Badge>
      </div>

      {/* Warning Banner */}
      <div className="mx-4 mt-2 px-4 py-3 bg-[#f3efe6] border border-[#e8dfc8] rounded-lg flex items-center gap-3">
        <AlertTriangle className="text-[#a48e58] w-5 h-5" />
        <span className="text-sm font-semibold text-[#665a3d]">
          Pendientes de ingresar: <span className="font-black text-[#181c3a]">{data.pendientesIngreso}</span> | Pendientes de Recepción (desde Backoffice): <span className="font-black text-[#181c3a]">{data.pendientesRecepcion}</span>
        </span>
      </div>

      {/* Main Metrics (Flow Oriented) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 px-4">
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-t-[3px] border-t-emerald-600">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 line-clamp-1">BOX recibidas ({timeLabel})</p>
          <p className="text-2xl font-black text-emerald-600">{data.ingresadasHoy}</p>
        </Card>
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-t-[3px] border-t-amber-500">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 line-clamp-1" title="Equipos pendientes de ingresar">Pendientes Ingresar</p>
          <p className="text-2xl font-black text-amber-600">{data.pendientesIngreso}</p>
        </Card>
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-t-[3px] border-t-orange-500">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 line-clamp-1" title="Pendientes de Recepción (Historial Backoffice)">Pendiente Recepción</p>
          <p className="text-2xl font-black text-orange-600">{data.pendientesRecepcion}</p>
        </Card>
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-t-[3px] border-t-blue-500">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 line-clamp-1">Traslados</p>
          <p className="text-2xl font-black text-blue-600">{data.traslados}</p>
        </Card>
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-t-[3px] border-t-purple-500">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 line-clamp-1">Despachos</p>
          <p className="text-2xl font-black text-purple-600">{data.despachos}</p>
        </Card>
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-t-[3px] border-t-[#181c3a]">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 line-clamp-1">Inv. Disponible</p>
          <p className="text-2xl font-black text-[#181c3a]">{data.inventario}</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="bg-white mx-4 rounded-xl border border-slate-200 p-4 flex items-center gap-4">
        <span className="text-xs font-bold text-slate-400">Tecnología:</span>
        <div className="flex flex-wrap gap-2">
          {(data.tables.pendientes || []).map((row: any) => row.tecnologia).filter((v:any, i:any, a:any) => a.indexOf(v) === i).map((tech: string) => (
            <Button key={tech} variant="outline" className="text-xs font-bold border-slate-300">{tech}</Button>
          ))}
        </div>
      </div>

      {/* Tables Area */}
      <div className="bg-white mx-4 mb-4 rounded-xl border border-slate-200 overflow-hidden grid grid-cols-2">
        
        {/* Ingresos por usuario */}
        <div className="border-r border-slate-100 flex flex-col">
          <div className="flex justify-between items-center p-3 bg-emerald-50/50 border-b border-slate-100">
            <span className="text-xs font-bold text-emerald-700 flex items-center gap-2">
               Ingresos por usuario
            </span>
            <span className="text-[10px] font-bold text-emerald-600">Total: {data.tables.ingresos.reduce((a:any, b:any) => a + b.ingresadas, 0)}</span>
          </div>
          <table className="w-full text-xs text-left">
            <thead className="text-slate-400 border-b border-slate-100">
              <tr><th className="p-2 font-semibold">Usuario</th><th className="p-2 font-semibold text-center">Ingresadas</th><th className="p-2 font-semibold text-center">Tecnología</th><th className="p-2 font-semibold text-center">Estado</th></tr>
            </thead>
            <tbody>
              {data.tables.ingresos.map((r:any, i:number) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  <td className="p-2 font-bold text-[#181c3a]">{r.usuario}</td>
                  <td className="p-2 text-center font-bold text-[#181c3a]">{r.ingresadas}</td>
                  <td className="p-2 text-center text-slate-600 font-semibold">{r.tecnologia || '—'}</td>
                  <td className="p-2 text-center">
                    <Badge className={`px-2 py-0.5 text-[9px] ${r.estado==='Ok'?'bg-emerald-50 text-emerald-600':'bg-amber-50 text-amber-600'}`}>{r.estado}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pendientes por tecnología */}
        <div className="flex flex-col">
          <div className="flex justify-between items-center p-3 bg-[#faf9f5] border-b border-slate-100">
            <span className="text-xs font-bold text-[#86754d] flex items-center gap-2">
               <Clock className="w-4 h-4" /> Pendientes por tecnología
            </span>
            <span className="text-[10px] font-bold text-[#86754d]">Pendientes: {data.tables.pendientes.reduce((a:any, b:any) => a + b.pendientes, 0)}</span>
          </div>
          <table className="w-full text-xs text-left">
            <thead className="text-slate-400 border-b border-slate-100">
              <tr><th className="p-2 font-semibold">Tecnología</th><th className="p-2 font-semibold text-center">Ingresadas</th><th className="p-2 font-semibold text-center">Pendientes</th><th className="p-2 font-semibold text-center">Estado</th></tr>
            </thead>
            <tbody>
              {data.tables.pendientes.map((r:any, i:number) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  <td className="p-2 font-bold text-[#181c3a]">{r.tecnologia}</td>
                  <td className="p-2 text-center font-bold text-[#181c3a]">{r.ingresadas}</td>
                  <td className="p-2 text-center text-slate-600 font-semibold">{r.pendientes}</td>
                  <td className="p-2 text-center">
                    <Badge className={`px-2 py-0.5 text-[9px] ${r.estado==='Ok'?'bg-emerald-50 text-emerald-600':r.estado==='Urgente'?'bg-rose-50 text-rose-600':'bg-amber-50 text-amber-600'}`}>{r.estado}</Badge>
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
