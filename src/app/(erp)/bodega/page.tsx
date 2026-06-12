// Limpio para nuevo diseño
// src/app/(erp)/bodega/page.tsx
import { ModulePage } from "@/components/module-page";

export default function BodegaPage() {
  return (
    <ModulePage
      title="Gestion de Inventario y Series"
      subtitle="Bodega Central"
      category="Bodega Central"
    >
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl mb-6">
        <p className="text-slate-600 text-sm">Control total de existencias, movimientos entre ubicaciones y trazabilidad por numero de serie. Gestion de ingresos, egresos y auditorias de stock.</p>
      </div>
      
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
    </ModulePage>
  );
}