"use client";

import React, { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Badge, Button, Card, DataTable, type DataTableColumn, notify } from '@/components/ui';
import { ModulePage, ModuleToolbar } from '@/components/module-page';
import { apiFetch, haltForLoginRedirect, isApiAuthFailure, readApiJson } from '@/lib/http/apiFetch';
import { formatWarehouseBoxId } from '@/modules/inventario/client/warehouseBoxDisplay';
import { resolveBoxDisplayStatus } from '@/modules/inventario/client/warehouseBoxes';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  MapPin,
  PackageMinus,
  Truck,
  RefreshCw,
  Warehouse,
  Download,
  FileSpreadsheet,
  CheckSquare,
  Square,
  Eye,
} from 'lucide-react';
import {
  OutboundBoxDetailDrawer,
  loadOutboundBoxSeries,
} from './OutboundBoxDetailDrawer';
import type { OutboundBoxRow } from './outboundSalidaTypes';
import {
  downloadOutboundBoxExcel,
  OUTBOUND_EXCEL_MAX_TOTAL,
} from '@/lib/api/downloadOutboundBoxExcel';

type ModelSummaryRow = {
  key: string;
  techName: string;
  marcaLabel: string;
  modeloLabel: string;
  boxCount: number;
  unitCount: number;
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [exporting, setExporting] = useState(false);
  const [detailBox, setDetailBox] = useState<OutboundBoxRow | null>(null);
  const [detailSeries, setDetailSeries] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const openBoxDetail = useCallback(async (row: OutboundBoxRow) => {
    setDetailBox(row);
    setDetailSeries([]);
    setDetailLoading(true);
    const ui = await loadOutboundBoxSeries(row.realDbId);
    setDetailSeries(ui);
    setDetailLoading(false);
  }, []);

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

  const totals = useMemo(() => {
    const totalBoxes = rows.length;
    const totalUnits = rows.reduce((acc, r) => acc + r.unitCount, 0);
    return { totalBoxes, totalUnits };
  }, [rows]);

  const modelSummary = useMemo((): ModelSummaryRow[] => {
    const map = new Map<string, ModelSummaryRow>();
    for (const r of rows) {
      const key = `${r.techName}|${r.marcaLabel}|${r.modeloLabel}`;
      const prev = map.get(key);
      if (prev) {
        prev.boxCount += 1;
        prev.unitCount += r.unitCount;
      } else {
        map.set(key, {
          key,
          techName: r.techName,
          marcaLabel: r.marcaLabel,
          modeloLabel: r.modeloLabel,
          boxCount: 1,
          unitCount: r.unitCount,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.unitCount - a.unitCount);
  }, [rows]);

  const toggleSelect = useCallback((realDbId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(realDbId)) next.delete(realDbId);
      else next.add(realDbId);
      return next;
    });
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === rows.length && rows.every((r) => prev.has(r.realDbId))) {
        return new Set();
      }
      return new Set(rows.map((r) => r.realDbId));
    });
  }, [rows]);

  const runExport = useCallback(
    async (boxIds: string[], label: string) => {
      if (boxIds.length > OUTBOUND_EXCEL_MAX_TOTAL) {
        notify.warning(`Máximo ${OUTBOUND_EXCEL_MAX_TOTAL} cajas por exportación.`, {
          description: 'Reduzca la selección o exporte en varias tandas.',
        });
        return;
      }
      setExporting(true);
      try {
        const result = await downloadOutboundBoxExcel(boxIds, label, {
          filePrefix: 'Bodega_Salida',
        });
        notify.success('Excel generado', {
          description: `${result.boxes} caja(s) en un solo Excel · Detalle + Resumen por modelo.`,
        });
      } catch (err) {
        notify.error('No se pudo exportar', {
          description: err instanceof Error ? err.message : 'Error desconocido',
        });
      } finally {
        setExporting(false);
      }
    },
    []
  );

  const allVisibleSelected =
    rows.length > 0 && rows.every((r) => selectedIds.has(r.realDbId));

  const columns = useMemo((): DataTableColumn<OutboundBoxRow>[] => {
    return [
      {
        id: 'select',
        header: (
          <button
            type="button"
            className="inline-flex items-center text-[var(--sidebar-foreground)]/90"
            title={allVisibleSelected ? 'Quitar selección' : 'Seleccionar visibles'}
            onClick={toggleSelectAllVisible}
          >
            {allVisibleSelected ? (
              <CheckSquare className="h-4 w-4" />
            ) : (
              <Square className="h-4 w-4" />
            )}
          </button>
        ),
        width: '44px',
        cell: (item) => (
          <button
            type="button"
            className="inline-flex items-center text-[var(--accent)]"
            onClick={(e) => {
              e.stopPropagation();
              toggleSelect(item.realDbId);
            }}
            aria-label={`Seleccionar caja ${item.displayId}`}
          >
            {selectedIds.has(item.realDbId) ? (
              <CheckSquare className="h-4 w-4" />
            ) : (
              <Square className="h-4 w-4 text-[var(--muted)]" />
            )}
          </button>
        ),
      },
      {
        id: 'caja',
        header: 'ID Caja',
        width: '160px',
        cell: (item) => (
          <button
            type="button"
            className="truncate text-left font-bold text-[var(--accent)] hover:underline"
            title={item.displayIdFull}
            onClick={() => void openBoxDetail(item)}
          >
            {item.displayId}
            {item.isLegacyBoxCode && (
              <Badge variant="yellow" className="ml-1.5 shrink-0 px-1.5 text-[8px] font-black tracking-wide">
                LEGACY
              </Badge>
            )}
          </button>
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
      {
        id: 'acciones',
        header: 'Acciones',
        width: '100px',
        align: 'center',
        cell: (item) => (
          <div className="flex items-center justify-center gap-1">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--accent)] hover:bg-[var(--surface-hover)]"
              title="Ver series pistoleadas"
              onClick={(e) => {
                e.stopPropagation();
                void openBoxDetail(item);
              }}
            >
              <Eye className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
              disabled={exporting}
              title="Descargar Excel de esta caja"
              onClick={(e) => {
                e.stopPropagation();
                void runExport([item.realDbId], item.displayId.replace(/[^\w.-]+/g, '_'));
              }}
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        ),
      },
    ];
  }, [
    allVisibleSelected,
    exporting,
    runExport,
    selectedIds,
    toggleSelect,
    openBoxDetail,
    toggleSelectAllVisible,
  ]);

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
        <Button
          variant="primary"
          size="sm"
          className="gap-1.5 ml-auto"
          disabled={exporting || selectedIds.size === 0}
          onClick={() =>
            void runExport([...selectedIds], `${selectedIds.size}_cajas_seleccionadas`)
          }
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Reporte Excel ({selectedIds.size})
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="border-2 border-[var(--border)] p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
            Cajas en pantalla
          </p>
          <p className="mt-1 text-3xl font-black text-[var(--heading)]">{totals.totalBoxes}</p>
          <p className="text-[10px] font-bold text-[var(--muted)]">
            Use “Cargar más” si faltan cajas en la lista.
          </p>
        </Card>
        <Card className="border-2 border-accent/30 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)]">
            Equipos a salir (total)
          </p>
          <p className="mt-1 text-3xl font-black text-[var(--heading)]">{totals.totalUnits}</p>
          <p className="text-[10px] font-bold text-[var(--muted)]">Suma de equipos en cajas cargadas</p>
        </Card>
        <Card className="border-2 border-[var(--border)] p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
            Selección para reporte
          </p>
          <p className="mt-1 text-3xl font-black text-[var(--heading)]">{selectedIds.size}</p>
          <p className="text-[10px] font-bold text-[var(--muted)]">
            Marque cajas y use “Reporte Excel”
          </p>
        </Card>
      </div>

      {modelSummary.length > 0 && (
        <Card padding="none" className="mb-4 overflow-hidden border border-[var(--border)]">
          <div className="border-b border-[var(--border)] bg-[var(--surface-hover)] px-4 py-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-[var(--heading)]">
              Detalle por modelo (cajas cargadas)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--sidebar)] text-[10px] font-black uppercase tracking-wider text-[var(--sidebar-foreground)]/80">
                <tr>
                  <th className="px-4 py-2">Tecnología</th>
                  <th className="px-4 py-2">Marca</th>
                  <th className="px-4 py-2">Modelo</th>
                  <th className="px-4 py-2 text-right">Cajas</th>
                  <th className="px-4 py-2 text-right">Equipos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {modelSummary.map((m) => (
                  <tr key={m.key} className="hover:bg-[var(--surface-hover)]">
                    <td className="px-4 py-2 font-semibold text-[var(--accent)]">{m.techName}</td>
                    <td className="px-4 py-2 font-bold">{m.marcaLabel}</td>
                    <td className="px-4 py-2 font-bold">{m.modeloLabel}</td>
                    <td className="px-4 py-2 text-right font-mono">{m.boxCount}</td>
                    <td className="px-4 py-2 text-right font-mono font-black text-[var(--heading)]">
                      {m.unitCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

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
          minWidth={1120}
          headerClassName="border-b border-[var(--sidebar)] bg-[var(--sidebar)]"
          headerTextClassName="text-[var(--sidebar-foreground)]/80"
          rowClassName={() => 'cursor-pointer hover:bg-[var(--surface-hover)]/80'}
          onRowClick={(item) => void openBoxDetail(item)}
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

      {detailBox && (
        <OutboundBoxDetailDrawer
          box={detailBox}
          loading={detailLoading}
          seriesRows={detailSeries}
          exporting={exporting}
          onClose={() => setDetailBox(null)}
          onExportExcel={(id, label) => void runExport([id], label)}
        />
      )}
    </ModulePage>
  );
}
