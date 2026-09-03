"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback, startTransition } from 'react';
import { Card, Badge, Button, DataTable, TablePagination, type DataTableColumn, notify, confirmDialog } from '@/components/ui';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { sapValidationReader } from '@/modules/sap-integration';
import { ModulePage, ModuleToolbar } from '@/components/module-page';
import { 
  Box, 
  Search, 
  MapPin, 
  ArrowLeftRight, 
  History, 
  MoreHorizontal,
  PackageCheck,
  TrendingUp,
  AlertCircle,
  Trash2,
  QrCode,
  ArrowRight,
  Plus,
  Info,
  Calendar,
  Warehouse,
  Loader2,
  Eye,
  Pencil,
  Printer,
  CheckCircle2,
  Cpu,
  Clock,
  X,
  Truck,
  PackageMinus,
} from 'lucide-react';
import { getInventoryBoxes, transferBoxesToArea, transferBoxesToAreaInBatches, startOrAppendBodegaScan, finalizeBodegaScan, listInProgressBodegaBoxes, requestBoxDeletion, addSeriesToBox, dispatchBoxFromWarehouse, dispatchSpecificSeries, transferSpecificSeriesToArea, canScanSeriesIntoWarehouse, resolveBoxDisplayStatus, resolveBoxListCapacity, isWarehouseScanInProgress, getBoxHistory, expandSelectedSeriesForOs } from '@/modules/inventario/client/warehouseBoxes';
import { isBodegaOperationalRack } from '@/lib/database/warehouse';
import { DispatchBatchSelector } from '@/modules/outbound-dispatch/components/DispatchBatchSelector';
import { isHexagonalOutboundDispatchEnabled } from '@/modules/outbound-dispatch';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { apiFetch, haltForLoginRedirect, isApiAuthFailure, readApiJson } from '@/lib/http/apiFetch';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useReferenceCatalogs } from '@/hooks/useReferenceCatalogs';
import { useAuthz } from '@/components/authz/AuthzProvider';
import { PrintBoxModal } from './components/PrintBoxModal';
import { RackModal } from './components/RackModal';
import { TimelineModal } from './components/TimelineModal';
import { DispatchModal } from './components/DispatchModal';
import { TransferModal } from './components/TransferModal';
import { NewBoxModal } from './components/NewBoxModal';
import { DetalleCajaModal } from './components/DetalleCajaModal';
import { DeleteBoxAuthorizationModal } from './components/DeleteBoxAuthorizationModal';
import { BoxDeletionApprovalsPanel } from './components/BoxDeletionApprovalsPanel';
import { fetchBoxSeriesUi } from '@/modules/inventario/client/warehouseBoxSeries';
import { formatWarehouseBoxId } from '@/modules/inventario/client/warehouseBoxDisplay';
import { RECEPTION_TIMELINE_SELECT } from '@/shared/constants/dbProjections';
import {
  catalogLabelKey,
  normalizeCatalogLabel,
} from '@/shared/catalogs/normalizeCatalogName';
import {
  prepareScannedSerial,
  validateSerialForModelAnySlot,
} from '@/shared/validation/serialDigitRules';

function isWarehouseSummaryMissingError(message: unknown): boolean {
  const text = String(message ?? '');
  return text.includes('warehouse_box_summary') && text.includes('schema cache');
}

const BODEGA_GESTION_PAGE_SIZE = 25;

export default function BodegaGestionV2({
  onRequireMigration,
}: {
  onRequireMigration?: () => void;
}) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { isAdmin } = useAuthz();
  const {
    technologies: catTecnologias,
    brands: catMarcas,
    models: catModelos,
    techName,
    brandName,
    modelName,
    techNameForModel,
    techIdByModelId,
    isReady: catalogsReady,
  } = useReferenceCatalogs();
  const boxSeriesCache = useRef(new Map<string, any[]>());
  const inventoryListRef = useRef<HTMLDivElement | null>(null);
  const autoOpenedPartialRef = useRef(false);
  const [searchTerm, setSearchTerm] = useState('');
  // C5: filtrado de inventario sobre término debounced (input fluido).
  const debouncedSearch = useDebouncedValue(searchTerm, 250);
  const [showNewBoxModal, setShowNewBoxModal] = useState(false);
  const [selectedBox, setSelectedBox] = useState<any | null>(null);
  const [loadingBoxDetail, setLoadingBoxDetail] = useState(false);
  const [loading, setLoading] = useState(false);
  // Advanced Filters State (antes del query para poder filtrar en servidor)
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(true);
  const [filterTech, setFilterTech] = useState('');
  const [filterModel, setFilterModel] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [inventoryPage, setInventoryPage] = useState(1);
  const fillStatusParam =
    filterStatus === 'Partial' ? 'partial' : filterStatus === 'Full' ? 'full' : undefined;
  const {
    data: boxesData, 
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage, 
    isLoading: isBoxesLoading,
    refetch 
  } = useInfiniteQuery({
    queryKey: [
      'warehouse-boxes',
      debouncedSearch,
      fillStatusParam ?? 'all',
      filterTech || 'all-tech',
      filterModel || 'all-models',
    ],
    queryFn: async ({ pageParam }) => {
      const url = new URL('/api/v1/warehouse/boxes', window.location.origin);
      if (pageParam) url.searchParams.set('cursor', pageParam as string);
      url.searchParams.set('limit', '30');
      if (debouncedSearch) url.searchParams.set('search', debouncedSearch);
      if (fillStatusParam) url.searchParams.set('fillStatus', fillStatusParam);
      if (filterTech) url.searchParams.set('technologyId', filterTech);
      if (filterModel) url.searchParams.set('modelId', filterModel);

      const res = await apiFetch(url.toString());
      if (isApiAuthFailure(res.status, null)) {
        await haltForLoginRedirect();
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        if (isApiAuthFailure(res.status, data)) {
          await haltForLoginRedirect();
        }
        const errMsg = String(data.error || 'Fetch failed');
        if (isWarehouseSummaryMissingError(errMsg)) {
          onRequireMigration?.();
        }
        notify.error('API Error', { description: errMsg });
        throw new Error(errMsg);
      }
      return data;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage?.nextCursor || null,
    retry: 1,
  });

  const refreshWarehouseLists = useCallback(async () => {
    boxSeriesCache.current.clear();
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ queryKey: ['warehouse-stats'] }),
    ]);
  }, [queryClient, refetch]);

  const ensureBoxSeriesLoaded = useCallback(
    async (box: { realDbId: string; id?: string }) => {
      const boxId = box.realDbId || box.id;
      if (!boxId) return [] as any[];
      const cached = boxSeriesCache.current.get(boxId);
      if (cached) return cached;
      const series = await fetchBoxSeriesUi(boxId);
      boxSeriesCache.current.set(boxId, series);
      return series;
    },
    []
  );

  const openBoxDetail = useCallback(
    async (item: any) => {
      setSelectedBox({ ...item, series: [] });
      setLoadingBoxDetail(true);
      try {
        const boxDbId = item.realDbId || item.id;
        let capacity = Number(item.cantidad || item.capacity || 0);
        // Capacity fresca de BD (tras salida parcial puede haber bajado 60→59).
        const supabase = getSupabaseBrowserClient();
        if (supabase && boxDbId) {
          const { data: boxRow } = await supabase
            .from('boxes')
            .select('capacity')
            .eq('id', boxDbId)
            .maybeSingle();
          if (boxRow?.capacity != null && Number(boxRow.capacity) > 0) {
            capacity = Number(boxRow.capacity);
          }
        }
        const series = await ensureBoxSeriesLoaded(item);
        const equipos = series.length
          ? new Set(series.map((s: any) => s.service_orders?.id || s.ordenServicio || s.sn || s.serial_number)).size
          : Number(item.unitCount || 0);
        const cap = capacity > 0 ? capacity : Math.max(equipos, 1);
        setSelectedBox({
          ...item,
          cantidad: cap,
          series,
          unitCount: equipos,
          status: resolveBoxDisplayStatus(equipos, cap),
        });
      } catch (err) {
        console.error(err);
        notify.error('No se pudo cargar el detalle de la caja');
        setSelectedBox(null);
      } finally {
        setLoadingBoxDetail(false);
      }
    },
    [ensureBoxSeriesLoaded]
  );

  const openDispatchFlow = useCallback(
    async (item: any, mode: 'all' | 'specific' = 'all') => {
      setDispatchMode(mode);
      setDispatchAction('despacho');
      setSelectedSeriesForDispatch([]);
      setShowDispatchModal({ ...item, series: [] });
      setDispatchDestination('Calculando...');
      setLoadingDispatchSeries(true);

      try {
        const boxId = item.realDbId || item.id;
        // Evitar cache vacío previo (RLS / auth fallida) al reabrir despacho.
        if (boxId) boxSeriesCache.current.delete(boxId);
        const series = await ensureBoxSeriesLoaded(item);
        const equipos = series.length
          ? new Set(
              series.map(
                (s: any) => s.service_orders?.id || s.ordenServicio || s.sn || s.serial_number
              )
            ).size
          : Number(item.unitCount || 0);
        setShowDispatchModal({
          ...item,
          series,
          unitCount: equipos || Number(item.unitCount || 0),
        });

        if (series.length === 0 && Number(item.unitCount || 0) > 0) {
          notify.warning('Series no cargadas', {
            description:
              'El conteo de la caja existe pero no se leyeron series. Prueba «Toda la caja» o reabre el modal.',
          });
        }

        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          const { data } = await supabase
            .from('dispatches')
            .select('guide_number')
            .like('guide_number', 'TC-INV-%');

          let nextId = 100;
          if (data && data.length > 0) {
            let max = 99;
            data.forEach((d: { guide_number: string }) => {
              const num = parseInt(d.guide_number.replace('TC-INV-', ''), 10);
              if (!isNaN(num) && num > max) max = num;
            });
            nextId = max + 1;
          }
          setDispatchDestination(`TC-INV-${String(nextId).padStart(3, '0')}`);
        } else {
          setDispatchDestination('TC-INV-100');
        }
      } catch (err) {
        console.error(err);
        notify.error('No se pudieron cargar las series para despacho');
        setShowDispatchModal(null);
      } finally {
        setLoadingDispatchSeries(false);
      }
    },
    [ensureBoxSeriesLoaded]
  );

  const inventory = useMemo(() => {
    const rows = (boxesData?.pages || []).flatMap(p => p.items || []).map((b: any) => {
       const boxCode = b.label || '';
       const boxIdFmt = formatWarehouseBoxId(boxCode, b.box_id);
       const tecnologiaId = b.technology_id ?? (b.sample_model_id ? techIdByModelId.get(b.sample_model_id) : undefined);

         const equipos = Number(b.equipos_count ?? b.series_count ?? 0);
         const declaredCap = Number(b.capacity || 0);
         const inProgress = isWarehouseScanInProgress(b.rack, boxCode);
         const displayCap = resolveBoxListCapacity(equipos, declaredCap, { inProgress });
         return {
         id: boxCode || b.box_id,
         displayId: boxIdFmt.primary,
         displayIdFull: boxIdFmt.full,
         isLegacyBoxCode: boxIdFmt.isLegacy,
         realDbId: b.box_id,
         box_code: boxCode,
         rack: b.rack || 'SIN RACK',
         area: 'Bodega Central',
         marca: b.sample_brand_id || 'N/A',
         modelo: b.sample_model_id || 'N/A',
         marcaLabel: b.brand_name || brandName(b.sample_brand_id),
         modeloLabel: b.model_name || modelName(b.sample_model_id),
         cantidad: displayCap,
         unitCount: equipos,
         seriesRows: Number(b.series_count || 0),
         status: (() => {
           if (String(b.deletion_status || '') === 'pending_approval') return 'Pendiente Aprobación';
           // Stock en BODEGA_CENTRAL / P-01 = cerrado → Full; Parcial solo TMP/EN_PROCESO.
           if (inProgress) return resolveBoxDisplayStatus(equipos, displayCap);
           if (equipos > 0) return 'Full';
           return resolveBoxDisplayStatus(equipos, displayCap);
         })(),
         deletionStatus: b.deletion_status || null,
         usuarioIngreso: b.ingreso_user_name || 'Sin registro',
         series: [] as any[],
         createdAt: b.created_at || null,
         fechaIngreso: new Date(b.created_at || Date.now()).toLocaleString('es-GT', {
           day: '2-digit',
           month: '2-digit',
           year: 'numeric',
           hour: '2-digit',
           minute: '2-digit',
         }),
         tecnologiaId,
         tecnologia: b.tech_name || techNameForModel(b.sample_model_id),
       };
    });

    // Fecha Ingreso: más reciente → más lejana
    return rows.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return String(b.realDbId || '').localeCompare(String(a.realDbId || ''));
    });
  }, [boxesData, techIdByModelId, techNameForModel, brandName, modelName]);
  const [showTimeline, setShowTimeline] = useState<any>(null);
  const [timelineGuideDetails, setTimelineGuideDetails] = useState<any>(null);
  const [boxHistoryData, setBoxHistoryData] = useState<any[]>([]);
  const [loadingBoxHistory, setLoadingBoxHistory] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState<any | null>(null);
  const [showRackModal, setShowRackModal] = useState<any | null>(null);
  const [rackNum, setRackNum] = useState('');
  const [rackNivel, setRackNivel] = useState('');
  const [rackPosicion, setRackPosicion] = useState('');
  const [showDispatchModal, setShowDispatchModal] = useState<any | null>(null);
  const [loadingDispatchSeries, setLoadingDispatchSeries] = useState(false);
  const [dispatchDestination, setDispatchDestination] = useState('');
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchMode, setDispatchMode] = useState<'all'|'specific'>('all');
  const [dispatchAction, setDispatchAction] = useState<'despacho'|'traslado'>('despacho');
  const [dispatchArea, setDispatchArea] = useState('Diagnóstico');
  const [selectedSeriesForDispatch, setSelectedSeriesForDispatch] = useState<string[]>([]);
  const [selectedDispatchBatchId, setSelectedDispatchBatchId] = useState<string | null>(null);
  const [selectedDispatchBatchNumber, setSelectedDispatchBatchNumber] = useState<string | null>(null);
  const useOutboundDispatchHex = isHexagonalOutboundDispatchEnabled();

  // Selección múltiple de cajas (para ubicación masiva)
  const [selectedBoxIds, setSelectedBoxIds] = useState<string[]>([]);
  const [showBulkRackModal, setShowBulkRackModal] = useState(false);

  const toggleBoxSelection = (id: string) => {
    setSelectedBoxIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      // Códigos libres / pre-correlativo (AppSheet, alias raros): no listar en gestión operativa
      if (item.isLegacyBoxCode) return false;

      // Cajas ya en Taller/Scrap no pertenecen a Gestión de Bodega
      if (!isBodegaOperationalRack(item.rack)) return false;

      // Si el API ya filtró por technologyId/modelId, no volver a descartar filas
      // con tecnologiaId/modelo incompletos (causaba "No hay cajas en inventario").
      if (filterTech && item.tecnologiaId && item.tecnologiaId !== filterTech) return false;
      if (filterModel) {
        const modelId = String(item.modelo || '');
        const modelLabel = String(item.modeloLabel || modelName(item.modelo) || '').trim();
        if (
          modelId &&
          modelId !== 'N/A' &&
          modelId !== filterModel &&
          modelLabel !== filterModel
        ) {
          return false;
        }
      }

      // fillStatus=partial en API = solo TMP/EN_PROCESO; respaldo cliente
      const isFull = item.status === 'Full';
      if (filterStatus === 'Full' && !isFull) return false;
      if (filterStatus === 'Partial' && !isWarehouseScanInProgress(item.rack, item.box_code || item.id)) {
        return false;
      }

      // Con búsqueda activa el API ya filtró (caja / serie / OS).
      // No re-filtrar por texto en cliente: la serie no aparece en el label de caja
      // y se vaciaba la tabla ("SIN REGISTROS") aunque el API devolviera BOX-29.
      return true;
    });
  }, [inventory, filterTech, filterModel, filterStatus]);

  useEffect(() => {
    startTransition(() => setInventoryPage(1));
  }, [debouncedSearch, filterTech, filterModel, filterStatus]);

  const inventoryTotalCount = filteredInventory.length;
  const inventoryTotalPages = Math.max(
    1,
    Math.ceil(inventoryTotalCount / BODEGA_GESTION_PAGE_SIZE)
  );
  const inventorySafePage = Math.min(inventoryPage, inventoryTotalPages);

  useEffect(() => {
    if (inventoryPage > inventoryTotalPages) {
      startTransition(() => setInventoryPage(inventoryTotalPages));
    }
  }, [inventoryPage, inventoryTotalPages]);

  const onInventoryPageChange = useCallback((value: React.SetStateAction<number>) => {
    startTransition(() => setInventoryPage(value));
  }, []);

  const inventoryPageItems = useMemo(() => {
    const start = (inventorySafePage - 1) * BODEGA_GESTION_PAGE_SIZE;
    return filteredInventory.slice(start, start + BODEGA_GESTION_PAGE_SIZE);
  }, [filteredInventory, inventorySafePage]);

  const inventoryStartItem =
    inventoryTotalCount === 0
      ? 0
      : (inventorySafePage - 1) * BODEGA_GESTION_PAGE_SIZE + 1;
  const inventoryEndItem = Math.min(
    inventorySafePage * BODEGA_GESTION_PAGE_SIZE,
    inventoryTotalCount
  );

  /** Modelos del catálogo para la tecnología elegida (cascada; sin duplicados por espacios/caso). */
  const modelFilterOptions = useMemo(() => {
    if (!filterTech) return [] as Array<{ id: string; label: string }>;
    const byKey = new Map<string, { id: string; label: string }>();
    for (const m of catModelos) {
      if (String(m.technology_id || '') !== filterTech) continue;
      const label = normalizeCatalogLabel(m.name);
      const key = catalogLabelKey(label);
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, { id: String(m.id), label });
    }
    return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }, [catModelos, filterTech]);

  useEffect(() => {
    if (!filterModel) return;
    if (!filterTech || !modelFilterOptions.some((m) => m.id === filterModel || m.label === filterModel)) {
      setFilterModel('');
    }
  }, [filterTech, filterModel, modelFilterOptions]);

  const resumeInProgressBoxes = useCallback(async () => {
    setFilterTech('');
    setFilterModel('');
    setSearchTerm('');
    setShowAdvancedFilters(true);

    const pending = await listInProgressBodegaBoxes(20);
    if (pending.error) {
      // Migración 130 pendiente → fallback a filtro parcial
      autoOpenedPartialRef.current = false;
      setFilterStatus('Partial');
      notify.warning('Aplique la migración 130', {
        description: 'Para reanudar pistoleos guardados en servidor ejecute 130_bodega_scan_session_persist.sql',
      });
      requestAnimationFrame(() => {
        inventoryListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return;
    }

    const rows = pending.data || [];
    if (rows.length === 0) {
      autoOpenedPartialRef.current = false;
      setFilterStatus('Partial');
      notify.info('Sin pistoleos pendientes en servidor', {
        description: 'No hay cajas EN_PROCESO. Si el corte fue antes del primer escaneo, no hay nada que recuperar.',
      });
      requestAnimationFrame(() => {
        inventoryListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return;
    }

    // Reanudar la más reciente
    const draft = rows[0];
    const techId = draft.model_id
      ? techIdByModelId.get(draft.model_id)
      : draft.sample_model_id
        ? techIdByModelId.get(draft.sample_model_id)
        : '';

    setNewBox({
      correlativo: draft.label || '',
      rack: 'P-01',
      marca: draft.brand_id || draft.sample_brand_id || '',
      modelo: draft.model_id || draft.sample_model_id || '',
      tecnologia: techId || '',
      cantidad: Number(draft.capacity || 0),
    });
    setDraftBoxId(draft.box_id);
    setDraftBoxCode(draft.label || '');

    try {
      const seriesUi = await fetchBoxSeriesUi(draft.box_id);
      setTempSerials(seriesUi || []);
    } catch {
      setTempSerials([]);
    }

    setNewBoxStep('scanning');
    setShowNewBoxModal(true);
    setFilterStatus('Partial');
    autoOpenedPartialRef.current = true;
    notify.success('Pistoleo reanudado', {
      description: `${draft.label}: ${draft.equipos_count || 0}/${draft.capacity || '?'} equipos en servidor`,
    });
  }, [techIdByModelId]);

  const { data: statsData } = useQuery({
    queryKey: ['warehouse-stats'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/warehouse/stats');
      return readApiJson<{
        stats: Array<{ technology_id: string; tech_name?: string; total_boxes: number; total_units: number }>;
        totals?: {
          total_boxes: number;
          total_equipos: number;
          cajas_completas: number;
          cajas_parciales: number;
        };
        unit?: string;
      }>(res);
    },
  });

  const warehouseTotals = statsData?.totals ?? null;

  useEffect(() => {
    if (filterStatus !== 'Partial') {
      autoOpenedPartialRef.current = false;
      return;
    }
    if (autoOpenedPartialRef.current || isBoxesLoading || showNewBoxModal) return;
    if (filteredInventory.length === 1) {
      const item = filteredInventory[0];
      const rack = String(item.rack || '').toUpperCase();
      const code = String(item.box_code || item.id || '');
      const isDraft = rack === 'EN_PROCESO' || code.toUpperCase().startsWith('TMP-');
      autoOpenedPartialRef.current = true;
      if (isDraft) {
        // Reanudar pistoleo TMP en el modal de ingreso (no solo detalle)
        void resumeInProgressBoxes();
      } else {
        void openBoxDetail(item);
        notify.info('Caja en proceso', {
          description: `Reanudando ${item.displayId || item.id}`,
        });
      }
    } else if (filteredInventory.length === 0) {
      const kpiPartial = warehouseTotals?.cajas_parciales ?? 0;
      if (kpiPartial > 0) {
        notify.info('Use «Cajas en Proceso» de nuevo', {
          description: 'Si hay pistoleo TMP en servidor, asegúrese de haber aplicado la migración 130.',
        });
      } else {
        notify.info('Sin cajas en proceso', {
          description: 'No hay pistoleos pendientes ni cajas parciales.',
        });
      }
      autoOpenedPartialRef.current = true;
    }
  }, [filterStatus, filteredInventory, isBoxesLoading, openBoxDetail, warehouseTotals?.cajas_parciales, showNewBoxModal, resumeInProgressBoxes]);

  const techStats = useMemo((): { value: string; label: string; boxes: number; units: number }[] => {
    return (statsData?.stats || []).map((s) => ({
      value: s.technology_id,
      label: s.tech_name || techName(s.technology_id),
      boxes: s.total_boxes,
      units: s.total_units,
    }));
  }, [statsData, techName]);

  const handleExportReport = async () => {
    try {
      const res = await apiFetch('/api/v1/warehouse/boxes/export');
      if (isApiAuthFailure(res.status, null)) {
        await haltForLoginRedirect();
        return;
      }
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        notify.error(payload.error || 'Error generando reporte', {
          description: payload.detail,
        });
        return;
      }
      const blob = await res.blob();
      const today = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Reporte_Detalle_Cajas_${today}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notify.success('Reporte descargado');
    } catch (err) {
      notify.error('Error generando reporte', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  useEffect(() => {
    if (pathname !== '/bodega/gestion') return;
    void fetchBoxes();
  }, [pathname]);

  useEffect(() => {
    if (!catalogsReady) return;
    setNewBox((prev) => ({
      ...prev,
      tecnologia: prev.tecnologia || catTecnologias[0]?.id || '',
      marca: prev.marca || catMarcas[0]?.id || '',
      modelo:
        prev.modelo ||
        catModelos.find(
          (m: any) =>
            m.technology_id === (catTecnologias[0]?.id || '') &&
            m.brand_id === (catMarcas[0]?.id || '')
        )?.id ||
        catModelos[0]?.id ||
        '',
    }));
  }, [catalogsReady, catTecnologias, catMarcas, catModelos]);

  useEffect(() => {
    if (showNewBoxModal) {
      setNewBoxStep('form');
      setNewBox((prev) => ({
        ...prev,
        correlativo: '',
      }));
    }
  }, [showNewBoxModal]);

  const handleDispatchBox = async (boxId: string, realDbId?: string) => {
    if (dispatchAction === 'despacho' && !dispatchDestination.trim()) {
      notify.warning("Por favor ingresa un destino o guía de salida.");
      return;
    }
    
    if (dispatchMode === 'specific' && selectedSeriesForDispatch.length === 0) {
      notify.warning("Debes seleccionar al menos una serie para procesar.");
      return;
    }

    const resolvedDbId = realDbId || boxId;
    let box =
      showDispatchModal?.realDbId === resolvedDbId || showDispatchModal?.id === boxId
        ? showDispatchModal
        : inventory.find((b) => b.realDbId === resolvedDbId || b.id === boxId);

    // --- Validación SAP: cargar series si hace falta ---
    let seriesToCheck: any[] = box?.series?.length ? [...box.series] : [];
    if (!seriesToCheck.length && resolvedDbId) {
      try {
        seriesToCheck = await ensureBoxSeriesLoaded({ realDbId: resolvedDbId, id: boxId });
      } catch {
        notify.error('No se pudieron validar las series antes del movimiento');
        return;
      }
    }

    if (dispatchMode === 'specific') {
      seriesToCheck = seriesToCheck.filter((s: any) =>
        selectedSeriesForDispatch.includes(s.sn) ||
        selectedSeriesForDispatch.includes(s.s1) ||
        selectedSeriesForDispatch.includes(s.serial_number)
      );
    }

    for (const s of seriesToCheck) {
      const sapInput = {
        integrationStatus: s.sap_integration_status || s.sap_status,
        seriesStatuses: s.series_sap_statuses || [s.sap_status],
      };
      if (dispatchAction === 'despacho') {
        const decision = sapValidationReader.authorize(sapInput, 'dispatch');
        if (!decision.allowed) {
          notify.warning(`${decision.reason} Equipo ${s.sn || s.serial_number}.`);
          return;
        }
      } else if (dispatchAction === 'traslado') {
        if (dispatchArea !== 'Diagnóstico' && dispatchArea !== 'Reparación') {
          const decision = sapValidationReader.authorize(sapInput, 'transfer');
          if (!decision.allowed) {
            notify.warning(`${decision.reason} Equipo ${s.sn || s.serial_number}.`);
            return;
          }
        }
      }
    }
    // ---------------------------------------------
    
    setIsDispatching(true);
    try {
      let error;
      if (dispatchAction === 'traslado') {
         if (dispatchMode === 'all') {
            const res = await transferBoxesToArea([realDbId || boxId], dispatchArea, undefined);
            error = res.error;
         } else {
            // Misma regla que despacho: unidad OS completa (S1–S4 / hermanas).
            const expanded = expandSelectedSeriesForOs(
              seriesToCheck.length ? seriesToCheck : box?.series,
              selectedSeriesForDispatch
            );
            const res = await transferSpecificSeriesToArea(
              realDbId || boxId,
              expanded,
              dispatchArea,
              'Admin User'
            );
            error = res.error;
         }
      } else {
        const batchId = useOutboundDispatchHex ? selectedDispatchBatchId ?? undefined : undefined;
        if (dispatchMode === 'all') {
          const res = await dispatchBoxFromWarehouse(
            realDbId || boxId,
            dispatchDestination,
            dispatchNotes,
            batchId
          );
          error = res.error;
        } else {
          const expanded = expandSelectedSeriesForOs(
            seriesToCheck.length ? seriesToCheck : box?.series,
            selectedSeriesForDispatch
          );
          const res = await dispatchSpecificSeries(
            realDbId || boxId,
            expanded,
            dispatchDestination,
            dispatchNotes,
            batchId
          );
          error = res.error;
          if (!error && res.data?.equipos_remaining != null) {
            notify.success('Despacho registrado', {
              description: `Conduce ${dispatchDestination}. Equipos restantes en caja: ${res.data.equipos_remaining}.`,
            });
          }
        }
      }
      
      if (error) {
        notify.error('Error despachando', { description: String(error) });
      } else {
        const wasTrasladoDiagnostico =
          dispatchAction === 'traslado' && dispatchArea === 'Diagnóstico';
        if (dispatchAction !== 'despacho' || dispatchMode === 'all') {
          notify.success(dispatchAction === 'despacho' ? 'Despacho registrado' : 'Traslado registrado');
        }
        // Cerrar modal de inmediato; el refresh no debe dejar "Procesando…" colgado.
        setShowDispatchModal(null);
        setSelectedBox(null);
        setDispatchDestination('');
        setDispatchNotes('');
        setSelectedSeriesForDispatch([]);
        setDispatchMode('all');
        setDispatchAction('despacho');
        void Promise.race([
          refreshWarehouseLists(),
          new Promise<void>((resolve) => setTimeout(resolve, 12_000)),
        ]).catch(() => undefined);
        if (wasTrasladoDiagnostico) {
          void queryClient.invalidateQueries({ queryKey: ['workshop-tab-counts'] });
        }
      }
    } catch (err) {
      console.error(err);
      notify.error("Error inesperado al despachar.");
    } finally {
      setIsDispatching(false);
    }
  };

  useEffect(() => {
    if (showTimeline && showTimeline.guide_number) {
      const fetchGuideDetails = async () => {
        const supabase = getSupabaseBrowserClient();
        if (!supabase) return;
        setTimelineGuideDetails({ loading: true });
        
        const { data, error } = await supabase
          .from('receptions')
          .select(RECEPTION_TIMELINE_SELECT)
          .eq('guide_number', showTimeline.guide_number)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (error || !data) {
          setTimelineGuideDetails({ loading: false, error: 'No se encontraron detalles extra para esta guía.' });
        } else {
          setTimelineGuideDetails({ loading: false, data });
        }
      };
      fetchGuideDetails();
    } else {
      setTimelineGuideDetails(null);
    }

    if (showTimeline && showTimeline.box_id) {
      const fetchHistory = async () => {
        setLoadingBoxHistory(true);
        const { data } = await getBoxHistory(showTimeline.box_id);
        setBoxHistoryData(data || []);
        setLoadingBoxHistory(false);
      };
      fetchHistory();
    } else {
      setBoxHistoryData([]);
    }
  }, [showTimeline]);

  const fetchBoxes = async (force = false) => {
    if (force) {
      await refreshWarehouseLists();
    }
  };

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void fetchBoxes();
      }
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);
  const [currentSN, setCurrentSN] = useState('');
  const [lastScannedInfo, setLastScannedInfo] = useState<any | null>(null);
  const [newBoxLastScannedInfo, setNewBoxLastScannedInfo] = useState<any | null>(null);
  const [newBox, setNewBox] = useState({
    correlativo: '',
    rack: '',
    marca: '',
    modelo: '',
    tecnologia: '',
    cantidad: 0
  });
  const [newBoxStep, setNewBoxStep] = useState<'form' | 'scanning'>('form');
  const [isSavingNewBox, setIsSavingNewBox] = useState(false);
  const [tempSerials, setTempSerials] = useState<any[]>([]);
  /** Caja TMP en BD mientras se pistolea (persiste corte de luz). */
  const [draftBoxId, setDraftBoxId] = useState<string | null>(null);
  const [draftBoxCode, setDraftBoxCode] = useState<string>('');
  const [deleteAuthTarget, setDeleteAuthTarget] = useState<{
    boxId: string;
    realDbId: string;
    label: string;
  } | null>(null);
  const [deleteAuthSubmitting, setDeleteAuthSubmitting] = useState(false);

  // Mass Transfer State
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedBoxesForTransfer, setSelectedBoxesForTransfer] = useState<string[]>([]);
  const [targetRack, setTargetRack] = useState('');
  const [transferScanInput, setTransferScanInput] = useState('');
  const [destinationArea, setDestinationArea] = useState('Bodega Central');
  const [transferExecuting, setTransferExecuting] = useState(false);

  const resetNewBoxSession = useCallback(() => {
    setShowNewBoxModal(false);
    setNewBoxStep('form');
    setTempSerials([]);
    setNewBoxLastScannedInfo(null);
    setDraftBoxId(null);
    setDraftBoxCode('');
    setNewBox({ correlativo: '', rack: '', marca: '', modelo: '', tecnologia: '', cantidad: 0 });
  }, []);

  const handleAddBox = async () => {
    if (isSavingNewBox) return;
    setIsSavingNewBox(true);
    setLoading(true);

    try {
      if (tempSerials.length === 0) {
        notify.warning("Debe escanear al menos una serie para poder guardar la caja.");
        return;
      }

      const boxModel =
        catModelos.find((m) => m.id === newBox.modelo) ||
        catModelos.find((m) => m.name === newBox.modelo);
      for (const row of tempSerials) {
        const gate = validateSerialForModelAnySlot(String(row.sn || ''), boxModel);
        if (!gate.valid) {
          notify.warning(gate.title || 'Serial inválido', {
            description: `${row.sn}: ${gate.message}`,
          });
          return;
        }
      }

      if (!draftBoxId) {
        notify.warning('No hay sesión de pistoleo en servidor', {
          description: 'Escanee al menos una serie (queda guardada en EN_PROCESO) y luego finalice.',
        });
        return;
      }

      const result = await finalizeBodegaScan({
        boxId: draftBoxId,
        rackLocation: newBox.rack || 'P-01',
      });

      if (result.error) {
        notify.error('Error al finalizar la caja', { description: result.error });
        return;
      }

      notify.success(`Caja ${result.data?.box_code || ''} creada`, {
        description: `${result.data?.series_linked ?? tempSerials.length} equipo(s) en almacén.`,
      });
      await fetchBoxes(true);
      resetNewBoxSession();
    } finally {
      setIsSavingNewBox(false);
      setLoading(false);
    }
  };

  const handleScanForNewBox = async (e: React.FormEvent) => {
    e.preventDefault();
    const sn = prepareScannedSerial(currentSN);
    if (!sn) return;
    if (tempSerials.length >= newBox.cantidad) return notify.warning("Cantidad completada");

    if (tempSerials.find(s => s.sn === sn)) return notify.warning("Serie ya escaneada");

    const boxModel =
      catModelos.find((m) => m.id === newBox.modelo) ||
      catModelos.find((m) => m.name === newBox.modelo);
    const lengthCheck = validateSerialForModelAnySlot(sn, boxModel);
    if (!lengthCheck.valid) {
      notify.warning(lengthCheck.title || 'Longitud incorrecta', {
        description: lengthCheck.message,
        duration: 0,
      });
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const { data: mainSeries, error } = await supabase
      .from('series')
      .select(`
        *,
        receptions (*),
        service_orders (id, os_label, reentry_count)
      `)
      .eq('serial_number', sn)
      .single();

    if (error || !mainSeries) {
      notify.warning("Serie no encontrada en Recepción CAC o Backoffice.");
      return;
    }

    // Validar elegibilidad: Backoffice clasificado o PX ya ingresado
    const ingresoGate = canScanSeriesIntoWarehouse(
      mainSeries.receptions,
      !!mainSeries.service_orders?.id,
      mainSeries.current_status
    );
    if (!ingresoGate.ok) {
      if (ingresoGate.reason === 'already_ingresado') {
        notify.warning(`La serie ${sn} ya está ingresada en Bodega General.`);
      } else {
        notify.warning(`El equipo ${sn} no está listo para ingreso a almacén`, {
          description: `Estatus recepción: ${mainSeries.receptions?.status || 'SIN RECEPCIÓN'} · Estatus serie: ${mainSeries.current_status || 'N/A'}.`,
        });
      }
      return;
    }

    // Obtener todas las series hermanas (mismo service_order)
    let siblingSeries: string[] = [];
    if (mainSeries.service_orders?.id) {
      const { data: siblings } = await supabase
        .from('series')
        .select('serial_number')
        .eq('service_order_id', mainSeries.service_orders.id)
        .order('created_at', { ascending: true });
      if (siblings) {
        siblingSeries = siblings.map((s: any) => s.serial_number);
      }
    } else {
      siblingSeries = [mainSeries.serial_number];
    }

    // Parsear metadatos — agencia desde reception_guides.agency si disponible (Fase 4)
    const notes = mainSeries.receptions?.notes || '';
    const piloto = notes.split('Piloto: ')[1]?.split('\n')[0]?.trim() || '---';
    // Buscar el reception_guide correspondiente a esta guía
    const receptionGuide = (mainSeries.receptions?.reception_guides || []).find(
      (rg: any) => rg.guide_number === mainSeries.receptions?.guide_number
    );
    const agenciaCAC = receptionGuide?.agency
      || notes.split('Backoffice_Agency: ')[1]?.split('\n')[0]?.trim()
      || mainSeries.receptions?.carrier
      || '---';

    // Resolver IDs de catálogo — vienen de la serie directamente, notas solo como fallback
    const trueModelId = mainSeries.model_id;
    const trueBrandId = mainSeries.brand_id;
    const modelRecord = catModelos.find(m => m.id === trueModelId);
    const trueTechId = modelRecord?.technology_id || '';

    // Los fallbacks solo se usan si la serie por alguna razón no tiene los IDs en su tabla
    const techId = trueTechId || notes.split('Backoffice_Tech: ')[1]?.split('\n')[0]?.trim() || '';
    const brandId = trueBrandId || notes.split('Backoffice_Brand: ')[1]?.split('\n')[0]?.trim() || '';
    const modelId = trueModelId || notes.split('Backoffice_Model: ')[1]?.split('\n')[0]?.trim() || '';

    const selectedTechName = techName(newBox.tecnologia);
    const selectedBrandName = brandName(newBox.marca);
    const selectedModelName = modelName(newBox.modelo);

    const isTechMatch = techId === newBox.tecnologia || techId === selectedTechName;
    const isBrandMatch = brandId === newBox.marca || brandId === selectedBrandName;
    const isModelMatch = modelId === newBox.modelo || modelId === selectedModelName;

    const tecnologiaBO = techName(techId || null, String(techId || newBox.tecnologia));
    const marcaBO = brandName(brandId || null, String(brandId || newBox.marca));
    const modeloBO = modelName(modelId || null, String(modelId || newBox.modelo));

    // Validar que la serie escaneada coincida con la configuración de la caja actual
    if (!isTechMatch || !isBrandMatch || !isModelMatch) {
      notify.warning('Validación fallida: Modelo/Marca/Tecnología no coinciden', {
        description: `Escaneado: ${tecnologiaBO} / ${marcaBO} / ${modeloBO} · Esperado: ${selectedTechName || newBox.tecnologia} / ${selectedBrandName || newBox.marca} / ${selectedModelName || newBox.modelo}`,
        duration: 0,
      });
      return;
    }

    const reentryCount = mainSeries.service_orders?.reentry_count || 1;
    const ingresoLabel = `${reentryCount}° Ingreso`;

    const recepcionDate = mainSeries.receptions?.created_at
      ? new Date(mainSeries.receptions.created_at).toLocaleString()
      : new Date(mainSeries.created_at).toLocaleString();

    const info = {
      sn: mainSeries.serial_number,
      s1: siblingSeries[0] || mainSeries.serial_number,
      s2: siblingSeries[1] || '',
      s3: siblingSeries[2] || '',
      s4: siblingSeries[3] || '',
      material: mainSeries.material || '',
      lote: mainSeries.valuation || '',
      allSeries: siblingSeries,
      reception_id: mainSeries.current_reception_id,
      marca: marcaBO,
      modelo: modeloBO,
      tecnologia: tecnologiaBO,
      origen: mainSeries.receptions?.carrier || 'Desconocida',
      agenciaCAC: agenciaCAC,
      piloto: piloto,
      guia: mainSeries.receptions?.guide_number || 'S/G',
      recibio: mainSeries.receptions?.received_by || 'SISTEMA',
      estatus: mainSeries.receptions?.status || 'N/A',
      ordenServicio: mainSeries.service_orders?.os_label || 'S/OS',
      ingreso: ingresoLabel,
      fechaHora: recepcionDate,
      fechaRecepcion: new Date(mainSeries.created_at).toLocaleDateString(),
      timestamp: new Date().toLocaleTimeString()
    };

    if (!info.reception_id) {
      notify.warning('Serie sin recepción de origen', { description: 'Verifique clasificación en Backoffice.' });
      return;
    }

    const persist = await startOrAppendBodegaScan({
      boxId: draftBoxId,
      receptionId: info.reception_id,
      brandId: newBox.marca,
      modelId: newBox.modelo,
      capacity: newBox.cantidad,
      serialNumbers: siblingSeries.length > 0 ? siblingSeries : [mainSeries.serial_number],
    });

    if (persist.error) {
      notify.error('No se pudo guardar el escaneo en servidor', { description: persist.error });
      return;
    }

    if (persist.data?.box_id) {
      setDraftBoxId(persist.data.box_id);
      setDraftBoxCode(persist.data.box_code || '');
      setNewBox((prev) => ({ ...prev, correlativo: persist.data?.box_code || prev.correlativo }));
    }

    setTempSerials([info, ...tempSerials]);
    setNewBoxLastScannedInfo(info);
    setCurrentSN('');
  };

  const printBoxLabel = (box: any, type: 'simple' | 'master') => {
    const brandLabel = brandName(box.marca);
    const modelLabel = modelName(box.modelo);

    const printWindow = window.open('', '', 'width=600,height=400');
    if (!printWindow) return;

    const commonStyles = `
      <style>
        body { font-family: 'Inter', sans-serif; margin: 0; padding: 20px; text-align: center; color: #181c3a; }
        .label-container { padding: 20px; display: inline-block; min-width: 350px; }
        .title { font-size: 14px; font-weight: 900; letter-spacing: 2px; margin-bottom: 15px; color: #64748b; text-transform: uppercase; }
        .box-id { font-size: 32px; font-weight: 900; margin-bottom: 10px; font-family: monospace; }
        .details { font-size: 16px; font-weight: bold; margin-bottom: 20px; line-height: 1.5; }
        .barcode { font-family: 'Libre Barcode 39', monospace; font-size: 50px; margin-bottom: 5px; font-weight: normal; }
        @media print {
          .page-break { page-break-before: always; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
      <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39&display=swap" rel="stylesheet">
    `;

    const svgLogo = `
      <svg viewBox="0 0 565 280" xmlns="http://www.w3.org/2000/svg" style="height: 45px; width: auto;">
        <rect width="565" height="280" fill="#ffffff"/>
        <g fill="#2e3165"><rect x="8" y="9" width="232" height="60"/><rect x="92" y="9" width="65" height="271"/></g>
        <g fill="#2e3165"><circle cx="425" cy="140" r="140"/><circle cx="425" cy="140" r="85" fill="#ffffff"/><rect x="500" y="100" width="80" height="60" fill="#ffffff"/><circle cx="425" cy="140" r="35" fill="#2e3165"/></g>
      </svg>
    `;

    const simpleLabelHtml = `
      <div class="label-container">
        <div class="title" style="display: flex; justify-content: center; margin-bottom: 15px;">
          ${svgLogo}
        </div>
        <div class="box-id">${box.id}</div>
        
        <!-- Fallback Barcode using font -->
        <div class="barcode">*${box.id}*</div>
        
        <div class="details">
          MARCA: ${brandLabel}<br>
          MODELO: ${modelLabel}<br>
          CANTIDAD: ${box.cantidad} Unidades<br>
          FECHA: ${box.fechaIngreso || new Date().toLocaleDateString()}
        </div>
      </div>
    `;

    const masterLabelHtml = `
      <div class="label-container" style="text-align: left; margin-top: 5px;">
        <div class="title" style="display: flex; justify-content: center; margin-bottom: 5px;">
          <svg viewBox="0 0 565 280" xmlns="http://www.w3.org/2000/svg" style="height: 30px; width: auto;">
            <rect width="565" height="280" fill="#ffffff"/>
            <g fill="#2e3165"><rect x="8" y="9" width="232" height="60"/><rect x="92" y="9" width="65" height="271"/></g>
            <g fill="#2e3165"><circle cx="425" cy="140" r="140"/><circle cx="425" cy="140" r="85" fill="#ffffff"/><rect x="500" y="100" width="80" height="60" fill="#ffffff"/><circle cx="425" cy="140" r="35" fill="#2e3165"/></g>
          </svg>
        </div>
        <div style="text-align: center;">
          <div class="box-id" style="font-size: 24px; margin-bottom: 2px;">CAJA MASTER</div>
          <div class="box-id" style="font-size: 20px; margin-bottom: 2px;">${box.id}</div>
          <div class="barcode" style="font-size: 40px; margin-bottom: 5px;">*${box.id}*</div>
        </div>
        
        <div class="details" style="font-size: 12px; margin-bottom: 15px; border-bottom: 1px solid #000; padding-bottom: 10px;">
          <strong>MARCA:</strong> ${brandLabel} &nbsp;|&nbsp; <strong>MODELO:</strong> ${modelLabel} <br>
          <strong>TECNOLOGÍA:</strong> ${box.tecnologia || '---'} &nbsp;|&nbsp; <strong>FECHA:</strong> ${box.fechaIngreso || new Date().toLocaleDateString()}
        </div>
        
        <div class="details" style="font-size: 10px; font-family: monospace;">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="border-bottom: 2px solid #000;">
                <th style="padding: 4px;">#</th>
                <th style="padding: 4px;">S-1 / SN</th>
                <th style="padding: 4px;">S-2</th>
                <th style="padding: 4px;">S-3</th>
                <th style="padding: 4px;">S-4</th>
                <th style="padding: 4px;">Material</th>
                <th style="padding: 4px;">Lote</th>
              </tr>
            </thead>
            <tbody>
              ${(box.series || []).map((s: any, idx: number) => 
                '<tr style="border-bottom: 1px solid #ccc;">' +
                  '<td style="padding: 4px;">' + (idx + 1) + '</td>' +
                  '<td style="padding: 4px; font-weight: bold;">' + (s.s1 || s.sn || '---') + '</td>' +
                  '<td style="padding: 4px;">' + (s.s2 || '---') + '</td>' +
                  '<td style="padding: 4px;">' + (s.s3 || '---') + '</td>' +
                  '<td style="padding: 4px;">' + (s.s4 || '---') + '</td>' +
                  '<td style="padding: 4px;">' + (s.material || '---') + '</td>' +
                  '<td style="padding: 4px;">' + (s.lote || '---') + '</td>' +
                '</tr>'
              ).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    printWindow.document.write(`
      <html>
        <head>
          <title>Impresión de Etiqueta - ${box.id}</title>
          ${commonStyles}
        </head>
        <body>
          ${type === 'simple' ? simpleLabelHtml : masterLabelHtml}
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                window.close();
              }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleAddSN = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBox) return;
    const sn = prepareScannedSerial(currentSN);
    if (!sn) return;
    
    if (selectedBox.series.find((s: any) => s.sn === sn)) return notify.warning("Serie ya escaneada en esta caja");

    const boxModel =
      catModelos.find((m) => m.id === selectedBox.modelo || m.id === selectedBox.model_id) ||
      catModelos.find((m) => m.name === selectedBox.modelo);
    const lengthCheck = validateSerialForModelAnySlot(sn, boxModel);
    if (!lengthCheck.valid) {
      notify.warning(lengthCheck.title || 'Longitud incorrecta', {
        description: lengthCheck.message,
        duration: 0,
      });
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    // Búsqueda inteligente en base de datos real
    const { data: mainSeries, error } = await supabase
      .from('series')
      .select(`
        *,
        receptions (*),
        service_orders (id, os_label)
      `)
      .eq('serial_number', sn)
      .single();

    if (error || !mainSeries) {
      notify.warning('Serie no encontrada', { description: 'No está en Recepción o Backoffice. Verifique el registro previo.' });
      return;
    }

    // Validar elegibilidad: Backoffice clasificado o PX ya ingresado
    const ingresoGate = canScanSeriesIntoWarehouse(
      mainSeries.receptions,
      !!mainSeries.service_orders?.id,
      mainSeries.current_status
    );
    if (!ingresoGate.ok) {
      if (ingresoGate.reason === 'already_ingresado') {
        notify.warning(`La serie ${sn} ya está ingresada en Bodega General.`);
      } else {
        notify.warning(`El equipo ${sn} no está listo para ingreso a almacén`, {
          description: `Estatus recepción: ${mainSeries.receptions?.status || 'SIN RECEPCIÓN'} · Estatus serie: ${mainSeries.current_status || 'N/A'}.`,
        });
      }
      return;
    }

    // Obtener todas las series hermanas (mismo service_order)
    let siblingSeries: string[] = [];
    if (mainSeries.service_orders?.id) {
      const { data: siblings } = await supabase
        .from('series')
        .select('serial_number')
        .eq('service_order_id', mainSeries.service_orders.id)
        .order('created_at', { ascending: true });
      if (siblings) {
        siblingSeries = siblings.map((s: any) => s.serial_number);
      }
    } else {
      siblingSeries = [mainSeries.serial_number];
    }

    // Parsear metadatos — agencia desde reception_guides.agency si disponible (Fase 4)
    const notes = mainSeries.receptions?.notes || '';
    const piloto = notes.split('Piloto: ')[1]?.split('\n')[0]?.trim() || '---';
    const receptionGuide2 = (mainSeries.receptions?.reception_guides || []).find(
      (rg: any) => rg.guide_number === mainSeries.receptions?.guide_number
    );
    const agenciaCAC = receptionGuide2?.agency
      || notes.split('Backoffice_Agency: ')[1]?.split('\n')[0]?.trim()
      || mainSeries.receptions?.carrier
      || '---';

    // Resolver IDs de catálogo a nombres legibles usando los catálogos cargados
    const techId = mainSeries.technology_id || notes.split('Backoffice_Tech: ')[1]?.split('\n')[0]?.trim() || '';
    const brandId = mainSeries.brand_id || notes.split('Backoffice_Brand: ')[1]?.split('\n')[0]?.trim() || '';
    const modelId = mainSeries.model_id || notes.split('Backoffice_Model: ')[1]?.split('\n')[0]?.trim() || '';

    // Buscar nombre legible en catálogos cargados
    const tecnologiaBO = techName(techId || null, String(techId || 'EQUIPO'));
    const marcaBO = brandName(brandId || null, String(brandId || selectedBox.marca));
    const modeloBO = modelName(modelId || null, String(modelId || selectedBox.modelo));

    const reentryCount = mainSeries.service_orders?.reentry_count || 1;
    const ingresoLabel = `${reentryCount}° Ingreso`;

    const recepcionDate = mainSeries.receptions?.created_at
      ? new Date(mainSeries.receptions.created_at).toLocaleString()
      : new Date(mainSeries.created_at).toLocaleString();

    const info = {
      sn: mainSeries.serial_number,
      s1: siblingSeries[0] || mainSeries.serial_number,
      s2: siblingSeries[1] || '',
      s3: siblingSeries[2] || '',
      s4: siblingSeries[3] || '',
      material: mainSeries.material || '',
      lote: mainSeries.valuation || '',
      allSeries: siblingSeries,
      marca: marcaBO,
      modelo: modeloBO,
      tecnologia: tecnologiaBO,
      origen: mainSeries.receptions?.carrier || 'Desconocida',
      agenciaCAC: agenciaCAC,
      piloto: piloto,
      guia: mainSeries.receptions?.guide_number || 'S/G',
      recibio: mainSeries.receptions?.received_by || 'SISTEMA',
      estatus: mainSeries.receptions?.status || 'N/A',
      ordenServicio: mainSeries.service_orders?.os_label || 'S/OS',
      ingreso: ingresoLabel,
      fechaHora: recepcionDate,
      fechaRecepcion: new Date(mainSeries.created_at).toLocaleDateString(),
      timestamp: new Date().toLocaleTimeString()
    };

    // Guardar en la Base de Datos al instante (todas las series hermanas de la OS)
    const seriesToUpdate = info.allSeries.length > 0 ? info.allSeries : [info.sn];
    const result = await addSeriesToBox(selectedBox.realDbId || selectedBox.id, seriesToUpdate);

    if (result.error) {
      notify.error("Error al vincular la serie a la caja en la base de datos.");
      return;
    }

    const updatedSeries = [info, ...selectedBox.series];
    const equipos = new Set(
      updatedSeries.map((s: any) => s.service_orders?.id || s.ordenServicio || s.sn || s.serial_number)
    ).size;
    const updatedBox = {
      ...selectedBox,
      series: updatedSeries,
      unitCount: equipos,
      status: resolveBoxDisplayStatus(equipos, Number(selectedBox.cantidad || 0)),
    };
    setSelectedBox(updatedBox);
    setLastScannedInfo(info);
    if (selectedBox.realDbId) {
      boxSeriesCache.current.set(selectedBox.realDbId, updatedBox.series);
    }
    await refreshWarehouseLists();
    setCurrentSN('');
  };

  const handleDeleteBox = async (boxId: string, realDbId: string) => {
    const item = inventory.find((b) => b.realDbId === realDbId || b.id === boxId);
    if (item?.deletionStatus === 'pending_approval' || item?.status === 'Pendiente Aprobación') {
      notify.warning('Ya hay una solicitud pendiente', {
        description: 'Espere la autorización del Gerente General.',
      });
      return;
    }
    setDeleteAuthTarget({
      boxId,
      realDbId,
      label: String(item?.displayId || item?.box_code || boxId),
    });
  };

  const submitDeleteAuthorization = async (reason: string, observations: string) => {
    if (!deleteAuthTarget) return;
    setDeleteAuthSubmitting(true);
    try {
      const res = await requestBoxDeletion({
        boxId: deleteAuthTarget.realDbId,
        reason,
        observations,
      });
      if (res.error) {
        notify.error('No se pudo solicitar la autorización', { description: res.error });
        return;
      }
      notify.success('Solicitud enviada al Gerente General', {
        description: res.data?.message || `Caja ${deleteAuthTarget.label} quedó pendiente de aprobación.`,
      });
      setDeleteAuthTarget(null);
      await refreshWarehouseLists();
    } finally {
      setDeleteAuthSubmitting(false);
    }
  };

  /** Parchea `rack` en cache de lista sin esperar el refetch pesado del inventario. */
  const patchWarehouseRackCache = useCallback(
    (boxIds: string[], finalRack: string) => {
      const idSet = new Set(boxIds.map(String));
      queryClient.setQueriesData<{ pages: Array<{ items?: Array<{ box_id?: string; rack?: string }> }> }>(
        { queryKey: ['warehouse-boxes'] },
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

  const handleUpdateRack = async () => {
    if (!showRackModal) return;
    setLoading(true);
    const supabase = getSupabaseBrowserClient();

    const rn = rackNum.trim() || 'S/N';
    const rnl = rackNivel.trim() || '0';
    const rp = rackPosicion.trim() || 'S/P';
    const finalRack = `RACK-${rn} - NIVEL-${rnl} - POSICION-${rp}`.toUpperCase();

    if (!supabase) {
      notify.error('No se pudo conectar para guardar la ubicación');
      setLoading(false);
      return;
    }

    const realId = String(showRackModal.realDbId || showRackModal.id);
    const { error } = await supabase.from('boxes').update({ rack_location: finalRack }).eq('id', realId);
    if (error) {
      notify.error('Error al actualizar la ubicación', { description: error.message });
      setLoading(false);
      return;
    }

    // UPDATE es instantáneo; el lag era el refetch completo del inventario con el modal abierto.
    patchWarehouseRackCache([realId], finalRack);
    notify.success('Ubicación actualizada', { description: finalRack });
    setShowRackModal(null);
    setLoading(false);
    void refreshWarehouseLists();
  };

  const handleBulkUpdateRack = async () => {
    if (selectedBoxIds.length === 0) return;
    setLoading(true);
    const supabase = getSupabaseBrowserClient();

    const rn = rackNum.trim() || 'S/N';
    const rnl = rackNivel.trim() || '0';
    const rp = rackPosicion.trim() || 'S/P';
    const finalRack = `RACK-${rn} - NIVEL-${rnl} - POSICION-${rp}`.toUpperCase();

    if (!supabase) {
      notify.error('No se pudo conectar para guardar la ubicación');
      setLoading(false);
      return;
    }

    const realIds = selectedBoxIds.map((id) => {
      const box = inventory.find((b) => b.id === id);
      return String(box ? box.realDbId || box.id : id);
    });
    const { error } = await supabase.from('boxes').update({ rack_location: finalRack }).in('id', realIds);
    if (error) {
      notify.error('Error al actualizar ubicaciones', { description: error.message });
      setLoading(false);
      return;
    }

    patchWarehouseRackCache(realIds, finalRack);
    notify.success('Ubicación asignada', {
      description: `${selectedBoxIds.length} ${selectedBoxIds.length === 1 ? 'caja' : 'cajas'} → ${finalRack}.`,
    });
    setSelectedBoxIds([]);
    setShowBulkRackModal(false);
    setLoading(false);
    void refreshWarehouseLists();
  };

  const handleExecuteTransfer = async () => {
    if (selectedBoxesForTransfer.length === 0 || transferExecuting) return;

    setTransferExecuting(true);

    try {
      const realBoxIds = selectedBoxesForTransfer.map(id => {
        const box = inventory.find(b => b.id === id);
        return box ? (box.realDbId || box.id) : id;
      });

      const result = await transferBoxesToAreaInBatches(realBoxIds, destinationArea, undefined);

      if (!result.success) {
        notify.error('Error en la transferencia', { description: result.error ?? 'Transferencia fallida' });
      } else {
        await refreshWarehouseLists();
        await queryClient.invalidateQueries({ queryKey: ['workshop-tab-counts'] });
        setShowTransferModal(false);
        setSelectedBoxesForTransfer([]);
        const batchNote =
          result.batches > 1 ? ` en ${result.batches} lotes automáticos` : '';
        notify.success('Transferencia exitosa', {
          description: `${result.transferred} cajas movidas a ${destinationArea}${batchNote}.`,
        });
      }
    } catch (err) {
      console.error('Transfer error:', err);
      notify.error('Error en la transferencia', { description: 'No se pudo completar el movimiento. Intente de nuevo.' });
    } finally {
      setTransferExecuting(false);
    }
  };

  const handleScanForTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferScanInput) return;

    const box = inventory.find(b => b.id.toUpperCase() === transferScanInput.toUpperCase());
    if (!box) {
      notify.warning("Caja no encontrada en inventario");
      setTransferScanInput('');
      return;
    }

    if (!selectedBoxesForTransfer.includes(box.id)) {
      setSelectedBoxesForTransfer([...selectedBoxesForTransfer, box.id]);
    }
    setTransferScanInput('');
  };

  const pageBoxIds = inventoryPageItems.map((b: any) => b.id);
  const allPageSelected = pageBoxIds.length > 0 && pageBoxIds.every((id: string) => selectedBoxIds.includes(id));

  const inventoryColumns: DataTableColumn<any>[] = [
    {
      id: 'select',
      width: '40px',
      header: (
        <input
          type="checkbox"
          className="w-4 h-4 accent-[#2ec4f1] cursor-pointer"
          checked={allPageSelected}
          onClick={(e) => e.stopPropagation()}
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
      cell: (item) => (
        <input
          type="checkbox"
          className="w-4 h-4 accent-[#2ec4f1] cursor-pointer"
          checked={selectedBoxIds.includes(item.id)}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleBoxSelection(item.id)}
        />
      ),
    },
    {
      id: 'id',
      header: 'ID Caja',
      width: '130px',
      cell: (item) => (
        <div className="flex items-center gap-1.5 min-w-0 w-full">
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
          {item.fuente && (
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[7px] font-bold tracking-wide uppercase ${
                item.fuente === 'CAC'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-accent text-accent-foreground'
              }`}
            >
              {item.fuente}
            </span>
          )}
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
        <span className="truncate whitespace-nowrap" title={item.tecnologia || '---'}>
          {item.tecnologia || '---'}
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
      cell: (item) => (
        <div
          className="flex items-center gap-1.5 group/loc cursor-pointer min-w-0 w-full"
          onClick={(e) => {
            e.stopPropagation();
            const r = item.rack || '';
            let rn = '', rnl = '', rp = '';
            const parts = r.split(' - ');
            if (parts.length === 3) {
              rn = parts[0].replace('RACK-', '');
              rnl = parts[1].replace('NIVEL-', '');
              rp = parts[2].replace('POSICION-', '');
            } else {
              rn = r;
            }

            setRackNum(rn);
            setRackNivel(rnl);
            setRackPosicion(rp);
            setShowRackModal(item);
          }}
          title={`Cambiar ubicación · ${item.area || 'Bodega Central'}`}
        >
          <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--accent)] transition-colors group-hover/loc:text-[var(--warning)]" />
          {(() => {
            const r = item.rack || '';
            if (r === 'SIN RACK' || !r) {
              return <span className="truncate text-[10px] font-semibold text-[var(--muted)]">Sin Asignar</span>;
            }
            const parts = r.split(' - ').map((p: string) => p.replace('RACK-', '').replace('NIVEL-', '').replace('POSICION-', ''));
            return (
              <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                {parts.map((p: string, idx: number) => (
                  <span
                    key={idx}
                    className="max-w-[88px] shrink-0 truncate rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--foreground)]"
                    style={{ backgroundColor: 'var(--surface-hover)' }}
                    title={p}
                  >
                    {p}
                  </span>
                ))}
              </div>
            );
          })()}
          <Pencil className="h-3 w-3 shrink-0 text-[var(--muted)] opacity-0 transition-opacity group-hover/loc:opacity-100" />
        </div>
      ),
    },
    {
      id: 'marcaModelo',
      header: 'Marca / Modelo',
      width: '160px',
      cell: (item) => {
        const marca = item.marcaLabel || brandName(item.marca) || '';
        const modelo = item.modeloLabel || modelName(item.modelo) || '';
        const label = [marca, modelo].filter(Boolean).join(' ') || '---';
        return (
          <span className="block truncate whitespace-nowrap text-[11px] font-semibold text-[var(--foreground)]" title={label}>
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
                width: `${Math.min(((item.unitCount || item.series?.length || 0) / Math.max(item.cantidad || 1, 1)) * 100, 100)}%`,
                backgroundColor: item.status === 'Full' ? 'var(--accent)' : 'var(--warning)',
              }}
            />
          </div>
          <span className="whitespace-nowrap text-[10px] font-semibold text-[var(--foreground)]">
            {item.unitCount ?? item.series?.length ?? 0}
            {item.cantidad ? ` / ${item.cantidad}` : ''}
          </span>
        </div>
      ),
    },
    {
      id: 'estatus',
      header: 'Estatus',
      width: '88px',
      cell: (item) => (
        <Badge
          variant={
            item.status === 'Full'
              ? 'green'
              : item.status === 'Parcial'
                ? 'yellow'
                : item.status === 'Pendiente Aprobación'
                  ? 'default'
                  : 'default'
          }
        >
          {item.status}
        </Badge>
      ),
    },
    {
      id: 'acciones',
      header: 'Acciones',
      width: 'minmax(152px, 1fr)',
      align: 'right',
      sticky: 'end',
      headerClassName: 'justify-end pr-3',
      cellClassName: 'justify-end pr-3 pl-1',
      cell: (item) => (
        <div className="ml-auto flex w-full items-center justify-end gap-1.5 transition-opacity">
          <button className="p-1 text-[var(--muted)] transition-all hover:scale-110 hover:text-[var(--accent)]" title="Ver Eventos" onClick={async (e) => {
            e.stopPropagation();
            try {
              const series = item.series?.length
                ? item.series
                : await ensureBoxSeriesLoaded(item);
              if (series.length > 0) {
                setShowTimeline({
                  box_id: item.realDbId,
                  box_code: item.box_code || item.id,
                  notes: series[0].notes,
                  guide_number: series[0].guia,
                  status: item.status,
                  agencia: series[0].agenciaCAC,
                });
              } else {
                notify.info('No hay eventos registrados para esta caja.');
              }
            } catch {
              notify.error('No se pudo cargar el historial de la caja');
            }
          }}>
            <History size={18} strokeWidth={2} />
          </button>

          <button className="p-1 text-[var(--muted)] transition-all hover:scale-110 hover:text-[var(--foreground)]" title="Imprimir Etiqueta" onClick={(e) => {
            e.stopPropagation();
            setShowPrintModal(item);
          }}>
            <Printer size={18} strokeWidth={2} />
          </button>

          <button className="p-1 text-[var(--muted)] transition-all hover:scale-110 hover:text-[var(--success)]" title="Despachar de Inventario" onClick={(e) => {
            e.stopPropagation();
            void openDispatchFlow(item, 'all');
          }}>
            <Truck size={18} strokeWidth={2} />
          </button>

          <button className="p-1 text-[var(--muted)] transition-all hover:scale-110 hover:text-[var(--warning)]" title="Transferir a Otra Bodega" onClick={(e) => {
            e.stopPropagation();
            setSelectedBoxesForTransfer([item.id]);
            setShowTransferModal(true);
          }}>
            <ArrowLeftRight size={18} strokeWidth={2} />
          </button>

          <button
            className={
              item.deletionStatus === 'pending_approval' || item.status === 'Pendiente Aprobación'
                ? 'cursor-not-allowed p-1 text-[var(--warning)] opacity-80'
                : 'p-1 text-[var(--muted)] transition-all hover:scale-110 hover:text-[var(--danger)]'
            }
            title={
              item.deletionStatus === 'pending_approval' || item.status === 'Pendiente Aprobación'
                ? 'Pendiente de autorización del Gerente General'
                : 'Solicitar eliminación (requiere autorización)'
            }
            disabled={item.deletionStatus === 'pending_approval' || item.status === 'Pendiente Aprobación'}
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteBox(item.id, item.realDbId);
            }}
          >
            <Trash2 size={18} strokeWidth={2} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <ModulePage
      title="Gestión de Bodega"
      category="Bodega"
      actions={
        <div className="flex flex-wrap gap-3">
          <Link href="/bodega/salida" className="inline-flex">
            <Button
              variant="outline"
              leftIcon={<PackageMinus className="w-4 h-4" />}
            >
              Bodega de Salida
            </Button>
          </Link>
          <Link href="/bodega/scraps" className="inline-flex">
            <Button
              variant="outline"
              leftIcon={<Trash2 className="w-4 h-4" />}
            >
              Bodega SCRAPS
            </Button>
          </Link>
          <Link href="/bodega/partes" className="inline-flex">
            <Button
              variant="outline"
              leftIcon={<PackageCheck className="w-4 h-4" />}
            >
              Bodega de Partes
            </Button>
          </Link>
          <Link href="/bodega/inventario" className="inline-flex">
            <Button 
              variant="outline" 
              leftIcon={<Search className="w-4 h-4" />}
            >
              Detalle de Inventario
            </Button>
          </Link>
          <Button 
            variant="outline" 
            leftIcon={<ArrowLeftRight className="w-4 h-4" />}
            onClick={() => setShowTransferModal(true)}
          >
            Transferencia Masiva
          </Button>
          <Button 
            variant="primary" 
            leftIcon={<Box className="w-4 h-4" />}
            onClick={() => {
              setDraftBoxId(null);
              setDraftBoxCode('');
              setTempSerials([]);
              setNewBoxStep('form');
              setNewBox({ correlativo: '', rack: '', marca: '', modelo: '', tecnologia: '', cantidad: 0 });
              setShowNewBoxModal(true);
              setNewBoxLastScannedInfo(null);
            }}
          >
            Ingresar Almacén TC Caja
          </Button>
        </div>
      }
    >
      <div className="space-y-8">
        <BoxDeletionApprovalsPanel enabled={isAdmin} />
        {useOutboundDispatchHex && (
          <DispatchBatchSelector
            selectedBatchId={selectedDispatchBatchId}
            onSelectBatch={(id, batchNumber) => {
              setSelectedDispatchBatchId(id);
              setSelectedDispatchBatchNumber(batchNumber ?? null);
            }}
          />
        )}

        {/* KPI Cards — totales globales (Equipos TC / OS), no la página actual */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-l-4 border-l-heading" padding="md">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-surface-hover p-3">
                <Box className="h-6 w-6 text-heading" />
              </div>
              <div>
                <p className="text-[10px] font-semibold tracking-wide text-[var(--muted)] uppercase">Total Cajas</p>
                <h3 className="text-2xl font-bold text-[var(--heading)]">
                  {warehouseTotals
                    ? warehouseTotals.total_boxes.toLocaleString()
                    : '—'}
                </h3>
                {!warehouseTotals && (
                  <p className="text-[9px] font-semibold text-[var(--muted)]">Cargando total global…</p>
                )}
              </div>
            </div>
          </Card>
          <Card className="border-l-4 border-l-accent" padding="md">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-accent/10 p-3">
                <QrCode className="h-6 w-6 text-accent" />
              </div>
              <div>
                <p className="text-[10px] font-semibold tracking-wide text-[var(--muted)] uppercase">Total Equipos TC</p>
                <h3 className="text-2xl font-bold text-[var(--heading)]">
                  {warehouseTotals
                    ? warehouseTotals.total_equipos.toLocaleString()
                    : '—'}
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
                <p className="text-[10px] font-semibold tracking-wide text-[var(--muted)] uppercase">Cajas Completas</p>
                <h3 className="text-2xl font-bold text-[var(--heading)]">
                  {warehouseTotals
                    ? warehouseTotals.cajas_completas.toLocaleString()
                    : '—'}
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
            onClick={resumeInProgressBoxes}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                resumeInProgressBoxes();
              }
            }}
            title="Clic para ver / reanudar cajas pendientes"
          >
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-warning/10 p-3">
                <TrendingUp className="h-6 w-6 text-warning" />
              </div>
              <div>
                <p className="text-[10px] font-semibold tracking-wide text-[var(--muted)] uppercase">Cajas en Proceso</p>
                <h3 className="text-2xl font-bold text-[var(--heading)]">
                  {warehouseTotals ? warehouseTotals.cajas_parciales.toLocaleString() : '—'}
                </h3>
                <p className="mt-0.5 text-[9px] font-semibold text-[var(--warning)]">Clic para reanudar pistoleo</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Cantidad por Tecnología */}
        {techStats.length > 0 && (
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Cpu className="h-4 w-4 text-accent" />
              <h3 className="text-[11px] font-semibold tracking-wide text-muted uppercase">
                Equipos TC por Tecnología
              </h3>
              {filterTech && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterTech('');
                    setFilterModel('');
                  }}
                  className="ml-auto text-[10px] font-semibold tracking-wide text-accent uppercase hover:underline"
                >
                  Limpiar filtro
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {techStats.map((t) => {
                const active = filterTech === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => {
                      setFilterTech(active ? '' : t.value);
                      setFilterModel('');
                    }}
                    className={`rounded-2xl border-2 p-4 text-left transition-all ${
                      active
                        ? 'border-[var(--accent)] shadow-sm'
                        : 'border-[var(--border)] hover:border-[var(--accent)]/40'
                    }`}
                    style={{
                      backgroundColor: active
                        ? 'color-mix(in srgb, var(--accent) 12%, var(--surface))'
                        : 'var(--surface)',
                      color: 'var(--foreground)',
                    }}
                    title={`Filtrar por ${t.label}`}
                  >
                    <p className="truncate text-[10px] font-semibold tracking-wide text-[var(--muted)] uppercase">
                      {t.label}
                    </p>
                    <h4 className="mt-1 text-2xl leading-tight font-bold text-[var(--heading)]">
                      {t.units.toLocaleString()}
                    </h4>
                    <p className="mt-0.5 text-[10px] font-semibold text-[var(--muted)]">
                      {t.boxes} {t.boxes === 1 ? 'caja' : 'cajas'} · equipos OS
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Inventory List */}
        <div className="space-y-6" ref={inventoryListRef}>
          <ModuleToolbar 
            onSearch={(val) => setSearchTerm(val)}
            searchPlaceholder="Buscar caja, serie u OS…"
            onExport={handleExportReport}
            onAdd={() => {
              setDraftBoxId(null);
              setDraftBoxCode('');
              setTempSerials([]);
              setNewBoxStep('form');
              setNewBox({ correlativo: '', rack: '', marca: '', modelo: '', tecnologia: '', cantidad: 0 });
              setShowNewBoxModal(true);
              setNewBoxLastScannedInfo(null);
            }}
            addLabel="Ingresar Almacén TC Caja"
            onFilter={() => setShowAdvancedFilters(!showAdvancedFilters)}
            filters={
              showAdvancedFilters && (
                <div className="flex flex-wrap gap-2 animate-in fade-in zoom-in duration-200">
                  <select 
                    value={filterTech} 
                    onChange={(e) => {
                      setFilterTech(e.target.value);
                      setFilterModel('');
                    }}
                    className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-accent"
                  >
                    <option value="">Todas las Tecnologías</option>
                    {catTecnologias.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <select
                    value={filterModel}
                    onChange={(e) => setFilterModel(e.target.value)}
                    disabled={!filterTech}
                    title={!filterTech ? 'Primero elija una tecnología' : 'Filtrar por modelo'}
                    className="h-10 min-w-[10rem] rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">
                      {!filterTech ? 'Elija tecnología…' : 'Todos los modelos'}
                    </option>
                    {modelFilterOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <select 
                    value={filterStatus} 
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-accent"
                  >
                    <option value="">Todos los Estatus</option>
                    <option value="Full">Cajas Completas</option>
                    <option value="Partial">Cajas en Proceso</option>
                  </select>
                  {(filterTech || filterModel || filterStatus) && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilterTech('');
                        setFilterModel('');
                        setFilterStatus('');
                      }}
                      className="h-10 px-3 text-[10px] font-black tracking-widest text-[var(--muted)] uppercase hover:text-[var(--heading)]"
                    >
                      Limpiar filtros
                    </button>
                  )}
                </div>
              )
            }
          />

          {selectedBoxIds.length > 0 && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--foreground)] p-4 rounded-2xl shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
              <span className="text-sm font-bold self-center sm:ml-2">
                {selectedBoxIds.length} {selectedBoxIds.length === 1 ? 'caja seleccionada' : 'cajas seleccionadas'}
              </span>
              <div className="flex flex-col sm:flex-row items-stretch gap-3">
                <Button
                  variant="primary"
                  className="font-black uppercase text-[10px] tracking-widest"
                  leftIcon={<MapPin className="w-4 h-4" />}
                  onClick={() => {
                    setRackNum('');
                    setRackNivel('');
                    setRackPosicion('');
                    setShowBulkRackModal(true);
                  }}
                >
                  Asignar Ubicación Masiva
                </Button>
                <Button
                  variant="outline"
                  className="font-black uppercase text-[10px] tracking-widest"
                  onClick={() => setSelectedBoxIds([])}
                >
                  Limpiar selección
                </Button>
              </div>
            </div>
          )}

          <Card padding="none" className="overflow-hidden border-2 border-border shadow-sm">
            <DataTable
              columns={inventoryColumns}
              data={inventoryPageItems}
              getRowId={(item) => item.id}
              onRowClick={(item) => void openBoxDetail(item)}
              rowHeight={44}
              compact
              maxBodyHeight={720}
              minWidth={1100}
              headerClassName="border-b border-[var(--sidebar)] bg-[var(--sidebar)]"
              headerTextClassName="text-[var(--sidebar-foreground)]/80"
              emptyMessage="No hay cajas en inventario"
            />
            <TablePagination
              totalCount={inventoryTotalCount}
              page={inventorySafePage}
              totalPages={inventoryTotalPages}
              startItem={inventoryStartItem}
              endItem={inventoryEndItem}
              pageSize={BODEGA_GESTION_PAGE_SIZE}
              onPageChange={onInventoryPageChange}
              itemLabel={hasNextPage ? 'cajas (cargadas)' : 'cajas'}
            />
            {hasNextPage && (
              <div className="px-4 pb-4 flex flex-col items-center gap-2 border-t border-slate-100 bg-slate-50/30">
                <Button
                  variant="outline"
                  onClick={() => {
                    queueMicrotask(() => {
                      void fetchNextPage();
                    });
                  }}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? 'Cargando más...' : 'Cargar más cajas del servidor'}
                </Button>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                  Hay más registros; cargue o avance de página para traerlos
                </span>
              </div>
            )}
          </Card>
        </div>

        {deleteAuthTarget && (
          <DeleteBoxAuthorizationModal
            boxLabel={deleteAuthTarget.label}
            submitting={deleteAuthSubmitting}
            onCancel={() => setDeleteAuthTarget(null)}
            onSubmit={submitDeleteAuthorization}
          />
        )}

        {/* Modal Nueva Caja */}
        {showNewBoxModal && (
          <NewBoxModal
            newBox={newBox}
            setNewBox={setNewBox}
            newBoxStep={newBoxStep}
            setNewBoxStep={setNewBoxStep}
            catTecnologias={catTecnologias}
            catMarcas={catMarcas}
            catModelos={catModelos}
            loading={loading}
            tempSerials={tempSerials}
            setTempSerials={setTempSerials}
            currentSN={currentSN}
            setCurrentSN={setCurrentSN}
            isSavingNewBox={isSavingNewBox}
            onScanSubmit={handleScanForNewBox}
            onAddBox={handleAddBox}
            onClose={async () => {
              setShowNewBoxModal(false);
              setNewBoxLastScannedInfo(null);
              if (draftBoxId && tempSerials.length > 0) {
                notify.info('Pistoleo queda en servidor', {
                  description: `${draftBoxCode || 'TMP'} guardado en EN_PROCESO. Reanude desde «Cajas en Proceso».`,
                });
                await queryClient.invalidateQueries({ queryKey: ['warehouse-stats'] });
                await refetch();
              } else if (!draftBoxId) {
                resetNewBoxSession();
              }
            }}
            onNext={() => {
              if (!newBox.tecnologia || !newBox.marca || !newBox.modelo || !newBox.cantidad || loading) return;
              setNewBox((prev) => ({ ...prev, correlativo: draftBoxCode || '' }));
              setNewBoxStep('scanning');
            }}
          />
        )}

        {/* Modal Detalle / Cierre de Caja (Ingreso Inteligente) */}
        {selectedBox && (
          <DetalleCajaModal
            selectedBox={selectedBox}
            loadingSeries={loadingBoxDetail}
            catMarcas={catMarcas}
            catModelos={catModelos}
            catTecnologias={catTecnologias}
            currentSN={currentSN}
            setCurrentSN={setCurrentSN}
            lastScannedInfo={lastScannedInfo}
            onAddSN={handleAddSN}
            onClose={() => { setSelectedBox(null); setLastScannedInfo(null); }}
            onShowTimeline={(item) => setShowTimeline({
              box_id: selectedBox.realDbId,
              box_code: selectedBox.box_code || selectedBox.id,
              notes: item.notes,
              guide_number: item.guia,
              status: item.estatus
            })}
            onRemoveUnit={async (item) => {
              if (await confirmDialog({ title: 'Remover unidad', message: '¿Está seguro de remover esta unidad de la caja?', tone: 'error', confirmText: 'Remover' })) {
                const seriesToRemove = item.allSeries && item.allSeries.length > 0 ? item.allSeries : [item.sn || item.s1];

                const supabase = getSupabaseBrowserClient();
                if (supabase) {
                  await supabase.from('series').update({ current_box_id: null, current_status: 'RECEPCIONADO_BODEGA_GENERAL' }).in('serial_number', seriesToRemove);
                }

                const updatedSeries = selectedBox.series.filter((s: any) => s.sn !== (item.sn || item.s1));
                const equipos = new Set(
                  updatedSeries.map((s: any) => s.service_orders?.id || s.ordenServicio || s.sn || s.serial_number)
                ).size;
                const updatedBox = {
                  ...selectedBox,
                  series: updatedSeries,
                  unitCount: equipos,
                  status: resolveBoxDisplayStatus(equipos, Number(selectedBox.cantidad || 0)),
                };

                if (updatedSeries.length === 0) {
                  if (supabase && selectedBox.realDbId) {
                    await supabase.from('boxes').update({ rack_location: 'ELIMINADO' }).eq('id', selectedBox.realDbId);
                    boxSeriesCache.current.delete(selectedBox.realDbId);
                  }
                  setSelectedBox(null);
                  await refreshWarehouseLists();
                } else {
                  setSelectedBox(updatedBox);
                  if (selectedBox.realDbId) {
                    boxSeriesCache.current.set(selectedBox.realDbId, updatedSeries);
                  }
                  await refreshWarehouseLists();
                }
              }
            }}
          />
        )}

        {/* Modal Transferencia Masiva */}
        {showTransferModal && (
          <TransferModal
            inventory={inventory}
            catMarcas={catMarcas}
            catModelos={catModelos}
            selectedBoxesForTransfer={selectedBoxesForTransfer}
            setSelectedBoxesForTransfer={setSelectedBoxesForTransfer}
            transferScanInput={transferScanInput}
            setTransferScanInput={setTransferScanInput}
            destinationArea={destinationArea}
            setDestinationArea={setDestinationArea}
            onScanSubmit={handleScanForTransfer}
            onExecute={handleExecuteTransfer}
            onClose={() => setShowTransferModal(false)}
            executing={transferExecuting}
          />
        )}
      </div>
      {/* MODAL DE TRAZABILIDAD (TIMELINE) */}
      {showTimeline && (
        <TimelineModal
          box={showTimeline}
          loadingBoxHistory={loadingBoxHistory}
          boxHistoryData={boxHistoryData}
          timelineGuideDetails={timelineGuideDetails}
          catMarcas={catMarcas}
          catModelos={catModelos}
          onClose={() => setShowTimeline(null)}
        />
      )}

      {/* PRINT OPTIONS MODAL */}
      {showPrintModal && (
        <PrintBoxModal
          box={showPrintModal}
          onClose={() => setShowPrintModal(null)}
          onPrint={(mode) => { printBoxLabel(showPrintModal, mode); setShowPrintModal(null); }}
        />
      )}
      {/* EDIT RACK MODAL */}
      {showRackModal && (
        <RackModal
          box={showRackModal}
          rackNum={rackNum}
          setRackNum={setRackNum}
          rackNivel={rackNivel}
          setRackNivel={setRackNivel}
          rackPosicion={rackPosicion}
          setRackPosicion={setRackPosicion}
          loading={loading}
          onClose={() => setShowRackModal(null)}
          onSave={handleUpdateRack}
        />
      )}

      {/* BULK RACK MODAL (Ubicación Masiva) */}
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
          loading={loading}
          onClose={() => setShowBulkRackModal(false)}
          onSave={handleBulkUpdateRack}
        />
      )}

      {/* Modal Despacho */}
        {showDispatchModal && (
          <DispatchModal
            box={showDispatchModal}
            dispatchMode={dispatchMode}
            setDispatchMode={setDispatchMode}
            loadingSeries={loadingDispatchSeries}
            useOutboundDispatchHex={useOutboundDispatchHex}
            selectedDispatchBatchId={selectedDispatchBatchId}
            selectedDispatchBatchNumber={selectedDispatchBatchNumber}
            dispatchAction={dispatchAction}
            setDispatchAction={setDispatchAction}
            selectedSeriesForDispatch={selectedSeriesForDispatch}
            setSelectedSeriesForDispatch={setSelectedSeriesForDispatch}
            dispatchDestination={dispatchDestination}
            dispatchNotes={dispatchNotes}
            setDispatchNotes={setDispatchNotes}
            dispatchArea={dispatchArea}
            setDispatchArea={setDispatchArea}
            isDispatching={isDispatching}
            onClose={() => {
              setShowDispatchModal(null);
              setDispatchDestination('');
              setDispatchNotes('');
              setSelectedSeriesForDispatch([]);
              setDispatchAction('despacho');
              setDispatchMode('all');
            }}
            onConfirm={() => handleDispatchBox(showDispatchModal.id, showDispatchModal.realDbId)}
          />
        )}
    </ModulePage>
  );
}
