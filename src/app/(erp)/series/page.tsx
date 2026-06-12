// Limpio para nuevo diseño
// src/app/(erp)/series/page.tsx
import { ModulePage } from "@/components/module-page";

export default function SeriesPage() {
  return (
    <ModulePage
      title="Trazabilidad y Registro SN"
      subtitle="Captura inteligente de numeros de serie, validacion contra base de datos y generacion automatica de ordenes de servicio."
      category="Control por Series"
    >
      <div className="p-8">
        <h2 className="text-xl font-bold mb-4">Módulo en construcción</h2>
        <p className="text-slate-500">Este módulo se encuentra en proceso de actualización.</p>
      </div>
    </ModulePage>
  );
}