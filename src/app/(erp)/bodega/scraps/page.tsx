"use client";

import React, { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  DataTable,
  TablePagination,
  type DataTableColumn,
  notify,
} from '@/components/ui';
import { ModulePage, ModuleToolbar } from '@/components/module-page';
import { apiFetch, haltForLoginRedirect, isApiAuthFailure, readApiJson } from '@/lib/http/apiFetch';
import { formatWarehouseBoxId } from '@/modules/inventario/client/warehouseBoxDisplay';
import { resolveBoxDisplayStatus } from '@/modules/inventario/client/warehouseBoxes';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useReferenceCatalogs } from '@/hooks/useReferenceCatalogs';
import {
  ArrowLeftRight,
  Box,
  Eye,
  MapPin,
  PackageCheck,
  Pencil,
  Printer,
  QrCode,
  Search,
  TrendingUp,
  Truck,
  Warehouse,
  Wrench,
} from 'lucide-react';
import { PrintBoxModal } from '@/app/(erp)/bodega/gestion/components/PrintBoxModal';
import { DispatchModal } from '@/app/(erp)/bodega/gestion/components/DispatchModal';
import { TransferModal } from '@/app/(erp)/bodega/gestion/components/TransferModal';
import { RackModal } from '@/app/(erp)/bodega/gestion/components/RackModal';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  ScrapBoxDetailDrawer,
  loadScrapBoxSeries,
  type ScrapBoxRow,
} from './ScrapBoxDetailDrawer';
import { printScrapBoxLabel } from './printScrapBoxLabel';
import { useScrapProcessFlow } from './useScrapProcessFlow';
import { formatScrapRackLocation, parseScrapRackParts } from './scrapRackLocation';
import { ScrapDispatchModal } from '@/app/(erp)/produccion/taller/components/ScrapDispatchModal';
import { fetchWorkshopTasksPageViaApi } from '@/lib/api/workshopTasks';

const PAGE_SIZE = 25;

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
  tech_id?: string | null;
  model_id?: string | null;
  ingreso_user_name?: string | null;
  created_at?: string | null;
};

async function fetchScrapPage({
  pageParam,
  search,
}: {
  pageParam?: string;
  search: string;
}): Promise<{ items: ApiBox[]; nextCursor: string | null }> {
  const url = new URL('/api/v1/warehouse/scrap-boxes', window.location.origin);
  url.searchParams.set('limit', '100');
  if (pageParam) url.searchParams.set('cursor', pageParam);
  if (search) url.searchParams.set('search', search);

  const res = await apiFetch(url.toString());
  if (isApiAuthFailure(res.status, null)) {
    await haltForLoginRedirect();
  }
  return readApiJson(res);
}

function exportScrapCsv(rows: ScrapBoxRow[], fileLabel: string): void {
  const header = [
    'Etiqueta',
    'Codigo',
    'Fecha',
    'Tecnologia',
    'Ubicacion',
    'Marca',
    'Modelo',
    'Cantidad',
    'Capacidad',
    'Estatus',
    'Usuario',
  ];
  const lines = rows.map((r) =>
    [
      r.displayId,
      r.id,
      r.fechaIngreso,
      r.techName,
      r.rack,
      r.marcaLabel,
      r.modeloLabel,
      r.unitCount,
      r.capacity,
      r.status,
      r.usuarioIngreso,
    ]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
      .join(',')
  );
  const blob = new Blob([[header.join(','), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Bodega_SCRAPS_${fileLabel}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function BodegaScrapsPage() {
  const queryClient = useQueryClient();
  const {
    technologies: catTecnologias,
    brands: catMarcas,
    models: catModelos,
  } = useReferenceCatalogs();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(true);
  const [filterTech, setFilterTech] = useState('');
  const [filterModel, setFilterModel] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [inventoryPage, setInventoryPage] = useState(1);
  const [selectedBoxIds, setSelectedBoxIds] = useState<string[]>([]);

  const [detailBox, setDetailBox] = useState<ScrapBoxRow | null>(null);
  const [detailSeries, setDetailSeries] = useState<unknown[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState<ScrapBoxRow | null>(null);
  const [showRackModal, setShowRackModal] = useState<ScrapBoxRow | null>(null);
  const [showBulkRackModal, setShowBulkRackModal] = useState(false);
  const [rackNum, setRackNum] = useState('');
  const [rackNivel, setRackNivel] = useState('');
  const [rackPosicion, setRackPosicion] = useState('');
  const [rackSaving, setRackSaving] = useState(false);

  /** Ingreso caja SCRAPS (mismo flujo que Taller → Scraps). */
  const [showCreateScrapModal, setShowCreateScrapModal] = useState(false);
  const [scrapQueueTasks, setScrapQueueTasks] = useState<any[]>([]);
  const [scrapScannedItems, setScrapScannedItems] = useState<any[]>([]);
  const [scrapScanError, setScrapScanError] = useState('');
  const [scrapBoxStep, setScrapBoxStep] = useState<'crear_caja' | 'despacho'>('crear_caja');
  const [scrapBoxMarca, setScrapBoxMarca] = useState('');
  const [scrapBoxModelo, setScrapBoxModelo] = useState('');
  const [scrapBoxTecnologia, setScrapBoxTecnologia] = useState('');
  const [scrapBoxCantidad, setScrapBoxCantidad] = useState<number | ''>('');
  const [scrapGuideNumber, setScrapGuideNumber] = useState('');
  const [scrapActiveView, setScrapActiveView] = useState<'resumen' | 'pistolero'>('pistolero');
  const [scrapScanSN, setScrapScanSN] = useState('');
  const [scrapNotes, setScrapNotes] = useState('');
  const [scrapDispatching, setScrapDispatching] = useState(false);

  const resetCreateScrapModal = useCallback(() => {
    setShowCreateScrapModal(false);
    setScrapQueueTasks([]);
    setScrapScannedItems([]);
    setScrapScanError('');
    setScrapBoxStep('crear_caja');
    setScrapBoxMarca('');
    setScrapBoxModelo('');
    setScrapBoxTecnologia('');
    setScrapBoxCantidad('');
    setScrapGuideNumber('');
    setScrapActiveView('pistolero');
    setScrapScanSN('');
    setScrapNotes('');
    setScrapDispatching(false);
  }, []);

  const openCreateScrapBox = useCallback(async () => {
    setScrapScannedItems([]);
    setScrapScanError('');
    setScrapBoxStep('crear_caja');
    setScrapBoxMarca('');
    setScrapBoxModelo('');
    setScrapBoxTecnologia('');
    setScrapBoxCantidad('');
    setScrapGuideNumber('');
    setScrapActiveView('pistolero');
    setScrapScanSN('');
    setScrapNotes('');
    setScrapDispatching(false);
    setShowCreateScrapModal(true);

    try {
      const page = await fetchWorkshopTasksPageViaApi('scraps', null, '');
      const adapted = (page.items || []).map((t: any) => {
        const allSns: string[] = t.all_sns?.length
          ? t.all_sns
          : [t.serial_number].filter(Boolean);
        const allDbIds: string[] = t.all_dbIds?.length
          ? t.all_dbIds.map(String)
          : [String(t.id)];
        return {
          id: t.service_orders?.os_label || t.os_label || 'S/OS',
          sn: allSns[0] || t.serial_number || 'S/N',
          all_sns: allSns,
          marca: t.brands?.name || t.brand_name || 'Desconocida',
          modelo: t.models?.name || t.model_name || 'S/N',
          dbId: String(t.id),
          all_dbIds: allDbIds,
        };
      });
      setScrapQueueTasks(adapted);
    } catch {
      setScrapQueueTasks([]);
    }
  }, []);

  const generateConduceNumber = useCallback(() => {
    const now = new Date();
    const year = now.getFullYear();
    const seq = String(Math.floor(Math.random() * 900) + 100);
    const ts =
      String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
    return `CS-SCRAP-${year}-${ts}${seq.slice(-1)}`;
  }, []);

  const openRackEditor = useCallback((item: ScrapBoxRow) => {
    const parsed = parseScrapRackParts(item.rack);
    setRackNum(parsed.rackNum);
    setRackNivel(parsed.rackNivel);
    setRackPosicion(parsed.rackPosicion);
    setShowRackModal(item);
    setShowBulkRackModal(false);
  }, []);

  const openBulkRackEditor = useCallback(() => {
    setRackNum('');
    setRackNivel('');
    setRackPosicion('');
    setShowRackModal(null);
    setShowBulkRackModal(true);
  }, []);

  const openBoxDetail = useCallback(async (row: ScrapBoxRow) => {
    setDetailBox(row);
    setDetailSeries([]);
    setDetailLoading(true);
    const ui = await loadScrapBoxSeries(row.realDbId);
    setDetailSeries(ui);
    setDetailLoading(false);
  }, []);

  const query = useInfiniteQuery({
    queryKey: ['warehouse-scrap-boxes', debouncedSearch],
    queryFn: ({ pageParam }) =>
      fetchScrapPage({ pageParam: pageParam as string | undefined, search: debouncedSearch }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const { refetch: refetchScrapBoxes } = query;
  const refreshScrapLists = useCallback(async () => {
    await refetchScrapBoxes();
  }, [refetchScrapBoxes]);

  /** Parchea rack en cache; el refetch completo corre en background tras cerrar el modal. */
  const patchScrapRackCache = useCallback(
    (boxIds: string[], finalRack: string) => {
      const idSet = new Set(boxIds.map(String));
      queryClient.setQueriesData<{ pages: Array<{ items?: Array<{ box_id?: string; rack?: string }> }> }>(
        { queryKey: ['warehouse-scrap-boxes'] },
        (old) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: (page.items || []).map((item) =>
                idSet.has(String(item.box_id)) ? { ...item, rack: finalRack } : item
              ),
            })),
          };
        }
      );
    },
    [queryClient]
  );

  const inventory = useMemo((): ScrapBoxRow[] => {
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
        rack: b.rack || 'SCRAP',
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

  const process = useScrapProcessFlow({
    inventory,
    onSuccess: refreshScrapLists,
  });

  const techNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of catTecnologias) map.set(t.id, t.name);
    return map;
  }, [catTecnologias]);

  const filteredInventory = useMemo(() => {
    return inventory.filter((row) => {
      if (filterTech) {
        const techLabel = techNameById.get(filterTech) || '';
        if (techLabel && row.techName.toLowerCase() !== techLabel.toLowerCase()) return false;
      }
      if (filterModel) {
        const model = catModelos.find((m) => m.id === filterModel);
        if (model && row.modeloLabel.toLowerCase() !== String(model.name || '').toLowerCase()) {
          return false;
        }
      }
      if (filterStatus === 'Full' && row.status !== 'Full') return false;
      if (filterStatus === 'Partial' && row.status !== 'Parcial') return false;
      return true;
    });
  }, [inventory, filterTech, filterModel, filterStatus, techNameById, catModelos]);

  const totals = useMemo(() => {
    const totalBoxes = filteredInventory.length;
    const totalEquipos = filteredInventory.reduce((sum, b) => sum + b.unitCount, 0);
    const cajasCompletas = filteredInventory.filter((b) => b.status === 'Full').length;
    const cajasParciales = filteredInventory.filter((b) => b.status === 'Parcial').length;
    return { totalBoxes, totalEquipos, cajasCompletas, cajasParciales };
  }, [filteredInventory]);

  const modelsForTech = useMemo(() => {
    if (!filterTech) return [];
    return catModelos.filter((m) => String(m.technology_id || '') === filterTech);
  }, [catModelos, filterTech]);

  const inventoryTotalCount = filteredInventory.length;
  const inventoryTotalPages = Math.max(1, Math.ceil(inventoryTotalCount / PAGE_SIZE));
  const inventorySafePage = Math.min(inventoryPage, inventoryTotalPages);
  const inventoryStartItem =
    inventoryTotalCount === 0 ? 0 : (inventorySafePage - 1) * PAGE_SIZE + 1;
  const inventoryEndItem = Math.min(inventorySafePage * PAGE_SIZE, inventoryTotalCount);
  const pageItems = filteredInventory.slice(
    (inventorySafePage - 1) * PAGE_SIZE,
    inventorySafePage * PAGE_SIZE
  );
  const pageBoxIds = pageItems.map((r) => r.id);

  const toggleBoxSelection = useCallback((id: string) => {
    setSelectedBoxIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const handleExport = useCallback(() => {
    const source =
      selectedBoxIds.length > 0
        ? filteredInventory.filter((r) => selectedBoxIds.includes(r.id))
        : filteredInventory;
    if (source.length === 0) {
      notify.warning('No hay cajas para exportar');
      return;
    }
    exportScrapCsv(source, selectedBoxIds.length > 0 ? 'seleccion' : 'todas');
    notify.success('Reporte exportado', {
      description: `${source.length} caja(s) SCRAPS en CSV`,
    });
  }, [filteredInventory, selectedBoxIds]);

  const handleUpdateRack = useCallback(async () => {
    if (!showRackModal) return;
    setRackSaving(true);
    const supabase = getSupabaseBrowserClient();
    const finalRack = formatScrapRackLocation(rackNum, rackNivel, rackPosicion);
    if (!supabase) {
      notify.error('No se pudo conectar para guardar la ubicación');
      setRackSaving(false);
      return;
    }
    const boxId = String(showRackModal.realDbId);
    const { error } = await supabase
      .from('boxes')
      .update({ rack_location: finalRack })
      .eq('id', boxId);
    if (error) {
      notify.error('Error al actualizar la ubicación', { description: error.message });
      setRackSaving(false);
      return;
    }
    patchScrapRackCache([boxId], finalRack);
    notify.success('Ubicación actualizada', { description: finalRack });
    setShowRackModal(null);
    setRackSaving(false);
    void refreshScrapLists();
  }, [showRackModal, rackNum, rackNivel, rackPosicion, patchScrapRackCache, refreshScrapLists]);

  const handleBulkUpdateRack = useCallback(async () => {
    if (selectedBoxIds.length === 0) return;
    setRackSaving(true);
    const supabase = getSupabaseBrowserClient();
    const finalRack = formatScrapRackLocation(rackNum, rackNivel, rackPosicion);
    if (!supabase) {
      notify.error('No se pudo conectar para guardar la ubicación');
      setRackSaving(false);
      return;
    }
    const realIds = selectedBoxIds.map((id) => {
      const box = inventory.find((b) => b.id === id);
      return String(box ? box.realDbId : id);
    });
    const { error } = await supabase
      .from('boxes')
      .update({ rack_location: finalRack })
      .in('id', realIds);
    if (error) {
      notify.error('Error al actualizar ubicaciones', { description: error.message });
      setRackSaving(false);
      return;
    }
    patchScrapRackCache(realIds, finalRack);
    notify.success('Ubicación asignada', {
      description: `${selectedBoxIds.length} caja(s) → ${finalRack}`,
    });
    setSelectedBoxIds([]);
    setShowBulkRackModal(false);
    setRackSaving(false);
    void refreshScrapLists();
  }, [selectedBoxIds, rackNum, rackNivel, rackPosicion, inventory, patchScrapRackCache, refreshScrapLists]);

  const columns = useMemo((): DataTableColumn<ScrapBoxRow>[] => {
    return [
      {
        id: 'select',
        header: (
          <input
            type="checkbox"
            className="h-4 w-4 cursor-pointer accent-[#2ec4f1]"
            checked={pageBoxIds.length > 0 && pageBoxIds.every((id) => selectedBoxIds.includes(id))}
            onChange={(e) => {
              const checked = e.target.checked;
              setSelectedBoxIds((prev) =>
                checked
                  ? Array.from(new Set([...prev, ...pageBoxIds]))
                  : prev.filter((id) => !pageBoxIds.includes(id))
              );
            }}
            title="Seleccionar todas las cajas de esta página"
          />
        ),
        width: '44px',
        cell: (item) => (
          <input
            type="checkbox"
            className="h-4 w-4 cursor-pointer accent-[#2ec4f1]"
            checked={selectedBoxIds.includes(item.id)}
            onClick={(e) => e.stopPropagation()}
            onChange={() => toggleBoxSelection(item.id)}
          />
        ),
      },
      {
        id: 'id',
        header: 'ID Caja',
        width: '150px',
        cell: (item) => (
          <div className="flex min-w-0 w-full items-center gap-1.5">
            <span
              className="truncate font-mono text-[11px] font-bold text-[var(--heading)]"
              title={item.isLegacyBoxCode ? item.displayIdFull : item.displayId}
            >
              {item.displayId}
            </span>
            {item.isLegacyBoxCode && (
              <span className="shrink-0 rounded border border-warning/40 bg-warning/15 px-1 py-0.5 text-[7px] font-bold tracking-wide text-warning uppercase">
                LEGACY
              </span>
            )}
            <span className="shrink-0 rounded bg-rose-600 px-1.5 py-0.5 text-[7px] font-bold tracking-wide text-white uppercase">
              SCRAP
            </span>
          </div>
        ),
      },
      {
        id: 'fechaIngreso',
        header: 'Fecha Ingreso',
        width: '128px',
        cellClassName: 'text-[10px] font-semibold text-[var(--foreground)]',
        cell: (item) => (
          <span className="truncate whitespace-nowrap" title={item.fechaIngreso}>
            {item.fechaIngreso}
          </span>
        ),
      },
      {
        id: 'tecnologia',
        header: 'Tecnología',
        width: '72px',
        cellClassName: 'text-[10px] font-semibold text-[var(--accent)]',
        cell: (item) => (
          <span className="truncate whitespace-nowrap" title={item.techName}>
            {item.techName}
          </span>
        ),
      },
      {
        id: 'usuario',
        header: 'Usuario Ingreso',
        width: '140px',
        cellClassName: 'text-[10px] font-semibold text-[var(--foreground)]',
        cell: (item) => {
          const name = (item.usuarioIngreso || 'Sin registro').split('@')[0];
          return (
            <span className="block truncate whitespace-nowrap" title={name}>
              {name}
            </span>
          );
        },
      },
      {
        id: 'ubicacion',
        header: 'Ubicación',
        width: '168px',
        cell: (item) => {
          const parsed = parseScrapRackParts(item.rack);
          return (
            <div
              className="group/loc flex min-w-0 w-full cursor-pointer items-center gap-1.5"
              onClick={(e) => {
                e.stopPropagation();
                openRackEditor(item);
              }}
              title="Cambiar ubicación · Bodega SCRAPS"
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-rose-500 transition-colors group-hover/loc:text-[var(--warning)]" />
              {!parsed.hasDetail ? (
                <span className="truncate rounded-md border border-rose-200/70 bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200">
                  {parsed.displayParts[0] || 'SCRAP'}
                </span>
              ) : (
                <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                  {parsed.displayParts.map((p, idx) => (
                    <span
                      key={`${p}-${idx}`}
                      className={`max-w-[72px] shrink-0 truncate rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${
                        idx === 0
                          ? 'border-rose-200/70 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200'
                          : 'border-[var(--border)] text-[var(--foreground)]'
                      }`}
                      style={idx === 0 ? undefined : { backgroundColor: 'var(--surface-hover)' }}
                      title={p}
                    >
                      {p}
                    </span>
                  ))}
                </div>
              )}
              <Pencil className="h-3 w-3 shrink-0 text-[var(--muted)] opacity-0 transition-opacity group-hover/loc:opacity-100" />
            </div>
          );
        },
      },
      {
        id: 'marcaModelo',
        header: 'Marca / Modelo',
        width: '160px',
        cell: (item) => {
          const label = [item.marcaLabel, item.modeloLabel].filter(Boolean).join(' ') || '---';
          return (
            <span
              className="block truncate whitespace-nowrap text-[11px] font-semibold text-[var(--foreground)]"
              title={label}
            >
              {label}
            </span>
          );
        },
      },
      {
        id: 'cantidad',
        header: 'Cantidad',
        width: '110px',
        cell: (item) => (
          <div className="flex min-w-0 items-center gap-1.5">
            <div
              className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full"
              style={{ backgroundColor: 'var(--surface-hover)' }}
            >
              <div
                className="h-full"
                style={{
                  width: `${Math.min((item.unitCount / Math.max(item.capacity || 1, 1)) * 100, 100)}%`,
                  backgroundColor: item.status === 'Full' ? 'var(--accent)' : 'var(--warning)',
                }}
              />
            </div>
            <span className="whitespace-nowrap text-[10px] font-semibold text-[var(--foreground)]">
              {item.unitCount}
              {item.capacity ? ` / ${item.capacity}` : ''}
            </span>
          </div>
        ),
      },
      {
        id: 'estatus',
        header: 'Estatus',
        width: '88px',
        cell: (item) => (
          <Badge variant={item.status === 'Full' ? 'green' : item.status === 'Parcial' ? 'yellow' : 'default'}>
            {item.status}
          </Badge>
        ),
      },
      {
        id: 'acciones',
        header: 'Acciones',
        width: 'minmax(168px, 1fr)',
        align: 'right',
        sticky: 'end',
        headerClassName: 'justify-end pr-3',
        cellClassName: 'justify-end pr-3 pl-1',
        cell: (item) => (
          <div className="ml-auto flex w-full items-center justify-end gap-1.5">
            <button
              type="button"
              className="p-1 text-[var(--muted)] transition-all hover:scale-110 hover:text-[var(--accent)]"
              title="Detalle inventario"
              onClick={(e) => {
                e.stopPropagation();
                void openBoxDetail(item);
              }}
            >
              <Eye size={18} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="p-1 text-[var(--muted)] transition-all hover:scale-110 hover:text-[var(--foreground)]"
              title="Imprimir etiqueta"
              onClick={(e) => {
                e.stopPropagation();
                setShowPrintModal(item);
              }}
            >
              <Printer size={18} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="p-1 text-[var(--muted)] transition-all hover:scale-110 hover:text-[var(--success)]"
              title="Despachar de inventario"
              onClick={(e) => {
                e.stopPropagation();
                void process.openDispatchFlow(item, 'despacho');
              }}
            >
              <Truck size={18} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="p-1 text-[var(--muted)] transition-all hover:scale-110 hover:text-[var(--warning)]"
              title="Transferir a otra bodega"
              onClick={(e) => {
                e.stopPropagation();
                process.openTransferFlow(item);
              }}
            >
              <ArrowLeftRight size={18} strokeWidth={2} />
            </button>
          </div>
        ),
      },
    ];
  }, [pageBoxIds, selectedBoxIds, toggleBoxSelection, openBoxDetail, openRackEditor, process.openDispatchFlow, process.openTransferFlow]);

  return (
    <ModulePage
      title="Bodega SCRAPS"
      subtitle="Inventario físico de cajas SCRAP. Etiqueta independiente BOX-BAD-001… (no comparte BOX-N de Bodega Central)."
      category="Bodega"
      backHref="/bodega/gestion"
      actions={
        <div className="flex flex-wrap gap-3">
          <Link href="/bodega/gestion" className="inline-flex">
            <Button variant="outline" leftIcon={<Warehouse className="h-4 w-4" />}>
              Bodega Central
            </Button>
          </Link>
          <Link href="/bodega/scraps/inventario" className="inline-flex">
            <Button variant="outline" leftIcon={<Search className="h-4 w-4" />}>
              Detalle de Inventario SCRAPS
            </Button>
          </Link>
          <Link href="/produccion/taller" className="inline-flex">
            <Button variant="outline" leftIcon={<Wrench className="h-4 w-4" />}>
              Ir a Taller
            </Button>
          </Link>
          <Button
            variant="primary"
            leftIcon={<PackageCheck className="h-4 w-4" />}
            onClick={() => void openCreateScrapBox()}
          >
            Crear Caja Bodega SCRAPS
          </Button>
        </div>
      }
    >
      <div className="space-y-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-l-4 border-l-heading" padding="md">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-surface-hover p-3">
                <Box className="h-6 w-6 text-heading" />
              </div>
              <div>
                <p className="text-[10px] font-semibold tracking-wide text-[var(--muted)] uppercase">
                  Total Cajas
                </p>
                <h3 className="text-2xl font-bold text-[var(--heading)]">
                  {totals.totalBoxes.toLocaleString()}
                </h3>
              </div>
            </div>
          </Card>
          <Card className="border-l-4 border-l-accent" padding="md">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-accent/10 p-3">
                <QrCode className="h-6 w-6 text-accent" />
              </div>
              <div>
                <p className="text-[10px] font-semibold tracking-wide text-[var(--muted)] uppercase">
                  Total Equipos TC
                </p>
                <h3 className="text-2xl font-bold text-[var(--heading)]">
                  {totals.totalEquipos.toLocaleString()}
                </h3>
                <p className="text-[9px] font-semibold text-[var(--muted)]">Por OS (no series S1–S4)</p>
              </div>
            </div>
          </Card>
          <Card className="border-l-4 border-l-success" padding="md">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-success/10 p-3">
                <PackageCheck className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-[10px] font-semibold tracking-wide text-[var(--muted)] uppercase">
                  Cajas Completas
                </p>
                <h3 className="text-2xl font-bold text-[var(--heading)]">
                  {totals.cajasCompletas.toLocaleString()}
                </h3>
              </div>
            </div>
          </Card>
          <Card
            className={`cursor-pointer border-l-4 border-l-warning transition-all hover:shadow-md ${
              filterStatus === 'Partial' ? 'bg-warning/10 ring-2 ring-warning/40' : ''
            }`}
            padding="md"
            role="button"
            tabIndex={0}
            onClick={() => {
              setFilterStatus((prev) => (prev === 'Partial' ? '' : 'Partial'));
              setInventoryPage(1);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setFilterStatus((prev) => (prev === 'Partial' ? '' : 'Partial'));
                setInventoryPage(1);
              }
            }}
            title="Filtrar cajas parciales"
          >
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-warning/10 p-3">
                <TrendingUp className="h-6 w-6 text-warning" />
              </div>
              <div>
                <p className="text-[10px] font-semibold tracking-wide text-[var(--muted)] uppercase">
                  Cajas en Proceso
                </p>
                <h3 className="text-2xl font-bold text-[var(--heading)]">
                  {totals.cajasParciales.toLocaleString()}
                </h3>
                <p className="mt-0.5 text-[9px] font-semibold text-[var(--warning)]">
                  Clic para filtrar parciales
                </p>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <ModuleToolbar
            searchValue={search}
            onSearch={(val) => {
              setSearch(val);
              setInventoryPage(1);
            }}
            searchPlaceholder="Buscar caja, serie u OS…"
            onExport={handleExport}
            onAdd={() => void openCreateScrapBox()}
            addLabel="Crear Caja Bodega SCRAPS"
            onFilter={() => setShowAdvancedFilters(!showAdvancedFilters)}
            filters={
              showAdvancedFilters && (
                <div className="flex flex-wrap gap-2 animate-in fade-in zoom-in duration-200">
                  <select
                    value={filterTech}
                    onChange={(e) => {
                      setFilterTech(e.target.value);
                      setFilterModel('');
                      setInventoryPage(1);
                    }}
                    className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-accent"
                  >
                    <option value="">Todas las Tecnologías</option>
                    {catTecnologias.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filterModel}
                    onChange={(e) => {
                      setFilterModel(e.target.value);
                      setInventoryPage(1);
                    }}
                    disabled={!filterTech}
                    title={!filterTech ? 'Primero elija una tecnología' : 'Filtrar por modelo'}
                    className="h-10 min-w-[10rem] rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">{!filterTech ? 'Elija tecnología…' : 'Todos los modelos'}</option>
                    {modelsForTech.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filterStatus}
                    onChange={(e) => {
                      setFilterStatus(e.target.value);
                      setInventoryPage(1);
                    }}
                    className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-accent"
                  >
                    <option value="">Todos los Estatus</option>
                    <option value="Full">Cajas Completas</option>
                    <option value="Partial">Cajas Parciales</option>
                  </select>
                </div>
              )
            }
          />

          {selectedBoxIds.length > 0 && (
            <div className="flex flex-col items-stretch justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-hover)] p-4 text-[var(--foreground)] shadow-xl animate-in fade-in slide-in-from-top-2 duration-200 sm:flex-row sm:items-center">
              <span className="self-center text-sm font-bold sm:ml-2">
                {selectedBoxIds.length}{' '}
                {selectedBoxIds.length === 1 ? 'caja seleccionada' : 'cajas seleccionadas'}
              </span>
              <div className="flex flex-col items-stretch gap-3 sm:flex-row">
                <Button
                  variant="primary"
                  className="text-[10px] font-black tracking-widest uppercase"
                  leftIcon={<MapPin className="h-3.5 w-3.5" />}
                  onClick={openBulkRackEditor}
                >
                  Asignar Ubicación Masiva
                </Button>
                <Button
                  variant="outline"
                  className="text-[10px] font-black tracking-widest uppercase"
                  leftIcon={<Truck className="h-3.5 w-3.5" />}
                  onClick={() => {
                    const first = filteredInventory.find((r) => selectedBoxIds.includes(r.id));
                    if (first) void process.openDispatchFlow(first, 'despacho');
                    else notify.warning('Seleccione al menos una caja');
                  }}
                >
                  Despachar
                </Button>
                <Button
                  variant="outline"
                  className="text-[10px] font-black tracking-widest uppercase"
                  leftIcon={<ArrowLeftRight className="h-3.5 w-3.5" />}
                  onClick={() => {
                    process.setSelectedBoxesForTransfer([...selectedBoxIds]);
                    process.setShowTransferModal(true);
                  }}
                >
                  Transferir
                </Button>
                <Button
                  variant="outline"
                  className="text-[10px] font-black tracking-widest uppercase"
                  onClick={handleExport}
                >
                  Exportar selección
                </Button>
                <Button
                  variant="outline"
                  className="text-[10px] font-black tracking-widest uppercase"
                  onClick={() => setSelectedBoxIds([])}
                >
                  Limpiar selección
                </Button>
              </div>
            </div>
          )}

          <Card padding="none" className="overflow-hidden border-2 border-border shadow-sm">
            <DataTable
              columns={columns}
              data={pageItems}
              getRowId={(item) => item.realDbId}
              onRowClick={(item) => void openBoxDetail(item)}
              rowHeight={44}
              compact
              maxBodyHeight={720}
              minWidth={1100}
              headerClassName="border-b border-[var(--sidebar)] bg-[var(--sidebar)]"
              headerTextClassName="text-[var(--sidebar-foreground)]/80"
              rowClassName={() => 'cursor-pointer hover:bg-[var(--surface-hover)]/80'}
              emptyMessage={query.isLoading ? 'Cargando…' : 'Sin cajas en Bodega SCRAPS'}
            />
            <TablePagination
              totalCount={inventoryTotalCount}
              page={inventorySafePage}
              totalPages={inventoryTotalPages}
              startItem={inventoryStartItem}
              endItem={inventoryEndItem}
              pageSize={PAGE_SIZE}
              onPageChange={setInventoryPage}
              itemLabel={query.hasNextPage ? 'cajas (cargadas)' : 'cajas'}
            />
            {query.hasNextPage && (
              <div className="flex flex-col items-center gap-2 border-t border-slate-100 bg-slate-50/30 px-4 pb-4">
                <Button
                  variant="outline"
                  onClick={() => void query.fetchNextPage()}
                  disabled={query.isFetchingNextPage}
                >
                  {query.isFetchingNextPage ? 'Cargando más…' : 'Cargar más cajas del servidor'}
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>

      {detailBox && (
        <ScrapBoxDetailDrawer
          box={detailBox}
          loading={detailLoading}
          seriesRows={detailSeries}
          onClose={() => setDetailBox(null)}
        />
      )}

      {showPrintModal && (
        <PrintBoxModal
          box={{ id: showPrintModal.displayId }}
          onClose={() => setShowPrintModal(null)}
          onPrint={(mode) => {
            const box = showPrintModal;
            void (async () => {
              const series =
                detailBox?.realDbId === box.realDbId
                  ? (detailSeries as Array<{
                      s1?: string;
                      s2?: string;
                      s3?: string;
                      s4?: string;
                      material?: string;
                      lote?: string;
                    }>)
                  : await loadScrapBoxSeries(box.realDbId);
              printScrapBoxLabel(
                {
                  id: box.displayId,
                  marca: box.marcaLabel,
                  modelo: box.modeloLabel,
                  tecnologia: box.techName,
                  cantidad: box.unitCount,
                  fechaIngreso: box.fechaIngreso,
                  series: series.map((s) => ({
                    s1: s.s1,
                    s2: s.s2,
                    s3: s.s3,
                    s4: s.s4,
                    material: s.material,
                    lote: s.lote,
                  })),
                },
                mode
              );
              setShowPrintModal(null);
            })();
          }}
        />
      )}

      {process.showDispatchModal && (
        <DispatchModal
          box={process.showDispatchModal}
          dispatchMode={process.dispatchMode}
          setDispatchMode={process.setDispatchMode}
          loadingSeries={process.loadingDispatchSeries}
          useOutboundDispatchHex={process.useOutboundDispatchHex}
          selectedDispatchBatchId={null}
          selectedDispatchBatchNumber={null}
          dispatchAction={process.dispatchAction}
          setDispatchAction={process.setDispatchAction}
          selectedSeriesForDispatch={process.selectedSeriesForDispatch}
          setSelectedSeriesForDispatch={process.setSelectedSeriesForDispatch}
          dispatchDestination={process.dispatchDestination}
          dispatchNotes={process.dispatchNotes}
          setDispatchNotes={process.setDispatchNotes}
          dispatchArea={process.dispatchArea}
          setDispatchArea={process.setDispatchArea}
          isDispatching={process.isDispatching}
          onClose={process.resetDispatch}
          onConfirm={() =>
            void process.handleDispatchBox(
              process.showDispatchModal!.id,
              process.showDispatchModal!.realDbId
            )
          }
        />
      )}

      {process.showTransferModal && (
        <TransferModal
          inventory={process.transferInventory}
          catMarcas={catMarcas}
          catModelos={catModelos}
          selectedBoxesForTransfer={process.selectedBoxesForTransfer}
          setSelectedBoxesForTransfer={process.setSelectedBoxesForTransfer}
          transferScanInput={process.transferScanInput}
          setTransferScanInput={process.setTransferScanInput}
          destinationArea={process.destinationArea}
          setDestinationArea={process.setDestinationArea}
          onScanSubmit={process.handleScanForTransfer}
          onExecute={() => void process.handleExecuteTransfer()}
          onClose={() => process.setShowTransferModal(false)}
          executing={process.transferExecuting}
        />
      )}

      {showCreateScrapModal && (
        <ScrapDispatchModal
          filteredTasks={scrapQueueTasks}
          catMarcas={catMarcas}
          catModelos={catModelos}
          catTecnologias={catTecnologias}
          scrapScannedItems={scrapScannedItems}
          setScrapScannedItems={setScrapScannedItems}
          scrapScanError={scrapScanError}
          setScrapScanError={setScrapScanError}
          scrapBoxStep={scrapBoxStep}
          setScrapBoxStep={setScrapBoxStep}
          scrapBoxMarca={scrapBoxMarca}
          setScrapBoxMarca={setScrapBoxMarca}
          scrapBoxModelo={scrapBoxModelo}
          setScrapBoxModelo={setScrapBoxModelo}
          scrapBoxTecnologia={scrapBoxTecnologia}
          setScrapBoxTecnologia={setScrapBoxTecnologia}
          scrapBoxCantidad={scrapBoxCantidad}
          setScrapBoxCantidad={setScrapBoxCantidad}
          scrapGuideNumber={scrapGuideNumber}
          setScrapGuideNumber={setScrapGuideNumber}
          scrapActiveView={scrapActiveView}
          setScrapActiveView={setScrapActiveView}
          scrapScanSN={scrapScanSN}
          setScrapScanSN={setScrapScanSN}
          scrapNotes={scrapNotes}
          setScrapNotes={setScrapNotes}
          scrapDispatching={scrapDispatching}
          setScrapDispatching={setScrapDispatching}
          generateConduceNumber={generateConduceNumber}
          fetchTasks={() => {
            void refreshScrapLists();
            void fetchWorkshopTasksPageViaApi('scraps', null, '')
              .then((page) => {
                const adapted = (page.items || []).map((t: any) => {
                  const allSns: string[] = t.all_sns?.length
                    ? t.all_sns
                    : [t.serial_number].filter(Boolean);
                  const allDbIds: string[] = t.all_dbIds?.length
                    ? t.all_dbIds.map(String)
                    : [String(t.id)];
                  return {
                    id: t.service_orders?.os_label || t.os_label || 'S/OS',
                    sn: allSns[0] || t.serial_number || 'S/N',
                    all_sns: allSns,
                    marca: t.brands?.name || t.brand_name || 'Desconocida',
                    modelo: t.models?.name || t.model_name || 'S/N',
                    dbId: String(t.id),
                    all_dbIds: allDbIds,
                  };
                });
                setScrapQueueTasks(adapted);
              })
              .catch(() => undefined);
          }}
          onClose={resetCreateScrapModal}
        />
      )}

      {showRackModal && (
        <RackModal
          box={{ id: showRackModal.displayId }}
          rackNum={rackNum}
          setRackNum={setRackNum}
          rackNivel={rackNivel}
          setRackNivel={setRackNivel}
          rackPosicion={rackPosicion}
          setRackPosicion={setRackPosicion}
          loading={rackSaving}
          onClose={() => setShowRackModal(null)}
          onSave={() => void handleUpdateRack()}
        />
      )}

      {showBulkRackModal && (
        <RackModal
          box={{ id: `${selectedBoxIds.length} cajas` }}
          count={selectedBoxIds.length}
          rackNum={rackNum}
          setRackNum={setRackNum}
          rackNivel={rackNivel}
          setRackNivel={setRackNivel}
          rackPosicion={rackPosicion}
          setRackPosicion={setRackPosicion}
          loading={rackSaving}
          onClose={() => setShowBulkRackModal(false)}
          onSave={() => void handleBulkUpdateRack()}
        />
      )}
    </ModulePage>
  );
}
