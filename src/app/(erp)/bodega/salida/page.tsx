"use client";

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Badge, Button, Card, DataTable, type DataTableColumn, notify } from '@/components/ui';
import { ModulePage, ModuleToolbar } from '@/components/module-page';
import { apiFetch, haltForLoginRedirect, isApiAuthFailure, readApiJson } from '@/lib/http/apiFetch';
import { formatWarehouseBoxId } from '@/modules/inventario/client/warehouseBoxDisplay';
import { resolveBoxDisplayStatus } from '@/modules/inventario/client/warehouseBoxes';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { MapPin, PackageMinus, Truck, RefreshCw, Warehouse } from 'lucide-react';

type OutboundBoxRow = {
  id: string;
  displayId: string;
  displayIdFull: string;
  isLegacyBoxCode: boolean;
  realDbId: string;
  rack: string;
  marcaLabel: string;
  modeloLabel: string;
  techName: string;
  unitCount: number;
  capacity: number;
  status: string;
  usuarioIngreso: string;
  fechaIngreso: string;
};

type ApiBox = {
  box_id: string;
  label?: string | null;
  rack?: string | null;
  capacity?: number | null;
  series_count?: number | null;
  equipos_count?: number | null;
  brand_name?: string | null;
  model_name?: string | null;
  tech_name?: string | null;
  ingreso_user_name?: string | null;
  created_at?: string | null;
};

async function fetchOutboundPage({
  pageParam,
  search,
}: {
  pageParam?: string;
  search: string;
}): Promise<{ items: ApiBox[]; nextCursor: string | null }> {
  const url = new URL('/api/v1/warehouse/outbound-boxes', window.location.origin);
  url.searchParams.set('limit', '100');
  if (pageParam) url.searchParams.set('cursor', pageParam);
  if (search) url.searchParams.set('search', search);

  const res = await apiFetch(url.toString());
  if (isApiAuthFailure(res.status, null)) {
    await haltForLoginRedirect();
  }
  return readApiJson(res);
}

export default function BodegaSalidaPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  const query = useInfiniteQuery({
    queryKey: ['warehouse-outbound-boxes', debouncedSearch],
    queryFn: ({ pageParam }) =>
      fetchOutboundPage({ pageParam: pageParam as string | undefined, search: debouncedSearch }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const rows = useMemo((): OutboundBoxRow[] => {
    const items = (query.data?.pages || []).flatMap((p) => p.items || []);
    return items.map((b) => {
      const boxCode = b.label || '';
      const fmt = formatWarehouseBoxId(boxCode, b.box_id);
      const units = Number(b.equipos_count ?? b.series_count ?? 0);
      const capacity = Number(b.capacity || 0);
      return {
        id: boxCode || b.box_id,
        displayId: fmt.primary,
        displayIdFull: fmt.full,
        isLegacyBoxCode: fmt.isLegacy,
        realDbId: b.box_id,
        rack: b.rack || 'OUTBOUND',
        marcaLabel: b.brand_name || 'N/A',
        modeloLabel: b.model_name || 'N/A',
        techName: b.tech_name || '---',
        unitCount: units,
        capacity,
        status: resolveBoxDisplayStatus(units, capacity),
        usuarioIngreso: b.ingreso_user_name || 'Sin registro',
        fechaIngreso: new Date(b.created_at || Date.now()).toLocaleString('es-GT', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
    });
  }, [query.data]);

  const columns = useMemo((): DataTableColumn<OutboundBoxRow>[] => {
    return [
      {
        id: 'caja',
        header: 'ID Caja',
        width: '160px',
        cell: (item) => (
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-bold text-[var(--foreground)]" title={item.displayIdFull}>
              {item.displayId}
            </span>
            {item.isLegacyBoxCode && (
              <Badge variant="yellow" className="shrink-0 px-1.5 text-[8px] font-black tracking-wide">
                LEGACY
              </Badge>
            )}
          </div>
        ),
      },
      {
        id: 'fecha',
        header: 'Fecha',
        width: '140px',
        cell: (item) => (
          <span className="text-[10px] text-[var(--muted)]">{item.fechaIngreso}</span>
        ),
      },
      {
        id: 'tech',
        header: 'Tecnología',
        width: '80px',
        cell: (item) => (
          <span className="text-[10px] font-semibold text-[var(--accent)]">{item.techName}</span>
        ),
      },
      {
        id: 'ubicacion',
        header: 'Ubicación',
        width: '120px',
        cell: (item) => (
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span className="rounded-md border border-[var(--border)] bg-[var(--surface-hover)] px-1.5 py-0.5 text-[9px] font-bold">
              {item.rack}
            </span>
          </div>
        ),
      },
      {
        id: 'marca',
        header: 'Marca / Modelo',
        width: '180px',
        cell: (item) => {
          const label = [item.marcaLabel, item.modeloLabel].filter(Boolean).join(' ');
          return (
            <span className="block truncate text-[11px] font-semibold" title={label}>
              {label}
            </span>
          );
        },
      },
      {
        id: 'cantidad',
        header: 'Cantidad',
        width: '90px',
        cell: (item) => (
          <span className="text-[11px] font-bold text-[var(--accent)]">
            {item.unitCount} / {item.capacity || '—'}
          </span>
        ),
      },
      {
        id: 'estatus',
        header: 'Estatus',
        width: '90px',
        cell: (item) => (
          <Badge variant={item.status === 'Full' ? 'green' : 'default'} className="text-[9px]">
            {item.status.toUpperCase()}
          </Badge>
        ),
      },
      {
        id: 'usuario',
        header: 'Usuario',
        width: '120px',
        cell: (item) => (
          <span className="truncate text-[10px]">
            {(item.usuarioIngreso || 'Sin registro').split('@')[0]}
          </span>
        ),
      },
    ];
  }, []);

  return (
    <ModulePage
      title="Bodega de Salida"
      subtitle="Cajas OUTBOUND / staging de despacho (incl. LEGACY). No forman parte del stock de Bodega Central."
      category="Bodega"
      backHref="/bodega/gestion"
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/bodega/gestion">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Warehouse className="h-3.5 w-3.5" />
            Bodega Central
          </Button>
        </Link>
        <Link href="/despacho">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Truck className="h-3.5 w-3.5" />
            Ir a Despacho
          </Button>
        </Link>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            void query.refetch().then(() => notify.success('Actualizado'));
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Actualizar
        </Button>
      </div>

      <ModuleToolbar
        searchValue={search}
        onSearch={setSearch}
        searchPlaceholder="Buscar código o ubicación…"
      />

      <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-200/60 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
        <PackageMinus className="h-3.5 w-3.5 shrink-0" />
        Estas cajas son de Despacho (OUTBOUND). Cajas SCRAP físicas: Bodega SCRAPS. Cola sin caja: Taller → Scraps.
      </div>

      <Card padding="none" className="overflow-hidden border-2 border-border shadow-sm">
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(item) => item.realDbId}
          rowHeight={44}
          compact
          maxBodyHeight={720}
          minWidth={1000}
          headerClassName="border-b border-[var(--sidebar)] bg-[var(--sidebar)]"
          headerTextClassName="text-[var(--sidebar-foreground)]/80"
          emptyMessage={
            query.isLoading ? 'Cargando…' : 'Sin cajas en Bodega de Salida'
          }
        />
        {query.hasNextPage && (
          <div className="flex justify-center p-4">
            <Button
              variant="outline"
              onClick={() => void query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
            >
              {query.isFetchingNextPage ? 'Cargando más…' : 'Cargar más cajas'}
            </Button>
          </div>
        )}
      </Card>
    </ModulePage>
  );
}
