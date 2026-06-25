"use client";

import { ModulePage } from "@/components/module-page";
import { Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/http/apiFetch';

async function fetchInventarioDashboardKpis() {
  const res = await apiFetch('/api/inventario/dashboard');
  if (!res.ok) throw new Error('Dashboard CQRS no disponible');
  const data = await res.json();
  return data?.data?.kpis ?? null;
}

export default function BodegaPage() {
  // C6: TanStack Query — cachea el resultado y evita re-consultar en cada montaje
  // o al navegar dentro de la ventana de staleTime.
  const { data: dashboardKpis, isLoading: loading } = useQuery({
    queryKey: ['inventario-dashboard'],
    queryFn: fetchInventarioDashboardKpis,
  });
  const useNewDashboard = Boolean(dashboardKpis);

  return (
    <ModulePage
      title="Gestion de Inventario y Series"
      subtitle="Bodega Central"
      category="Bodega Central"
    >
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl mb-6">
        <p className="text-slate-600 text-sm">Control total de existencias, movimientos entre ubicaciones y trazabilidad por numero de serie. Gestion de ingresos, egresos y auditorias de stock.</p>
      </div>
      
      {loading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="w-8 h-8 text-[#2ec4f1] animate-spin" />
        </div>
      ) : useNewDashboard && dashboardKpis ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 animate-rise-in">
          <div className="p-4 bg-[#181c3a] text-white border-2 border-[#2ec4f1] rounded-2xl shadow-lg">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Total Artículos</p>
            <p className="text-3xl font-black text-[#2ec4f1] mt-2">{dashboardKpis.totalArticulos}</p>
            <p className="text-[10px] opacity-50 mt-1">Unidades en inventario</p>
          </div>
          <div className="p-4 bg-white border-2 border-slate-100 rounded-2xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Referencias</p>
            <p className="text-3xl font-black text-[#181c3a] mt-2">{dashboardKpis.totalReferencias}</p>
            <p className="text-[10px] text-slate-500 mt-1">SKUs distintos</p>
          </div>
          <div className="p-4 bg-white border-2 border-slate-100 rounded-2xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Valor Total</p>
            <p className="text-3xl font-black text-emerald-500 mt-2">${dashboardKpis.valorTotal.toLocaleString()}</p>
            <p className="text-[10px] text-slate-500 mt-1">Valorización de Bodega</p>
          </div>
          <div className="p-4 bg-white border-2 border-rose-100 rounded-2xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-rose-400">Items Críticos</p>
            <p className="text-3xl font-black text-rose-500 mt-2">{dashboardKpis.itemsCriticos}</p>
            <p className="text-[10px] text-slate-500 mt-1">SKUs con stock en 0</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {[
            { titulo: "Items en Stock", valor: "2.4k", detalle: "Total de unidades disponibles en sistema." },
            { titulo: "Movimientos", valor: "84", detalle: "Transferencias realizadas el dia de hoy." },
            { titulo: "Alertas Stock", valor: "5", detalle: "Productos por debajo del minimo establecido." },
            { titulo: "Auditorias", valor: "98%", detalle: "Nivel de precision en el ultimo conteo fisico." },
          ].map((h, i) => (
            <div key={i} className="p-4 bg-white border border-slate-200 rounded-xl">
              <p className="text-xs font-bold text-slate-400">{h.titulo}</p>
              <p className="text-2xl font-black text-[#181c3a]">{h.valor}</p>
              <p className="text-[10px] text-slate-500 mt-1">{h.detalle}</p>
            </div>
          ))}
        </div>
      )}
    </ModulePage>
  );
}
