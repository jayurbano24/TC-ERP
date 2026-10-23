'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, RefreshCw } from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import { ModulePage, ModuleToolbar } from '@/components/module-page';
import { apiFetch, readApiJson } from '@/lib/http/apiFetch';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

type ObsoleteBox = { box_id: string; label?: string | null; rack?: string | null; series_count?: number | null; brand_name?: string | null; model_name?: string | null; tech_name?: string | null; last_movement_at?: string | null };

async function loadObsoleteBoxes(search: string): Promise<ObsoleteBox[]> {
  const params = new URLSearchParams({ limit: '200' });
  if (search) params.set('search', search);
  const response = await apiFetch(`/api/v1/warehouse/obsolete-boxes?${params}`);
  return (await readApiJson<{ items: ObsoleteBox[] }>(response)).items;
}

export default function BodegaObsoletoPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const query = useQuery({ queryKey: ['warehouse-obsolete-boxes', debouncedSearch], queryFn: () => loadObsoleteBoxes(debouncedSearch) });
  const totalUnits = useMemo(() => (query.data ?? []).reduce((sum, row) => sum + Number(row.series_count ?? 0), 0), [query.data]);

  return (
    <ModulePage
      title="Bodega de Obsoleto"
      subtitle="Equipos clasificados como obsoletos desde la recepciÃ³n PX."
      category="Bodega"
      actions={<Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} /> Actualizar</Button>}
    >
      <ModuleToolbar onSearch={setSearch} searchValue={search} searchPlaceholder="Buscar por cÃ³digo de caja..." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 mb-6">
        <Card className="p-5"><p className="text-xs font-black uppercase text-slate-400">Cajas</p><p className="mt-2 text-3xl font-black">{query.data?.length ?? 0}</p></Card>
        <Card className="p-5"><p className="text-xs font-black uppercase text-slate-400">Equipos obsoletos</p><p className="mt-2 text-3xl font-black">{totalUnits}</p></Card>
      </div>
      <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead className="border-b bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-500"><tr><th className="p-4">Caja</th><th className="p-4">TecnologÃ­a</th><th className="p-4">Marca / Modelo</th><th className="p-4 text-center">Equipos</th><th className="p-4">UbicaciÃ³n</th><th className="p-4">Ingreso</th></tr></thead>
        <tbody className="divide-y">
          {query.isLoading && <tr><td colSpan={6} className="p-10 text-center text-slate-500">Cargando inventario...</td></tr>}
          {query.isError && <tr><td colSpan={6} className="p-10 text-center text-rose-600">No se pudo cargar la Bodega de Obsoleto.</td></tr>}
          {!query.isLoading && !query.isError && (query.data ?? []).length === 0 && <tr><td colSpan={6} className="p-12 text-center text-slate-500"><Box className="mx-auto mb-3 h-8 w-8" />No hay cajas obsoletas registradas.</td></tr>}
          {(query.data ?? []).map((row) => <tr key={row.box_id} className="hover:bg-slate-50/70"><td className="p-4 font-black">{row.label || row.box_id}</td><td className="p-4">{row.tech_name || 'â€”'}</td><td className="p-4"><span className="font-bold">{row.brand_name || 'â€”'}</span><span className="block text-xs text-slate-500">{row.model_name || 'Sin modelo'}</span></td><td className="p-4 text-center font-black">{row.series_count ?? 0}</td><td className="p-4"><Badge variant="red">{row.rack || 'OBSOLETO'}</Badge></td><td className="p-4 text-xs text-slate-500">{row.last_movement_at ? new Date(row.last_movement_at).toLocaleString('es-GT') : 'â€”'}</td></tr>)}
        </tbody>
      </table></div></Card>
    </ModulePage>
  );
}
