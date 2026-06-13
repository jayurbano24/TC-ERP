import React from 'react';
import { Card, Badge, Button } from '@/components/ui';
import { Warehouse, AlertTriangle, Clock } from 'lucide-react';

export function BodegaKpiView({ data }: { data: any }) {
  if (!data) return null;

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
          Unidades pendientes de ingresar: <span className="font-black text-[#181c3a]">{data.unidadesPendientes}</span> | Sin tecnología asignada: <span className="font-black text-[#181c3a]">{data.sinTecnologia}</span>
        </span>
      </div>

      {/* Main Metrics */}
      <div className="grid grid-cols-3 gap-4 px-4">
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Ingresadas a bodega</p>
          <p className="text-3xl font-black text-emerald-600">{data.ingresadasBodega}</p>
        </Card>
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-l-[3px] border-l-[#181c3a]">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Pendiente de ingresar</p>
          <p className="text-3xl font-black text-[#86754d]">{data.pendienteIngresar}</p>
        </Card>
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-l-[3px] border-l-[#181c3a]">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Total en bodega</p>
          <p className="text-3xl font-black text-[#181c3a]">{data.totalEnBodega}</p>
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
