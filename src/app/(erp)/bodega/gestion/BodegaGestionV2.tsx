"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Card, Badge, Button, DataTable, type DataTableColumn, notify, confirmDialog } from '@/components/ui';
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
  PackageMinus
} from 'lucide-react';
import { getInventoryBoxes, transferBoxesToArea, transferBoxesToAreaInBatches, createBodegaBoxAtomic, reserveNextBoxCode, addSeriesToBox, dispatchBoxFromWarehouse, dispatchSpecificSeries, transferSpecificSeriesToArea, canScanSeriesIntoWarehouse, resolveBoxDisplayStatus, getBoxHistory } from '@/modules/inventario/client/warehouseBoxes';
import { DispatchBatchSelector } from '@/modules/outbound-dispatch/components/DispatchBatchSelector';
import { isHexagonalOutboundDispatchEnabled } from '@/modules/outbound-dispatch';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useReferenceCatalogs } from '@/hooks/useReferenceCatalogs';
import { PrintBoxModal } from './components/PrintBoxModal';
import { RackModal } from './components/RackModal';
import { TimelineModal } from './components/TimelineModal';
import { DispatchModal } from './components/DispatchModal';
import { TransferModal } from './components/TransferModal';
import { NewBoxModal } from './components/NewBoxModal';
import { DetalleCajaModal } from './components/DetalleCajaModal';
import { fetchBoxSeriesUi } from '@/modules/inventario/client/warehouseBoxSeries';
import { formatWarehouseBoxId } from '@/modules/inventario/client/warehouseBoxDisplay';
import { RECEPTION_TIMELINE_SELECT } from '@/shared/constants/dbProjections';

function isWarehouseSummaryMissingError(message: unknown): boolean {
  const text = String(message ?? '');
  return text.includes('warehouse_box_summary') && text.includes('schema cache');
}

export default function BodegaGestionV2({
  onRequireMigration,
}: {
  onRequireMigration?: () => void;
}) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
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
  const [searchTerm, setSearchTerm] = useState('');
  // C5: filtrado de inventario sobre término debounced (input fluido).
  const debouncedSearch = useDebouncedValue(searchTerm, 250);
  const [showNewBoxModal, setShowNewBoxModal] = useState(false);
  const [selectedBox, setSelectedBox] = useState<any | null>(null);
  const [loadingBoxDetail, setLoadingBoxDetail] = useState(false);
  const [loading, setLoading] = useState(false);
  const { 
    data: boxesData, 
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage, 
    isLoading: isBoxesLoading,
    refetch 
  } = useInfiniteQuery({
    queryKey: ['warehouse-boxes', debouncedSearch],
    queryFn: async ({ pageParam }) => {
      const url = new URL('/api/v1/warehouse/boxes', window.location.origin);
      if (pageParam) url.searchParams.set('cursor', pageParam as string);
      url.searchParams.set('limit', '30');
      if (debouncedSearch) url.searchParams.set('search', debouncedSearch);

      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = await supabase?.auth.getSession() || { data: { session: null } };
      const token = session?.access_token;

      const res = await fetch(url.toString(), {
        credentials: 'same-origin'
      });
      const data = await res.json();
      if (!res.ok || data.error) {
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
        let capacity = item.cantidad || item.capacity || item.unitCount || 0;
        const series = await ensureBoxSeriesLoaded(item);
        setSelectedBox({
          ...item,
          cantidad: capacity || series.length || item.unitCount || 1,
          series,
          unitCount: series.length || item.unitCount || 0,
          status: resolveBoxDisplayStatus(series.length, capacity || series.length || 1),
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
        const series = await ensureBoxSeriesLoaded(item);
        setShowDispatchModal({ ...item, series, unitCount: item.unitCount ?? series.length });

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
    return (boxesData?.pages || []).flatMap(p => p.items || []).map((b: any) => {
       const boxCode = b.label || '';
       const boxIdFmt = formatWarehouseBoxId(boxCode, b.box_id);
       const tecnologiaId = b.technology_id ?? (b.sample_model_id ? techIdByModelId.get(b.sample_model_id) : undefined);

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
         cantidad: b.capacity || 0,
         unitCount: b.series_count || 0,
         status: resolveBoxDisplayStatus(b.series_count || 0, b.capacity || b.series_count || 1),
         series: [] as any[],
         fechaIngreso: new Date(b.created_at || Date.now()).toLocaleString(),
         tecnologiaId,
         tecnologia: b.tech_name || techNameForModel(b.sample_model_id),
         usuarioIngreso: 'Admin User'
       };
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

  // Advanced Filters State
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterTech, setFilterTech] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Selección múltiple de cajas (para ubicación masiva)
  const [selectedBoxIds, setSelectedBoxIds] = useState<string[]>([]);
  const [showBulkRackModal, setShowBulkRackModal] = useState(false);

  const toggleBoxSelection = (id: string) => {
    setSelectedBoxIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      if (filterTech && item.tecnologiaId !== filterTech) return false;

      const isFull = item.status === 'Full';
      if (filterStatus === 'Full' && !isFull) return false;
      if (filterStatus === 'Partial' && item.status !== 'Parcial') return false;

      if (!debouncedSearch) return true;
      const term = debouncedSearch.toLowerCase();
      const marcaName = brandName(item.marca);
      const modeloName = modelName(item.modelo);
      const techLabel = item.tecnologia || '---';
      const rackName = item.rack || '';
      const idName = String(item.id || '');
      return (
        idName.toLowerCase().includes(term) ||
        marcaName.toLowerCase().includes(term) ||
        modeloName.toLowerCase().includes(term) ||
        techLabel.toLowerCase().includes(term) ||
        rackName.toLowerCase().includes(term)
      );
    });
  }, [inventory, filterTech, filterStatus, debouncedSearch, brandName, modelName]);

  const { data: statsData } = useQuery({
    queryKey: ['warehouse-stats'],
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = await supabase?.auth.getSession() || { data: { session: null } };
      const token = session?.access_token;

      const res = await fetch('/api/v1/warehouse/stats', {
        credentials: 'same-origin'
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        notify.error('API Error', { description: JSON.stringify(data.error || 'Fetch stats failed') });
        throw new Error(data.error || 'Failed to fetch stats');
      }
      return data.stats || [];
    }
  });

  const techStats = useMemo((): { value: string; label: string; boxes: number; units: number }[] => {
    return (statsData || []).map((s: any) => ({
      value: s.technology_id,
      label: s.tech_name || techName(s.technology_id),
      boxes: s.total_boxes,
      units: s.total_units
    }));
  }, [statsData, techName]);

  const handleExportReport = () => {
    window.open('/api/v1/warehouse/boxes/export', '_blank');
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
            const res = await transferSpecificSeriesToArea(realDbId || boxId, selectedSeriesForDispatch, dispatchArea, 'Admin User');
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
          const res = await dispatchSpecificSeries(
            realDbId || boxId,
            selectedSeriesForDispatch,
            dispatchDestination,
            dispatchNotes,
            batchId
          );
          error = res.error;
        }
      }
      
      if (error) {
        notify.error('Error despachando', { description: String(error) });
      } else {
        notify.success(dispatchAction === 'despacho' ? 'Despacho registrado' : 'Traslado registrado');
        await refreshWarehouseLists();
        if (dispatchAction === 'traslado' && dispatchArea === 'Diagnóstico') {
          await queryClient.invalidateQueries({ queryKey: ['workshop-tab-counts'] });
        }
        setShowDispatchModal(null);
        setSelectedBox(null);
        setDispatchDestination('');
        setDispatchNotes('');
        setSelectedSeriesForDispatch([]);
        setDispatchMode('all');
        setDispatchAction('despacho');
      }
    } catch (err) {
      console.error(err);
      notify.error("Error inesperado al despachar.");
    }
    setIsDispatching(false);
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

  // Mass Transfer State
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedBoxesForTransfer, setSelectedBoxesForTransfer] = useState<string[]>([]);
  const [targetRack, setTargetRack] = useState('');
  const [transferScanInput, setTransferScanInput] = useState('');
  const [destinationArea, setDestinationArea] = useState('Bodega Central');
  const [transferExecuting, setTransferExecuting] = useState(false);

  const handleAddBox = async () => {
    if (isSavingNewBox) return;
    setIsSavingNewBox(true);
    setLoading(true);

    try {
      if (tempSerials.length === 0) {
        notify.warning("Debe escanear al menos una serie para poder guardar la caja.");
        return;
      }

      if (!tempSerials[0]?.reception_id) {
        notify.warning('Serie sin recepción de origen', { description: 'Verifique clasificación en Backoffice.' });
        return;
      }

      const seriesNumbers = tempSerials.flatMap((s) => (s.allSeries && s.allSeries.length > 0) ? s.allSeries : [s.sn]);
      const result = await createBodegaBoxAtomic({
        receptionId: tempSerials[0].reception_id,
        brandId: newBox.marca,
        modelId: newBox.modelo,
        capacity: newBox.cantidad,
        rackLocation: newBox.rack || 'P-01',
        serialNumbers: seriesNumbers,
        boxCode: newBox.correlativo?.match(/^BOX-[0-9]+$/i) ? newBox.correlativo : null,
      });

      if (result.error) {
        notify.error('Error al guardar la caja', { description: result.error });
        return;
      }

      await fetchBoxes(true);
      setShowNewBoxModal(false);
      setNewBoxStep('form');
      setTempSerials([]);
      setNewBoxLastScannedInfo(null);
      setNewBox({ correlativo: '', rack: '', marca: '', modelo: '', tecnologia: '', cantidad: 0 });
    } finally {
      setIsSavingNewBox(false);
      setLoading(false);
    }
  };

  const handleScanForNewBox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSN) return;
    if (tempSerials.length >= newBox.cantidad) return notify.warning("Cantidad completada");

    if (tempSerials.find(s => s.sn === currentSN)) return notify.warning("Serie ya escaneada");

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const { data: mainSeries, error } = await supabase
      .from('series')
      .select(`
        *,
        receptions (*),
        service_orders (id, os_label, reentry_count)
      `)
      .eq('serial_number', currentSN)
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
        notify.warning(`La serie ${currentSN} ya está ingresada en Bodega General.`);
      } else {
        notify.warning(`El equipo ${currentSN} no está listo para ingreso a almacén`, {
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
    if (!currentSN || !selectedBox) return;
    
    if (selectedBox.series.find((s: any) => s.sn === currentSN)) return notify.warning("Serie ya escaneada en esta caja");

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
      .eq('serial_number', currentSN)
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
        notify.warning(`La serie ${currentSN} ya está ingresada en Bodega General.`);
      } else {
        notify.warning(`El equipo ${currentSN} no está listo para ingreso a almacén`, {
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

    const updatedBox = {
      ...selectedBox,
      series: [info, ...selectedBox.series],
      unitCount: (selectedBox.series?.length || 0) + 1,
      status: resolveBoxDisplayStatus(
        (selectedBox.series?.length || 0) + 1,
        selectedBox.cantidad || selectedBox.unitCount || 1
      ),
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
    if (!(await confirmDialog({ title: 'Eliminar caja', message: '¿Eliminar esta caja y TODO su contenido (series y órdenes de servicio asociadas)? Esta acción no se puede deshacer.', tone: 'error', confirmText: 'Eliminar' }))) return;

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      
      const { data: seriesInBox } = await supabase.from('series').select('id, service_order_id, current_reception_id').eq('current_box_id', realDbId);
      
      if (seriesInBox && seriesInBox.length > 0) {
        const osIds = Array.from(new Set(seriesInBox.map((s: any) => s.service_order_id).filter(Boolean)));
        const receptionIds = Array.from(new Set(seriesInBox.map((s: any) => s.current_reception_id).filter(Boolean)));
        const seriesIds = seriesInBox.map((s: any) => s.id);
        
        await supabase.from('series').delete().in('id', seriesIds);
        
        if (osIds.length > 0) {
          await supabase.from('service_orders').delete().in('id', osIds);
        }

        if (receptionIds.length > 0) {
          await supabase.from('receptions').update({ status: 'ELIMINADO POR BODEGA' }).in('id', receptionIds);
        }
      }
      
      await supabase.from('boxes').update({ rack_location: 'ELIMINADO' }).eq('id', realDbId);
      boxSeriesCache.current.delete(realDbId);
      await refreshWarehouseLists();
    } catch (err) {
      console.error("Error al eliminar caja:", err);
      notify.error("Error al intentar eliminar la caja y sus series.");
    }
  };

  const handleUpdateRack = async () => {
    if (!showRackModal) return;
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    
    // Format the final string
    const rn = rackNum.trim() || 'S/N';
    const rnl = rackNivel.trim() || '0';
    const rp = rackPosicion.trim() || 'S/P';
    const finalRack = `RACK-${rn} - NIVEL-${rnl} - POSICION-${rp}`.toUpperCase();
    
    if (supabase) {
      const realId = showRackModal.realDbId || showRackModal.id;
      const { error } = await supabase.from('boxes').update({ rack_location: finalRack }).eq('id', realId);
      if (error) {
        notify.error('Error al actualizar la ubicación', { description: error.message });
      } else {
        await fetchBoxes(true);
      }
    }
    setShowRackModal(null);
    setLoading(false);
  };

  const handleBulkUpdateRack = async () => {
    if (selectedBoxIds.length === 0) return;
    setLoading(true);
    const supabase = getSupabaseBrowserClient();

    const rn = rackNum.trim() || 'S/N';
    const rnl = rackNivel.trim() || '0';
    const rp = rackPosicion.trim() || 'S/P';
    const finalRack = `RACK-${rn} - NIVEL-${rnl} - POSICION-${rp}`.toUpperCase();

    if (supabase) {
      const realIds = selectedBoxIds.map((id) => {
        const box = inventory.find((b) => b.id === id);
        return box ? box.realDbId || box.id : id;
      });
      const { error } = await supabase.from('boxes').update({ rack_location: finalRack }).in('id', realIds);
      if (error) {
        notify.error('Error al actualizar ubicaciones', { description: error.message });
      } else {
        await fetchBoxes(true);
        notify.success('Ubicación asignada', {
          description: `${selectedBoxIds.length} ${selectedBoxIds.length === 1 ? 'caja' : 'cajas'} → ${finalRack}.`,
        });
        setSelectedBoxIds([]);
      }
    }
    setShowBulkRackModal(false);
    setLoading(false);
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

  const pageBoxIds = filteredInventory.map((b: any) => b.id);
  const allPageSelected = pageBoxIds.length > 0 && pageBoxIds.every((id: string) => selectedBoxIds.includes(id));

  const inventoryColumns: DataTableColumn<any>[] = [
    {
      id: 'select',
      width: '44px',
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
      width: '160px',
      cell: (item) => (
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="text-sm font-black text-[#181c3a] font-mono truncate max-w-[140px]"
            title={item.isLegacyBoxCode ? item.displayIdFull : item.displayId}
          >
            {item.displayId}
          </span>
          {item.isLegacyBoxCode && (
            <span className="shrink-0 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-amber-100 text-amber-800 border border-amber-200">
              LEGACY
            </span>
          )}
          {item.fuente && (
            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${item.fuente === 'CAC' ? 'bg-[#181c3a] text-white' : 'bg-[#2ec4f1] text-[#181c3a]'}`}>
              {item.fuente}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'fechaIngreso',
      header: 'Fecha Ingreso',
      width: '120px',
      cellClassName: 'text-[10px] font-bold text-slate-700',
      cell: (item) => item.fechaIngreso,
    },
    {
      id: 'tecnologia',
      header: 'Tecnología',
      width: '110px',
      cellClassName: 'text-[10px] font-bold text-cyan-800',
      cell: (item) => item.tecnologia || '---',
    },
    {
      id: 'usuario',
      header: 'Usuario Ingreso',
      width: '120px',
      cellClassName: 'text-[10px] font-bold text-slate-700',
      cell: (item) => (item.usuarioIngreso || 'SISTEMA').split('@')[0],
    },
    {
      id: 'ubicacion',
      header: 'Ubicación / Área',
      width: '180px',
      cell: (item) => (
        <div
          className="flex flex-col group/loc cursor-pointer w-fit"
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
          title="Cambiar Ubicación de la Caja"
        >
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-3.5 h-3.5 text-[#2ec4f1] group-hover/loc:text-amber-500 transition-colors" />
            {(() => {
              const r = item.rack || '';
              if (r === 'SIN RACK' || !r) {
                return <span className="text-xs font-bold text-slate-600">Sin Asignar</span>;
              }
              const parts = r.split(' - ').map((p: string) => p.replace('RACK-', '').replace('NIVEL-', '').replace('POSICION-', ''));
              return (
                <div className="flex gap-1">
                  {parts.map((p: string, idx: number) => (
                    <span key={idx} className="px-1.5 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-black rounded-md border border-slate-200">
                      {p}
                    </span>
                  ))}
                </div>
              );
            })()}
            <Pencil className="w-3 h-3 text-slate-300 opacity-0 group-hover/loc:opacity-100 transition-opacity" />
          </div>
          <span className="text-[9px] font-black uppercase text-slate-600 mt-0.5">
            {item.area || 'Sin Área'}
          </span>
        </div>
      ),
    },
    {
      id: 'marcaModelo',
      header: 'Marca / Modelo',
      width: '140px',
      cell: (item) => (
        <div className="flex flex-col">
          <span className="text-xs font-bold text-slate-700">
            {item.marcaLabel || brandName(item.marca)}
          </span>
          <span className="text-[10px] font-medium text-slate-600">
            {item.modeloLabel || modelName(item.modelo)}
          </span>
        </div>
      ),
    },
    {
      id: 'cantidad',
      header: 'Cantidad',
      width: '140px',
      cell: (item) => (
        <div className="flex items-center gap-2">
          <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${item.status === 'Full' ? 'bg-[#2ec4f1]' : 'bg-amber-400'}`}
              style={{ width: `${Math.min(((item.unitCount || item.series?.length || 0) / Math.max(item.cantidad || 1, 1)) * 100, 100)}%` }}
            />
          </div>
          <span className="text-xs font-bold text-slate-700">
            {item.unitCount ?? item.series?.length ?? 0}
            {item.cantidad ? ` / ${item.cantidad}` : ''}
          </span>
        </div>
      ),
    },
    {
      id: 'estatus',
      header: 'Estatus',
      width: '110px',
      cell: (item) => (
        <Badge variant={item.status === 'Full' ? 'green' : item.status === 'Parcial' ? 'yellow' : 'default'}>{item.status}</Badge>
      ),
    },
    {
      id: 'acciones',
      header: 'Acciones',
      width: '210px',
      align: 'right',
      cell: (item) => (
        <div className="flex items-center justify-end gap-4 transition-opacity">
          <button className="text-slate-400 hover:text-[#2ec4f1] transition-all hover:scale-110" title="Ver Eventos" onClick={async (e) => {
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
            <History size={22} strokeWidth={2} />
          </button>

          <button className="text-slate-400 hover:text-slate-700 transition-all hover:scale-110" title="Imprimir Etiqueta" onClick={(e) => {
            e.stopPropagation();
            setShowPrintModal(item);
          }}>
            <Printer size={22} strokeWidth={2} />
          </button>

          <button className="text-slate-400 hover:text-emerald-500 transition-all hover:scale-110" title="Despachar de Inventario" onClick={(e) => {
            e.stopPropagation();
            void openDispatchFlow(item, 'all');
          }}>
            <Truck size={22} strokeWidth={2} />
          </button>

          <button className="text-slate-400 hover:text-amber-500 transition-all hover:scale-110" title="Transferir a Otra Bodega" onClick={(e) => {
            e.stopPropagation();
            setSelectedBoxesForTransfer([item.id]);
            setShowTransferModal(true);
          }}>
            <ArrowLeftRight size={22} strokeWidth={2} />
          </button>

          <button
            className="text-slate-400 hover:text-rose-500 transition-all hover:scale-110"
            title="Eliminar Caja"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteBox(item.id, item.realDbId);
            }}
          >
            <Trash2 size={22} strokeWidth={2} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <ModulePage
      title="Gestión de Bodega"
      subtitle="Control de racks, cajas homogéneas y movimientos de inventario de alta capacidad (+400K)."
      category="Bodega"
      actions={
        <div className="flex gap-3">
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
        {useOutboundDispatchHex && (
          <DispatchBatchSelector
            selectedBatchId={selectedDispatchBatchId}
            onSelectBatch={(id, batchNumber) => {
              setSelectedDispatchBatchId(id);
              setSelectedDispatchBatchNumber(batchNumber ?? null);
            }}
          />
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="border-l-4 border-l-[#181c3a]" padding="md">
            <div className="flex items-center gap-4">
              <div className="bg-[#181c3a]/5 p-3 rounded-2xl">
                <Box className="w-6 h-6 text-[#181c3a]" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Total Cajas</p>
                <h3 className="text-2xl font-black text-[#181c3a]">
                  {inventory.length}
                </h3>
              </div>
            </div>
          </Card>
          <Card className="border-l-4 border-l-[#2ec4f1]" padding="md">
            <div className="flex items-center gap-4">
              <div className="bg-blue-50 p-3 rounded-2xl">
                <QrCode className="w-6 h-6 text-[#2ec4f1]" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Total Unidades</p>
                <h3 className="text-2xl font-black text-[#181c3a]">
                  {inventory.reduce((sum, b) => sum + (b.unitCount ?? b.series?.length ?? 0), 0).toLocaleString()}
                </h3>
              </div>
            </div>
          </Card>
          <Card className="border-l-4 border-l-emerald-500" padding="md">
            <div className="flex items-center gap-4">
              <div className="bg-emerald-50 p-3 rounded-2xl">
                <PackageCheck className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Cajas Completas</p>
                <h3 className="text-2xl font-black text-[#181c3a]">
                  {inventory.filter(b => b.status === 'Full').length}
                </h3>
              </div>
            </div>
          </Card>
          <Card className="border-l-4 border-l-amber-500" padding="md">
            <div className="flex items-center gap-4">
              <div className="bg-amber-50 p-3 rounded-2xl">
                <TrendingUp className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">Cajas en Proceso</p>
                <h3 className="text-2xl font-black text-[#181c3a]">
                  {inventory.filter(b => b.status === 'Parcial').length}
                </h3>
              </div>
            </div>
          </Card>
        </div>

        {/* Cantidad por Tecnología */}
        {techStats.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Cpu className="w-4 h-4 text-[#2ec4f1]" />
              <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-600">
                Unidades por Tecnología
              </h3>
              {filterTech && (
                <button
                  type="button"
                  onClick={() => setFilterTech('')}
                  className="ml-auto text-[10px] font-black uppercase tracking-widest text-[#2ec4f1] hover:underline"
                >
                  Limpiar filtro
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {techStats.map((t) => {
                const active = filterTech === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setFilterTech(active ? '' : t.value)}
                    className={`text-left p-4 rounded-2xl border-2 transition-all ${
                      active
                        ? 'border-[#2ec4f1] bg-blue-50/60 shadow-sm'
                        : 'border-slate-100 bg-white hover:border-slate-200'
                    }`}
                    title={`Filtrar por ${t.label}`}
                  >
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 truncate">
                      {t.label}
                    </p>
                    <h4 className="text-2xl font-black text-[#181c3a] leading-tight mt-1">
                      {t.units.toLocaleString()}
                    </h4>
                    <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                      {t.boxes} {t.boxes === 1 ? 'caja' : 'cajas'}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Inventory List */}
        <div className="space-y-6">
          <ModuleToolbar 
            onSearch={(val) => setSearchTerm(val)}
            onExport={handleExportReport}
            onAdd={() => {
              setShowNewBoxModal(true);
              setNewBoxLastScannedInfo(null);
            }}
            addLabel="Ingresar Almacén TC Caja"
            onFilter={() => setShowAdvancedFilters(!showAdvancedFilters)}
            filters={
              showAdvancedFilters && (
                <div className="flex gap-2 animate-in fade-in zoom-in duration-200">
                  <select 
                    value={filterTech} 
                    onChange={(e) => setFilterTech(e.target.value)}
                    className="h-10 px-3 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-[#2ec4f1]"
                  >
                    <option value="">Todas las Tecnologías</option>
                    {catTecnologias.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <select 
                    value={filterStatus} 
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="h-10 px-3 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-[#2ec4f1]"
                  >
                    <option value="">Todos los Estatus</option>
                    <option value="Full">Cajas Completas</option>
                    <option value="Partial">Cajas en Proceso</option>
                  </select>
                </div>
              )
            }
          />

          {selectedBoxIds.length > 0 && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#181c3a] text-white p-4 rounded-2xl shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
              <span className="text-sm font-bold self-center sm:ml-2">
                {selectedBoxIds.length} {selectedBoxIds.length === 1 ? 'caja seleccionada' : 'cajas seleccionadas'}
              </span>
              <div className="flex flex-col sm:flex-row items-stretch gap-3">
                <Button
                  variant="primary"
                  className="bg-[#2ec4f1] text-[#181c3a] hover:bg-[#2ec4f1]/90 font-black uppercase text-[10px] tracking-widest"
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
                  className="border-white/20 text-white hover:bg-white/10 font-black uppercase text-[10px] tracking-widest"
                  onClick={() => setSelectedBoxIds([])}
                >
                  Limpiar selección
                </Button>
              </div>
            </div>
          )}

          <Card padding="none" className="overflow-hidden border-2 border-slate-100 shadow-sm">
            <DataTable
              columns={inventoryColumns}
              data={filteredInventory}
              getRowId={(item) => item.id}
              onRowClick={(item) => void openBoxDetail(item)}
              rowHeight={72}
              maxBodyHeight={720}
              minWidth={1334}
              headerClassName="bg-[#181c3a] border-b border-[#181c3a]"
              headerTextClassName="text-white/80"
              emptyMessage="No hay cajas en inventario"
            />
            {hasNextPage && (
              <div className="p-4 flex justify-center">
                <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                  {isFetchingNextPage ? 'Cargando más...' : 'Cargar más cajas'}
                </Button>
              </div>
            )}
          </Card>
        </div>

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
            onClose={() => {
              setShowNewBoxModal(false);
              setNewBoxLastScannedInfo(null);
            }}
            onNext={async () => {
              if (!newBox.tecnologia || !newBox.marca || !newBox.modelo || !newBox.cantidad || loading) return;

              setLoading(true);
              const reserved = await reserveNextBoxCode();
              setLoading(false);

              if (reserved.error || !reserved.code) {
                notify.error('No se pudo reservar el correlativo de caja', { description: reserved.error || undefined });
                return;
              }

              const correlativoVal = reserved.code.trim().toUpperCase();
              const existsLocal = inventory.some(
                (box) =>
                  box.id.toUpperCase() === correlativoVal ||
                  (box.box_code && box.box_code.toUpperCase() === correlativoVal)
              );
              if (existsLocal) {
                notify.warning(`El correlativo "${correlativoVal}" ya aparece en pantalla. Recargue e intente de nuevo.`);
                return;
              }

              setNewBox((prev) => ({ ...prev, correlativo: correlativoVal }));
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
                const updatedBox = {
                  ...selectedBox,
                  series: updatedSeries,
                  unitCount: updatedSeries.length,
                  status: resolveBoxDisplayStatus(updatedSeries.length, selectedBox.cantidad),
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
