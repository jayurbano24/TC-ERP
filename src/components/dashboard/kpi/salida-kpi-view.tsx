import React from 'react';
import { Card, Badge } from '@/components/ui';
import { Package, Truck, Clock } from 'lucide-react';

export function SalidaKpiView({ data }: { data: any }) {
  if (!data) return null;

  return (
    <div className="flex flex-col gap-4 border-2 border-slate-200 rounded-xl bg-[#f9f8f4] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
            <Package size={20} />
          </div>
          <h3 className="text-lg font-black text-[#181c3a]">Salida</h3>
        </div>
        <Badge className="bg-emerald-50 text-emerald-600 font-bold px-4 py-1">Aprobados CC</Badge>
      </div>

      {/* Warning Banner */}
      <div className="mx-4 mt-2 px-4 py-3 bg-blue-50/50 border border-blue-100 rounded-lg flex items-center gap-3">
        <span className="text-sm font-semibold text-blue-800">
          Equipos listos para despacho: <span className="font-black text-blue-900">{data.listosDespacho}</span> | Despachados hoy: <span className="font-black text-blue-900">{data.despachadosHoy}</span>
        </span>
      </div>

      {/* Main Metrics */}
      <div className="grid grid-cols-3 gap-4 px-4">
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Despachadas hoy</p>
          <p className="text-3xl font-black text-emerald-600">{data.despachadasHoy}</p>
        </Card>
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-l-[3px] border-l-[#181c3a]">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Listas para despacho</p>
          <p className="text-3xl font-black text-[#181c3a]">{data.listasDespacho}</p>
        </Card>
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-l-[3px] border-l-[#86754d]">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Pendientes salida</p>
          <p className="text-3xl font-black text-[#86754d]">{data.pendientesSalida}</p>
        </Card>
      </div>

      {/* Equipment Bubbles */}
      <div className="flex flex-wrap gap-4 mx-4 mb-4 justify-between">
        {(data.activeTechs || []).map((tech: string, i: number) => (
          <Card key={i} className="flex flex-col items-center justify-center p-6 bg-white shadow-sm rounded-[2rem] border border-slate-100 flex-1 min-w-[120px]">
            <p className="text-[10px] font-black text-[#181c3a] uppercase tracking-widest mb-3">{tech}</p>
            <p className="text-4xl font-black text-[#181c3a] mb-2">{data.techListCount?.[tech] || 0}</p>
            <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Equipos</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
