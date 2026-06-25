"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { Card, Badge, Button, DataTable, type DataTableColumn, notify, confirmDialog } from '@/components/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { assertSapOperationAllowed, resolveUnitSapStatus } from '@/lib/sap/sapValidationStatus';
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
import { getInventoryBoxes, transferBoxesToArea, createBodegaBoxAtomic, reserveNextBoxCode, addSeriesToBox, dispatchBoxFromWarehouse, dispatchSpecificSeries, transferSpecificSeriesToArea, canScanSeriesIntoWarehouse, resolveBoxDisplayStatus, getBoxHistory } from '@/lib/database/warehouse';
import { DispatchBatchSelector } from '@/modules/outbound-dispatch/components/DispatchBatchSelector';
import { isHexagonalOutboundDispatchEnabled } from '@/modules/outbound-dispatch';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { getTechnologies, getBrands, getModels } from '@/lib/database/config';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { PrintBoxModal } from './components/PrintBoxModal';
import { RackModal } from './components/RackModal';
import { TimelineModal } from './components/TimelineModal';
import { DispatchModal } from './components/DispatchModal';
import { TransferModal } from './components/TransferModal';
import { NewBoxModal } from './components/NewBoxModal';
import { DetalleCajaModal } from './components/DetalleCajaModal';

// --- MOCK MASTER REGISTRY (Simulando datos de Recepción/Backoffice) ---
const masterSeriesRegistry = [
  { 
    sn: 'SN-001', 
    marca: 'Huawei', 
    modelo: 'HG8245H', 
    tecnologia: 'ONT', 
    origen: 'Guatemala City', 
    agencia: 'Monte Verdes', 
    fechaGuia: '25/04/2024', 
    fechaRecepcion: '28/04/2024',
    seriesExtra: { s2: 'MAC-A1B2', s3: 'ID-9901' }
  },
  { 
    sn: 'SN-002', 
    marca: 'Nokia', 
    modelo: 'G-2425-G', 
    tecnologia: 'ROUTER', 
    origen: 'San Salvador', 
    agencia: 'Santa Tecla', 
    fechaGuia: '26/04/2024', 
    fechaRecepcion: '29/04/2024',
    seriesExtra: { s2: 'MAC-X4Y5', s3: 'ID-8802' }
  }
];

const mockInventory = [
  { id: 'BOX-001', rack: 'A-12', area: 'Bodega Central', marca: 'Huawei', modelo: 'HG8245H', cantidad: 40, status: 'Full', series: [] },
  { id: 'BOX-002', rack: 'B-04', area: 'Bodega Central', marca: 'Nokia', modelo: 'G-2425', cantidad: 12, status: 'Partial', series: [] },
  { id: 'BOX-003', rack: 'A-05', area: 'Bodega Central', marca: 'Huawei', modelo: 'ONT-X', cantidad: 50, status: 'Full', series: [] },
];

export default function BodegaGestionPage() {
  const pathname = usePathname();
  const [searchTerm, setSearchTerm] = useState('');
  // C5: filtrado de inventario sobre término debounced (input fluido).
  const debouncedSearch = useDebouncedValue(searchTerm, 250);
  const [showNewBoxModal, setShowNewBoxModal] = useState(false);
  const [selectedBox, setSelectedBox] = useState<any | null>(null);
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
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
  const [catTecnologias, setCatTecnologias] = useState<any[]>([]);
  const [catMarcas, setCatMarcas] = useState<any[]>([]);
  const [catModelos, setCatModelos] = useState<any[]>([]);

  // Advanced Filters State
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterTech, setFilterTech] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      if (filterTech && item.tecnologia !== filterTech) return false;

      const isFull = item.status === 'Full';
      if (filterStatus === 'Full' && !isFull) return false;
      if (filterStatus === 'Partial' && item.status !== 'Parcial') return false;

      if (!debouncedSearch) return true;
      const term = debouncedSearch.toLowerCase();
      const marcaName = catMarcas.find((b) => b.id === item.marca)?.name || item.marca || '';
      const modeloName = catModelos.find((m) => m.id === item.modelo)?.name || item.modelo || '';
      const techName = catTecnologias.find((t) => t.id === item.tecnologia)?.name || item.tecnologia || '';
      const rackName = item.rack || '';
      const idName = String(item.id || '');
      return (
        idName.toLowerCase().includes(term) ||
        marcaName.toLowerCase().includes(term) ||
        modeloName.toLowerCase().includes(term) ||
        techName.toLowerCase().includes(term) ||
        rackName.toLowerCase().includes(term)
      );
    });
  }, [inventory, filterTech, filterStatus, debouncedSearch, catMarcas, catModelos, catTecnologias]);

  useEffect(() => {
    if (pathname !== '/bodega/gestion') return;
    void fetchBoxes();
    void loadCatalogs();
  }, [pathname]);

  const loadCatalogs = async () => {
    try {
      const [techs, brands, models] = await Promise.all([
        getTechnologies(), getBrands(), getModels()
      ]);
      setCatTecnologias(techs);
      setCatMarcas(brands);
      setCatModelos(models);
      // Pre-seleccionar primer item de cada catálogo como default
      setNewBox(prev => ({
        ...prev,
        tecnologia: prev.tecnologia || techs[0]?.id || '',
        marca: prev.marca || brands[0]?.id || '',
        modelo: prev.modelo || models.find((m: any) =>
          m.technology_id === (techs[0]?.id || '') && m.brand_id === (brands[0]?.id || '')
        )?.id || models[0]?.id || '',
      }));
    } catch (err) {
      console.error('Error loading catalogs:', err);
    }
  };

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

    // --- Validación de Matriz de Bloqueos SAP ---
    const box = inventory.find(b => b.realDbId === (realDbId || boxId) || b.id === boxId);
    if (box && box.series) {
      let seriesToCheck = box.series;
      if (dispatchMode === 'specific') {
        seriesToCheck = box.series.filter((s:any) => selectedSeriesForDispatch.includes(s.sn) || selectedSeriesForDispatch.includes(s.s1));
      }

      for (const s of seriesToCheck) {
        const sapStatus = resolveUnitSapStatus(
          s.sap_integration_status || s.sap_status,
          s.series_sap_statuses || [s.sap_status]
        );
        if (dispatchAction === 'despacho') {
          const check = assertSapOperationAllowed(sapStatus, 'dispatch');
          if (!check.ok) {
            notify.warning(`${check.message} Equipo ${s.sn}.`);
            return;
          }
        } else if (dispatchAction === 'traslado') {
          if (dispatchArea !== 'Diagnóstico' && dispatchArea !== 'Reparación') {
            const check = assertSapOperationAllowed(sapStatus, 'transfer');
            if (!check.ok) {
              notify.warning(`${check.message} Equipo ${s.sn}.`);
              return;
            }
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
            const res = await transferBoxesToArea([realDbId || boxId], dispatchArea, undefined, 'Admin User');
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
        await fetchBoxes();
        setShowDispatchModal(null);
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
          .select(`
            *,
            service_orders(
              id, os_label, main_serial, model_id, brand_id,
              series(serial_number)
            )
          `)
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

  const fetchBoxes = async () => {
    setLoading(true);
    try {
      const result = await getInventoryBoxes() as any;
      if (result.error) {
        notify.error('Error al cargar inventario', { description: result.error });
        return;
      }
    
    // Convert database response to table structure
    const dataFromDb = (result.data || []).filter((b: any) => b.rack_location !== 'DESPACHO').map((b: any) => {
      const seriesList = (() => {
        // Agrupar las series por service_order_id para unir S-1, S-2, etc. en una sola fila (unidad)
        const groupedSeries = (b.series || []).reduce((acc: any, s: any) => {
          const key = s.service_order_id || s.serial_number; // Fallback al SN si no hay OS
          if (!acc[key]) acc[key] = [];
          acc[key].push(s);
          return acc;
        }, {});

        return Object.values(groupedSeries).map((group: any) => {
          // Ordenar por fecha de creación para asignar S1, S2, etc. consistentemente
          group.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          
          const main = group[0];
          
          const notes = main.receptions?.notes || '';
          const normalizedNotes = notes.replace(/\\n/g, '\n');
          const piloto = normalizedNotes.split('Piloto: ')[1]?.split('\n')[0]?.trim() || '---';
          const agenciaCAC = normalizedNotes.split('Backoffice_Agency: ')[1]?.split('\n')[0]?.trim()
            || main.receptions?.carrier
            || '---';
          // Tech/Brand/Model: model_id en serie → catálogo; fallback notes legacy
          const techId =
            main.models?.technology_id ||
            main.models?.technologies?.name ||
            normalizedNotes.split('Backoffice_Tech: ')[1]?.split('\n')[0]?.trim() ||
            '';
          const brandId =
            main.brand_id ||
            main.models?.brand_id ||
            normalizedNotes.split('Backoffice_Brand: ')[1]?.split('\n')[0]?.trim() ||
            '';
          const modelId =
            main.model_id ||
            main.models?.name ||
            normalizedNotes.split('Backoffice_Model: ')[1]?.split('\n')[0]?.trim() ||
            '';
          const reentryCount = main.service_orders?.reentry_count || 1;
          const ingresoLabel = `${reentryCount}° Ingreso`;

          return {
            notes: notes,
            sn: main.serial_number,
            s1: group[0]?.serial_number || '',
            s2: group[1]?.serial_number || '',
            s3: group[2]?.serial_number || '',
            s4: group[3]?.serial_number || '',
            material: main.material || group[0]?.material || '',
            lote: main.valuation || group[0]?.valuation || '',
            marca: brandId,
            modelo: modelId,
            tecnologia: techId,
            origen: main.receptions?.carrier || 'Desconocida',
            fuente: main.receptions?.source?.toUpperCase() || 'PX',
            agenciaCAC: agenciaCAC,
            piloto: piloto,
            guia: main.receptions?.guide_number || 'S/G',
            recibio: normalizedNotes.split('Recibido Por: ')[1]?.split('\n')[0]?.trim() || main.receptions?.received_by || 'SISTEMA',
            estatus: main.receptions?.status || 'N/A',
            ordenServicio: main.service_orders?.os_label || 'S/OS',
            ingreso: ingresoLabel,
            sap_status: main.service_orders?.sap_integration_status || main.sap_status || 'Pendiente Validación',
            fechaHora: main.receptions?.created_at ? new Date(main.receptions.created_at).toLocaleString() : new Date(main.created_at).toLocaleString(),
            fechaRecepcion: new Date(main.created_at).toLocaleDateString(),
            timestamp: new Date(main.created_at).toLocaleTimeString()
          };
        });
      })();

      const firstSeries = b.series && b.series.length > 0 ? b.series[0] : null;
      let areaLabel = 'Bodega Central';
      if (firstSeries) {
        switch (firstSeries.current_status) {
          case 'in_workshop': areaLabel = 'Diagnóstico'; break;
          case 'in_qc': areaLabel = 'Reparación'; break;
          case 'ready_to_dispatch': areaLabel = 'Reacondicionado'; break;
          case 'in_control_warehouse': areaLabel = 'L3'; break;
          case 'irreparable': areaLabel = 'Bodega SCRAP'; break;
          case 'obsolete': areaLabel = 'Bodega Obsoleto'; break;
          case 'in_central_warehouse':
          case 'in_warehouse':
          case 'RECEPCIONADO_BODEGA_GENERAL':
            areaLabel = 'Bodega Central'; break;
          default: areaLabel = 'Bodega Central'; break;
        }
      } else if ((b.rack_location || '').toUpperCase() === 'BODEGA_CENTRAL') {
        areaLabel = 'Bodega Central';
      }

      const unitCount = seriesList.length > 0 ? seriesList.length : (b.series || []).length;
      const capacity = b.capacity || 0;
      const boxModelRecord = catModelos.find((m: any) => m.id === b.model_id);
      const boxTechLabel = boxModelRecord
        ? catTecnologias.find((t: any) => t.id === boxModelRecord.technology_id)?.name ||
          boxModelRecord.technology_id
        : '---';
      const firstSeriesTech = seriesList.length > 0
        ? catTecnologias.find((t: any) => t.id === seriesList[0].tecnologia)?.name ||
          seriesList[0].tecnologia
        : boxTechLabel;

      return {
        id: b.box_code || b.id,
        realDbId: b.id,
        box_code: b.box_code,
        rack: b.rack_location || 'SIN RACK',
        area: areaLabel,
        marca: b.brand_id || 'N/A',
        modelo: b.model_id || 'N/A',
        cantidad: capacity,
        unitCount,
        status: resolveBoxDisplayStatus(unitCount, capacity),
        series: seriesList,
        fechaIngreso: new Date(b.created_at || Date.now()).toLocaleString(),
        tecnologia: firstSeriesTech || boxTechLabel || '---',
        usuarioIngreso: seriesList.length > 0 ? seriesList[0].recibio : 'Admin User'
      };
    })
      .filter((box: any) => {
        const rack = String(box.rack || '').toUpperCase();
        if (rack === 'DESPACHO' || rack === 'ELIMINADO') return false;
        return box.unitCount > 0;
      })
      .sort((a: any, b: any) => {
        const num = (code: string) => {
          const match = String(code || '').match(/BOX-(\d+)/i);
          return match ? parseInt(match[1], 10) : 0;
        };
        return num(b.id) - num(a.id);
      });

    setInventory(dataFromDb);
    } catch (err) {
      console.error('Error cargando cajas de bodega:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void fetchBoxes();
        void loadCatalogs();
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

      await fetchBoxes();
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

    const selectedTechName = catTecnologias.find(t => t.id === newBox.tecnologia)?.name;
    const selectedBrandName = catMarcas.find(b => b.id === newBox.marca)?.name;
    const selectedModelName = catModelos.find(m => m.id === newBox.modelo)?.name;

    const isTechMatch = techId === newBox.tecnologia || techId === selectedTechName;
    const isBrandMatch = brandId === newBox.marca || brandId === selectedBrandName;
    const isModelMatch = modelId === newBox.modelo || modelId === selectedModelName;

    // Buscar nombre legible en catálogos cargados para mostrar en caso de error
    const tecnologiaBO = catTecnologias.find(t => t.id === techId)?.name || techId || newBox.tecnologia;
    const marcaBO = catMarcas.find(b => b.id === brandId)?.name || brandId || newBox.marca;
    const modeloBO = catModelos.find(m => m.id === modelId)?.name || modelId || newBox.modelo;

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
    const brandName = catMarcas.find(b => b.id === box.marca)?.name || box.marca || 'N/A';
    const modelName = catModelos.find(m => m.id === box.modelo)?.name || box.modelo || 'N/A';

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
          MARCA: ${brandName}<br>
          MODELO: ${modelName}<br>
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
          <strong>MARCA:</strong> ${brandName} &nbsp;|&nbsp; <strong>MODELO:</strong> ${modelName} <br>
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
    const tecnologiaBO = catTecnologias.find(t => t.id === techId)?.name || techId || 'EQUIPO';
    const marcaBO = catMarcas.find(b => b.id === brandId)?.name || brandId || selectedBox.marca;
    const modeloBO = catModelos.find(m => m.id === modelId)?.name || modelId || selectedBox.modelo;

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

    const updatedBox = { ...selectedBox, series: [info, ...selectedBox.series] };
    setSelectedBox(updatedBox);
    setLastScannedInfo(info);
    
    setInventory(inventory.map(item => (item.realDbId || item.id) === (selectedBox.realDbId || selectedBox.id) ? updatedBox : item));
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
      
      setInventory(prev => prev.filter(b => b.id !== boxId));
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
        await fetchBoxes();
      }
    }
    setShowRackModal(null);
    setLoading(false);
  };

  const handleExecuteTransfer = async () => {
    if (selectedBoxesForTransfer.length === 0) return;
    
    setLoading(true);

    // Mapear los IDs de UI (ej: BOX-001) a sus UUID reales de la base de datos
    const realBoxIds = selectedBoxesForTransfer.map(id => {
      const box = inventory.find(b => b.id === id);
      return box ? (box.realDbId || box.id) : id;
    });

    // Ejecutar el traspaso, que ahora amarra la caja, la ubicación, y reasigna el status de las series internas.
    const { error } = await transferBoxesToArea(realBoxIds, destinationArea, undefined, 'Admin User');
    
    if (error) {
      notify.error('Error en la transferencia', { description: String(error) });
    } else {
      await fetchBoxes();
      setShowTransferModal(false);
      setSelectedBoxesForTransfer([]);
      notify.success('Transferencia exitosa', { description: `${selectedBoxesForTransfer.length} cajas movidas a ${destinationArea}.` });
    }
    setLoading(false);
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

  const inventoryColumns: DataTableColumn<any>[] = [
    {
      id: 'id',
      header: 'ID Caja',
      width: '160px',
      cell: (item) => (
        <div className="flex items-center gap-2">
          <span className="text-sm font-black text-[#181c3a] font-mono">{item.id}</span>
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
      cell: (item) => catTecnologias.find(t => t.id === item.tecnologia)?.name || item.tecnologia || '---',
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
            {catMarcas.find(b => b.id === item.marca)?.name || item.marca || 'N/A'}
          </span>
          <span className="text-[10px] font-medium text-slate-600">
            {catModelos.find(m => m.id === item.modelo)?.name || item.modelo || 'N/A'}
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
          <button className="text-slate-400 hover:text-[#2ec4f1] transition-all hover:scale-110" title="Ver Eventos" onClick={(e) => {
            e.stopPropagation();
            if (item.series && item.series.length > 0) {
               setShowTimeline({
                 box_id: item.realDbId,
                 box_code: item.box_code || item.id,
                 notes: item.series[0].notes,
                 guide_number: item.series[0].guia,
                 status: item.status,
                 agencia: item.series[0].agenciaCAC
               });
            } else {
               notify.info('No hay eventos registrados para esta caja porque está vacía.');
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

          <button className="text-slate-400 hover:text-emerald-500 transition-all hover:scale-110" title="Despachar de Inventario" onClick={async (e) => {
            e.stopPropagation();
            setDispatchMode('specific');
            setDispatchAction('despacho');
            setShowDispatchModal(item);
            setDispatchDestination('Calculando...');

            const supabase = getSupabaseBrowserClient();
            if (supabase) {
              const { data } = await supabase
                .from('dispatches')
                .select('guide_number')
                .like('guide_number', 'TC-INV-%');

              let nextId = 100;
              if (data && data.length > 0) {
                let max = 99;
                data.forEach((d: any) => {
                  const numStr = d.guide_number.replace('TC-INV-', '');
                  const num = parseInt(numStr, 10);
                  if (!isNaN(num) && num > max) max = num;
                });
                nextId = max + 1;
              }
              setDispatchDestination(`TC-INV-${String(nextId).padStart(3, '0')}`);
            } else {
              setDispatchDestination(`TC-INV-100`);
            }
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

        {/* Inventory List */}
        <div className="space-y-6">
          <ModuleToolbar 
            onSearch={(val) => setSearchTerm(val)}
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

          <Card padding="none" className="overflow-hidden border-2 border-slate-100 shadow-sm">
            <DataTable
              columns={inventoryColumns}
              data={filteredInventory}
              getRowId={(item) => item.id}
              onRowClick={(item) => setSelectedBox(item)}
              rowHeight={72}
              maxBodyHeight={640}
              minWidth={1290}
              headerClassName="bg-[#181c3a] border-b border-[#181c3a]"
              headerTextClassName="text-white/80"
              emptyMessage="No hay cajas en inventario"
            />
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
              if (!newBox.cantidad || !newBox.rack || loading) return;

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
                  }
                  setSelectedBox(null);
                  setInventory(inventory.filter((inv) => inv.id !== selectedBox.id));
                } else {
                  setSelectedBox(updatedBox);
                  setInventory(inventory.map((inv) => (inv.id === selectedBox.id ? updatedBox : inv)));
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

      {/* Modal Despacho */}
        {showDispatchModal && (
          <DispatchModal
            box={showDispatchModal}
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
            }}
            onConfirm={() => handleDispatchBox(showDispatchModal.id, showDispatchModal.realDbId)}
          />
        )}
    </ModulePage>
  );
}
