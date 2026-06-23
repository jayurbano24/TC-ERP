"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { Card, Badge, Button, TablePagination } from '@/components/ui';
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
import { getInventoryBoxes, transferBoxesToArea, createBodegaBoxAtomic, reserveNextBoxCode, addSeriesToBox, dispatchBoxFromWarehouse, dispatchSpecificSeries, transferSpecificSeriesToArea, canScanSeriesIntoWarehouse, resolveBoxDisplayStatus } from '@/lib/database/warehouse';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { getBoxHistory } from '@/lib/database/warehouse';
import { getTechnologies, getBrands, getModels } from '@/lib/database/config';
import { useClientPagination } from '@/hooks/useClientPagination';

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

      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
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
  }, [inventory, filterTech, filterStatus, searchTerm, catMarcas, catModelos, catTecnologias]);

  const inventoryPagination = useClientPagination(filteredInventory, 25, [
    filterTech,
    filterStatus,
    searchTerm,
  ]);

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
      alert("Por favor ingresa un destino o guía de salida.");
      return;
    }
    
    if (dispatchMode === 'specific' && selectedSeriesForDispatch.length === 0) {
      alert("Debes seleccionar al menos una serie para procesar.");
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
            alert(`⚠️ ${check.message} Equipo ${s.sn}.`);
            return;
          }
        } else if (dispatchAction === 'traslado') {
          if (dispatchArea !== 'Diagnóstico' && dispatchArea !== 'Reparación') {
            const check = assertSapOperationAllowed(sapStatus, 'transfer');
            if (!check.ok) {
              alert(`⚠️ ${check.message} Equipo ${s.sn}.`);
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
        if (dispatchMode === 'all') {
          const res = await dispatchBoxFromWarehouse(realDbId || boxId, dispatchDestination, dispatchNotes);
          error = res.error;
        } else {
          const res = await dispatchSpecificSeries(realDbId || boxId, selectedSeriesForDispatch, dispatchDestination, dispatchNotes);
          error = res.error;
        }
      }
      
      if (error) {
        alert("Error despachando: " + error);
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
      alert("Error inesperado al despachar.");
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
        alert("Error al cargar inventario: " + result.error);
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
        alert("⚠️ Debe escanear al menos una serie para poder guardar la caja.");
        return;
      }

      if (!tempSerials[0]?.reception_id) {
        alert("⚠️ La serie escaneada no tiene recepción de origen. Verifique clasificación en Backoffice.");
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
        alert("Error al guardar la caja: " + result.error);
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
    if (tempSerials.length >= newBox.cantidad) return alert("Cantidad completada");

    if (tempSerials.find(s => s.sn === currentSN)) return alert("Serie ya escaneada");

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
      alert("⚠️ Serie no encontrada en Recepción CAC o Backoffice.");
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
        alert(`⚠️ La serie ${currentSN} ya está ingresada en Bodega General.`);
      } else {
        alert(
          `⚠️ El equipo con serie ${currentSN} no está listo para ingreso a almacén.\nEstatus recepción: ${mainSeries.receptions?.status || 'SIN RECEPCIÓN'}\nEstatus serie: ${mainSeries.current_status || 'N/A'}.`
        );
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
      alert(`⚠️ Validación Fallida: El Modelo, Marca y/o Tecnología del equipo escaneado NO coinciden con los configurados para esta caja.\n\nEscaneado: ${tecnologiaBO} / ${marcaBO} / ${modeloBO}\nEsperado: ${selectedTechName || newBox.tecnologia} / ${selectedBrandName || newBox.marca} / ${selectedModelName || newBox.modelo}`);
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
    
    if (selectedBox.series.find((s: any) => s.sn === currentSN)) return alert("Serie ya escaneada en esta caja");

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
      alert("⚠️ Serie no encontrada en Recepción o Backoffice. Verifique el registro previo.");
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
        alert(`⚠️ La serie ${currentSN} ya está ingresada en Bodega General.`);
      } else {
        alert(
          `⚠️ El equipo con serie ${currentSN} no está listo para ingreso a almacén.\nEstatus recepción: ${mainSeries.receptions?.status || 'SIN RECEPCIÓN'}\nEstatus serie: ${mainSeries.current_status || 'N/A'}.`
        );
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
      alert("⚠️ Error al vincular la serie a la caja en la base de datos.");
      return;
    }

    const updatedBox = { ...selectedBox, series: [info, ...selectedBox.series] };
    setSelectedBox(updatedBox);
    setLastScannedInfo(info);
    
    setInventory(inventory.map(item => (item.realDbId || item.id) === (selectedBox.realDbId || selectedBox.id) ? updatedBox : item));
    setCurrentSN('');
  };

  const handleDeleteBox = async (boxId: string, realDbId: string) => {
    if (!window.confirm('¿Está seguro de eliminar esta caja y TODO su contenido (series y órdenes de servicio asociadas)? Esta acción no se puede deshacer.')) return;

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
      alert("Error al intentar eliminar la caja y sus series.");
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
        alert('Error al actualizar la ubicación: ' + error.message);
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
      alert(`Error: ${error}`);
    } else {
      await fetchBoxes();
      setShowTransferModal(false);
      setSelectedBoxesForTransfer([]);
      alert(`✅ Transferencia exitosa: ${selectedBoxesForTransfer.length} cajas movidas a ${destinationArea}`);
    }
    setLoading(false);
  };

  const handleScanForTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferScanInput) return;

    const box = inventory.find(b => b.id.toUpperCase() === transferScanInput.toUpperCase());
    if (!box) {
      alert("⚠️ Caja no encontrada en inventario");
      setTransferScanInput('');
      return;
    }

    if (!selectedBoxesForTransfer.includes(box.id)) {
      setSelectedBoxesForTransfer([...selectedBoxesForTransfer, box.id]);
    }
    setTransferScanInput('');
  };

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
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-[#181c3a] border-b border-[#181c3a]">
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white/80">ID Caja</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white/80">Fecha Ingreso</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white/80">Tecnología</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white/80">Usuario Ingreso</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white/80">Ubicación / Área</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white/80">Marca / Modelo</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white/80">Cantidad</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white/80">Estatus</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white/80 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {inventoryPagination.slice.map((item) => (
                    <tr 
                      key={item.id} 
                      className="hover:bg-slate-50/50 transition-colors group cursor-pointer"
                      onClick={() => setSelectedBox(item)}
                    >
                      <td className="px-6 py-5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-[#181c3a] font-mono">{item.id}</span>
                          {item.fuente && (
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${item.fuente === 'CAC' ? 'bg-[#181c3a] text-white' : 'bg-[#2ec4f1] text-[#181c3a]'}`}>
                              {item.fuente}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap">
                        <span className="text-[10px] font-bold text-slate-700">{item.fechaIngreso}</span>
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-[10px] font-bold text-cyan-800">{catTecnologias.find(t => t.id === item.tecnologia)?.name || item.tecnologia || '---'}</span>
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-[10px] font-bold text-slate-700">{(item.usuarioIngreso || 'SISTEMA').split('@')[0]}</span>
                      </td>
                      <td className="px-6 py-5">
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
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700">
                            {catMarcas.find(b => b.id === item.marca)?.name || item.marca || 'N/A'}
                          </span>
                          <span className="text-[10px] font-medium text-slate-600">
                            {catModelos.find(m => m.id === item.modelo)?.name || item.modelo || 'N/A'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
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
                      </td>
                      <td className="px-6 py-5">
                        <Badge variant={item.status === 'Full' ? 'green' : item.status === 'Parcial' ? 'yellow' : 'default'}>{item.status}</Badge>
                      </td>
                      <td className="px-6 py-5 text-right">
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
                               alert('No hay eventos registrados para esta caja porque está vacía.');
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination
              totalCount={inventoryPagination.totalCount}
              page={inventoryPagination.page}
              totalPages={inventoryPagination.totalPages}
              startItem={inventoryPagination.startItem}
              endItem={inventoryPagination.endItem}
              pageSize={inventoryPagination.pageSize}
              onPageChange={inventoryPagination.setPage}
              itemLabel="cajas"
            />
          </Card>
        </div>

        {/* Modal Nueva Caja */}
        {showNewBoxModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#181c3a]/40 backdrop-blur-sm p-6">
            <Card className={`${newBoxStep === 'scanning' ? 'max-w-5xl' : 'max-w-lg'} w-full shadow-2xl animate-rise-in p-0 overflow-hidden transition-all duration-500`}>
              <div className="bg-[#181c3a] p-6 text-white flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <Box className="w-6 h-6 text-[#2ec4f1]" />
                  <h3 className="text-xl font-bold flex items-center gap-3">
                    {newBoxStep === 'scanning' && newBox.correlativo 
                      ? newBox.correlativo 
                      : 'Ingresar Almacén TC Caja'}
                    {newBoxStep === 'scanning' && newBox.correlativo && (
                      <Badge variant="outline" className="bg-white/10 text-white border-white/20 text-[10px] tracking-widest">EN PROCESO</Badge>
                    )}
                  </h3>
                </div>
                <button onClick={() => {
                  setShowNewBoxModal(false);
                  setNewBoxLastScannedInfo(null);
                }} className="text-white/40 hover:text-white">✕</button>
              </div>
              
              {newBoxStep === 'form' ? (
                <div className="p-8 space-y-6">
                  {/* Número de correlativo de la caja (Auto-generado y No Editable) */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Número de correlativo de la caja (Auto-generado)</label>
                    <input 
                      type="text"
                      className="w-full bg-slate-100 p-3 rounded-xl border border-slate-200 font-bold text-sm outline-none text-slate-500 cursor-not-allowed"
                      value={newBox.correlativo}
                      disabled
                      placeholder="Se asigna al pulsar «Siguiente»"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tecnología</label>
                      <select 
                        className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 font-bold text-sm outline-none focus:border-[#2ec4f1]"
                        value={newBox.tecnologia}
                        onChange={e => setNewBox({...newBox, tecnologia: e.target.value, marca: '', modelo: ''})}
                      >
                        <option value="">-- Seleccione --</option>
                        {catTecnologias.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Marca</label>
                      <select 
                        className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 font-bold text-sm outline-none focus:border-[#2ec4f1]"
                        value={newBox.marca}
                        onChange={e => setNewBox({...newBox, marca: e.target.value, modelo: ''})}
                        disabled={!newBox.tecnologia}
                      >
                        <option value="">-- Seleccione --</option>
                        {catMarcas.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Modelo</label>
                      <select 
                        className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 font-bold text-sm outline-none focus:border-[#2ec4f1]"
                        value={newBox.modelo}
                        onChange={e => setNewBox({...newBox, modelo: e.target.value})}
                        disabled={!newBox.marca}
                      >
                        <option value="">-- Seleccione --</option>
                        {catModelos
                          .filter(m => 
                            (!newBox.tecnologia || m.technology_id === newBox.tecnologia) &&
                            (!newBox.marca || m.brand_id === newBox.marca)
                          )
                          .map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))
                        }
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cantidad</label>
                      <input 
                        type="number"
                        className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 font-bold text-sm outline-none focus:border-[#2ec4f1]"
                        value={newBox.cantidad || ''}
                        onChange={e => setNewBox({...newBox, cantidad: parseInt(e.target.value) || 0})}
                        placeholder="0"
                      />
                    </div>
                  </div>


                  <div className="flex gap-4 pt-4">
                    <Button variant="outline" className="flex-1" onClick={() => {
                      setShowNewBoxModal(false);
                      setNewBoxLastScannedInfo(null);
                    }}>Cancelar</Button>
                    <Button 
                      variant="primary" 
                      className="flex-1" 
                      onClick={async () => {
                        if (!newBox.cantidad || !newBox.rack || loading) return;

                        setLoading(true);
                        const reserved = await reserveNextBoxCode();
                        setLoading(false);

                        if (reserved.error || !reserved.code) {
                          alert(reserved.error || 'No se pudo reservar el correlativo de caja.');
                          return;
                        }

                        const correlativoVal = reserved.code.trim().toUpperCase();
                        const existsLocal = inventory.some(
                          (box) =>
                            box.id.toUpperCase() === correlativoVal ||
                            (box.box_code && box.box_code.toUpperCase() === correlativoVal)
                        );
                        if (existsLocal) {
                          alert(`⚠️ El correlativo "${correlativoVal}" ya aparece en pantalla. Recargue e intente de nuevo.`);
                          return;
                        }

                        setNewBox((prev) => ({ ...prev, correlativo: correlativoVal }));
                        setNewBoxStep('scanning');
                      }}
                      disabled={!newBox.cantidad || !newBox.rack || loading}
                    >
                      {loading ? 'Validando...' : 'Siguiente: Cargar Series'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-6 space-y-6">
                  <div className="flex gap-6 h-[500px]">
                    {/* Columna Izquierda: Formulario y Progreso */}
                    <div className="flex-1 flex flex-col gap-6">
                      <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 shrink-0">
                        <div className="flex justify-between items-end mb-4">
                          <div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none">Progreso de la Caja</span>
                            <h4 className="text-lg font-black text-[#181c3a]">
                              {catMarcas.find(b => b.id === newBox.marca)?.name || newBox.marca || '—'}{' '}
                              {catModelos.find(m => m.id === newBox.modelo)?.name || newBox.modelo || '—'}
                            </h4>
                          </div>
                          <div className="text-right">
                            <span className={`text-2xl font-black leading-none ${tempSerials.length > 0 ? 'text-emerald-500' : 'text-[#2ec4f1]'}`}>
                              {tempSerials.length}
                              <span className="text-sm text-slate-300"> / {newBox.cantidad}</span>
                            </span>
                            {tempSerials.length > 0 && tempSerials.length < newBox.cantidad && (
                              <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mt-0.5">
                                Faltan {newBox.cantidad - tempSerials.length}
                              </p>
                            )}
                            {tempSerials.length >= newBox.cantidad && (
                              <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mt-0.5">
                                ✓ Completo
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-[#2ec4f1] transition-all duration-500"
                            style={{ width: `${(tempSerials.length / newBox.cantidad) * 100}%` }}
                          />
                        </div>
                      </div>

                      <form onSubmit={handleScanForNewBox} className="relative group shrink-0">
                        <QrCode className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-200 group-focus-within:text-[#2ec4f1] transition-colors" />
                        <input 
                          type="text" 
                          autoFocus
                          placeholder="PISTOLÉE SERIE (SN)..."
                          className="w-full h-20 pl-16 pr-6 bg-slate-50 border-2 border-slate-100 rounded-2xl text-2xl font-mono font-black outline-none focus:border-[#2ec4f1] focus:bg-white transition-all uppercase"
                          value={currentSN}
                          onChange={e => setCurrentSN(e.target.value)}
                        />
                      </form>


                      <div className="flex gap-4 pt-4 mt-auto shrink-0">
                        <Button variant="outline" className="flex-1" onClick={() => setNewBoxStep('form')}>Atrás</Button>
                        <Button 
                          variant="primary" 
                          className={`flex-1 border-none shadow-xl transition-all ${
                            tempSerials.length === 0
                              ? 'bg-slate-300 shadow-slate-200/20 cursor-not-allowed'
                              : tempSerials.length >= newBox.cantidad
                              ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20'
                              : 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20'
                          }`}
                          onClick={handleAddBox}
                          disabled={tempSerials.length === 0 || isSavingNewBox}
                        >
                          {isSavingNewBox
                            ? 'Guardando...'
                            : tempSerials.length === 0
                            ? 'Pistolee 1 serie'
                            : tempSerials.length >= newBox.cantidad
                            ? '✓ Finalizar Caja'
                            : `Guardar Caja (${tempSerials.length})`
                          }
                        </Button>
                      </div>
                    </div>

                    {/* Columna Derecha: Lista de Escaneados */}
                    <div className="w-[45%] bg-slate-50 rounded-3xl border border-slate-100 p-5 flex flex-col">
                      <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4 shrink-0">Contenido de la Caja</h4>
                      
                      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-2">
                        {/* Se renderizan en reversa para ver el ultimo escaneado arriba */}
                        {[...tempSerials].reverse().map((s, index) => {
                          const originalIndex = tempSerials.length - 1 - index;
                          return (
                            <div key={originalIndex} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:border-[#2ec4f1]/30 transition-colors animate-rise-in group">
                              <div className="flex items-center gap-3">
                                <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[10px] font-black shrink-0">
                                  {originalIndex + 1}
                                </div>
                                <Badge variant="green" className="bg-emerald-500 text-white text-[9px] py-0.5 px-1.5 shrink-0">OK (SN)</Badge>
                                <span className="text-[11px] font-mono font-black text-[#181c3a] break-all">{s.sn}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] font-bold text-slate-400 truncate max-w-[60px]" title={s.recibio}>{s.recibio || 'Admin'}</span>
                                <button 
                                  onClick={() => {
                                    if (window.confirm(`¿Eliminar la serie ${s.sn} de la caja actual?`)) {
                                      setTempSerials(tempSerials.filter((_, i) => i !== originalIndex));
                                    }
                                  }}
                                  className="text-slate-300 hover:text-rose-500 p-1 transition-colors"
                                  title="Eliminar de la caja"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        
                        {tempSerials.length === 0 && (
                          <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3 opacity-50">
                            <Box size={40} />
                            <p className="text-[10px] font-black uppercase tracking-widest">Caja Vacía</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Modal Detalle / Cierre de Caja (Ingreso Inteligente) */}
        {selectedBox && (() => {
          const uniqueEquipmentsCount = new Set(selectedBox.series?.map((s: any) => s.service_orders?.id || s.serial_number)).size;
          return (
          <div className="fixed inset-0 z-50 flex items-center justify-end bg-[#181c3a]/40 backdrop-blur-sm">
            <div className="w-[95vw] max-w-none h-full bg-white shadow-2xl animate-slide-in-right flex flex-col">
              <div className="bg-[#181c3a] p-8 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                  <Warehouse className="w-40 h-40" />
                </div>
                
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="blue" className="bg-[#2ec4f1] text-[#181c3a]">ID: {selectedBox.id}</Badge>
                        <Badge variant="slate" className="bg-white/10 text-white/60">INGRESO INTELIGENTE</Badge>
                      </div>
                      <h3 className="text-3xl font-black">
                        {catMarcas.find(b => b.id === selectedBox.marca)?.name || selectedBox.marca} - {catModelos.find(m => m.id === selectedBox.modelo)?.name || selectedBox.modelo}
                      </h3>
                      <div className="flex items-center gap-4 mt-2 text-white/60">
                        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest">
                          <Cpu className="w-3 h-3 text-[#2ec4f1]" /> {catTecnologias.find(t => t.id === selectedBox.series[0]?.tecnologia)?.name || selectedBox.series[0]?.tecnologia || 'N/A'}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest">
                          <MapPin className="w-3 h-3 text-[#2ec4f1]" /> {selectedBox.rack}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => { setSelectedBox(null); setLastScannedInfo(null); }} className="p-2 hover:bg-white/10 rounded-xl transition-all">✕</button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                      <div className="flex justify-between items-end mb-4">
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/40 leading-none">Progreso Caja</span>
                        <span className="text-2xl font-black text-[#2ec4f1] leading-none">
                          {uniqueEquipmentsCount} <span className="text-sm text-white/20">/ {selectedBox.cantidad}</span>
                        </span>
                      </div>
                      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-[#2ec4f1] transition-all duration-500"
                          style={{ width: `${(uniqueEquipmentsCount / selectedBox.cantidad) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="bg-[#2ec4f1]/10 rounded-2xl p-6 border border-[#2ec4f1]/20 flex flex-col justify-center">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#2ec4f1] mb-1">Estatus Bodega</span>
                      <span className="text-lg font-black text-white">{selectedBox.status.toUpperCase()}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-slate-50/30">
                {/* Ocultar sección de escaneo si la caja ya está llena */}
                {uniqueEquipmentsCount < selectedBox.cantidad && (
                  <>
                    {/* Buscador Inteligente */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <QrCode className="w-5 h-5 text-[#2ec4f1]" />
                          <h4 className="text-sm font-black uppercase tracking-widest text-[#181c3a]">Pistoleo de Verificación</h4>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 italic">Sincronizado con Recepción / Backoffice</span>
                      </div>
                      <form onSubmit={handleAddSN} className="flex gap-3">
                        <input 
                          type="text"
                          autoFocus
                          className="flex-1 h-16 px-6 bg-white border-2 border-slate-100 rounded-2xl text-xl font-mono font-bold outline-none focus:border-[#2ec4f1] shadow-sm transition-all"
                          placeholder="Escanee SN del equipo..."
                          value={currentSN}
                          onChange={e => setCurrentSN(e.target.value)}
                        />
                        <Button type="submit" className="h-16 px-8 rounded-2xl shadow-lg shadow-[#181c3a]/10">
                          <ArrowRight className="w-6 h-6" />
                        </Button>
                      </form>
                    </div>

                    {/* Detalle del Último Escaneo (Auto-fetch) */}
                    {lastScannedInfo && (
                      <div className="animate-rise-in">
                        <Card className="border-2 border-[#2ec4f1]/30 bg-white p-6 shadow-xl shadow-[#2ec4f1]/5">
                          <div className="flex items-start gap-4">
                            <div className="bg-[#2ec4f1]/10 p-3 rounded-2xl">
                              <Info className="w-6 h-6 text-[#2ec4f1]" />
                            </div>
                            <div className="flex-1">
                              <div className="flex justify-between items-start mb-4">
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Información de Origen</h4>
                                    {lastScannedInfo.serviceOrder !== 'S/OS' && (
                                      <Badge className="bg-amber-100 text-amber-700 font-black text-[9px] px-2 py-0.5 border-none">
                                        OS: {lastScannedInfo.serviceOrder}
                                      </Badge>
                                    )}
                                  </div>
                                  <h5 className="text-lg font-black text-[#181c3a] leading-none mb-1">
                                    {lastScannedInfo.agency || lastScannedInfo.agencia}
                                  </h5>
                                  <span className="text-sm font-bold text-slate-500">
                                    {lastScannedInfo.courier} • Piloto: {lastScannedInfo.driver || lastScannedInfo.piloto}
                                  </span>
                                </div>
                                <Badge className="bg-emerald-100 text-emerald-700 border-none font-black">
                                  ✓ VALIDADO
                                </Badge>
                              </div>
                              
                              <div className="grid grid-cols-4 gap-2 border-t border-slate-100 pt-4">
                                {['s1','s2','s3','s4'].map((key, idx) => (
                                  <div key={key} className={`rounded-lg p-2 ${lastScannedInfo[key] ? 'bg-[#2ec4f1]/5 border border-[#2ec4f1]/20' : 'bg-slate-50 opacity-40'}`}>
                                    <span className="block text-[8px] font-black text-slate-400 uppercase mb-0.5">S-{idx + 1}</span>
                                    <span className="text-[10px] font-mono font-black text-[#181c3a] break-all">{lastScannedInfo[key] || '---'}</span>
                                  </div>
                                ))}
                              </div>

                              <div className="grid grid-cols-2 gap-4 mt-4 bg-slate-50 p-3 rounded-xl">
                                <div className="flex items-center gap-2">
                                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                  <div className="flex flex-col">
                                    <span className="text-[8px] font-black text-slate-400 uppercase">Recibido en Guía</span>
                                    <span className="text-[10px] font-bold text-slate-700">{lastScannedInfo.fechaGuia}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <PackageCheck className="w-3.5 h-3.5 text-[#2ec4f1]" />
                                  <div className="flex flex-col">
                                    <span className="text-[8px] font-black text-slate-400 uppercase">Auditado Recepción</span>
                                    <span className="text-[10px] font-bold text-[#2ec4f1]">{lastScannedInfo.fechaRecepcion}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </Card>
                      </div>
                    )}
                  </>
                )}


                {/* Listado de Series en Caja - Tabla Detallada */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    Contenido de la Caja <span className="w-1.5 h-1.5 rounded-full bg-slate-300" /> {selectedBox.series.length} Unidades
                  </h4>
                  
                  <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
                    <table className="w-full text-left whitespace-nowrap">
                      <thead>
                        <tr className="bg-[#181c3a] text-white">
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Fecha / Hora</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">No. Guía</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Piloto</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Courier</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Recibió</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Estatus</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Orden Servicio</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Ingreso</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Agencia CAC</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Tecnología</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Marca</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Modelo</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">S-1</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">S-2</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">S-3</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">S-4</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Material</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Lote</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedBox.series.map((item: any, i: number) => (
                          <tr key={i} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-4 py-3 text-[10px] font-bold text-slate-700">{item.fechaHora || item.timestamp}</td>
                            <td className="px-4 py-3 text-[10px] font-mono font-bold text-[#181c3a]">{item.guia || item.agencia}</td>
                            <td className="px-4 py-3 text-[10px] font-medium text-slate-600">{item.piloto || '---'}</td>
                            <td className="px-4 py-3 text-[10px] font-medium text-slate-400">{item.origen || '---'}</td>
                            <td className="px-4 py-3 text-[10px] font-medium text-slate-600">{item.recibio || 'Admin'}</td>
                            <td className="px-4 py-3">
                              <span className="text-[9px] font-black tracking-widest bg-[#181c3a] text-white px-2 py-1 rounded-full">BODEGA PRINCIPAL</span>
                            </td>
                            <td className="px-4 py-3 text-[10px] font-black text-[#2ec4f1]">{item.ordenServicio || '---'}</td>
                            <td className="px-4 py-3">
                              <span className="text-[9px] font-black bg-blue-50 text-blue-600 px-2 py-1 rounded-full">{item.ingreso || '1° Ingreso'}</span>
                            </td>
                            <td className="px-4 py-3 text-[10px] font-bold text-slate-700">{item.agenciaCAC || '---'}</td>
                            <td className="px-4 py-3 text-[10px] font-bold text-[#2ec4f1]">{catTecnologias.find(t => t.id === item.tecnologia)?.name || item.tecnologia || '---'}</td>
                            <td className="px-4 py-3 text-[10px] font-bold text-slate-700">{catMarcas.find(b => b.id === item.marca)?.name || item.marca || '---'}</td>
                            <td className="px-4 py-3 text-[10px] font-bold text-slate-700">{catModelos.find(m => m.id === item.modelo)?.name || item.modelo || '---'}</td>
                            <td className="px-4 py-3">
                              {item.s1 || item.sn ? <span className="inline-block px-2 py-1 bg-slate-50 text-[10px] font-mono font-black text-[#181c3a] rounded-md">{item.s1 || item.sn}</span> : <span className="text-slate-300">---</span>}
                            </td>
                            <td className="px-4 py-3">
                              {item.s2 ? <span className="inline-block px-2 py-1 bg-slate-50 text-[10px] font-mono font-bold text-slate-600 rounded-md">{item.s2}</span> : <span className="text-slate-300">---</span>}
                            </td>
                            <td className="px-4 py-3">
                              {item.s3 ? <span className="inline-block px-2 py-1 bg-slate-50 text-[10px] font-mono font-bold text-slate-600 rounded-md">{item.s3}</span> : <span className="text-slate-300">---</span>}
                            </td>
                            <td className="px-4 py-3">
                              {item.s4 ? <span className="inline-block px-2 py-1 bg-slate-50 text-[10px] font-mono font-bold text-slate-600 rounded-md">{item.s4}</span> : <span className="text-slate-300">---</span>}
                            </td>
                            <td className="px-4 py-3 text-[10px] font-bold text-slate-700">{item.material || '---'}</td>
                            <td className="px-4 py-3 text-[10px] font-bold text-slate-700">{item.lote || '---'}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => setShowTimeline({
                                    box_id: selectedBox.realDbId,
                                    box_code: selectedBox.box_code || selectedBox.id,
                                    notes: item.notes,
                                    guide_number: item.guia,
                                    status: item.estatus
                                  })}
                                  className="p-1.5 bg-slate-50 hover:bg-[#2ec4f1]/10 hover:text-[#2ec4f1] text-slate-400 rounded-lg transition-colors" 
                                  title="Historial"
                                >
                                  <History className="w-3.5 h-3.5" />
                                </button>
                                <button className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-400 rounded-lg transition-colors" title="Ver Detalles">
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-400 rounded-lg transition-colors" title="Editar">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-400 rounded-lg transition-colors" title="Imprimir Etiqueta">
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={async () => {
                                    if (confirm('¿Está seguro de remover esta unidad de la caja?')) {
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
                                  className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-lg transition-colors ml-1"
                                  title="Eliminar de la caja"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
          );
        })()}

        {/* Modal Transferencia Masiva */}
        {showTransferModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#181c3a]/40 backdrop-blur-sm p-6">
            <Card className="max-w-2xl w-full shadow-2xl animate-rise-in p-0 overflow-hidden">
              <div className="bg-[#181c3a] p-6 text-white flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <ArrowLeftRight className="w-6 h-6 text-[#2ec4f1]" />
                  <h3 className="text-xl font-bold uppercase tracking-tight">Transferencia Masiva de Cajas</h3>
                </div>
                <button onClick={() => setShowTransferModal(false)} className="text-white/40 hover:text-white">✕</button>
              </div>

              <div className="p-8 space-y-8">
                {/* Pistoleo de Cajas */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">1. PISTOLÉE LAS CAJAS A MOVER</label>
                    <span className="text-[10px] font-bold text-[#2ec4f1] animate-pulse">MODO ESCÁNER ACTIVO</span>
                  </div>
                  <form onSubmit={handleScanForTransfer} className="relative group">
                    <QrCode className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-[#2ec4f1] group-focus-within:scale-110 transition-transform" />
                    <input 
                      type="text" 
                      autoFocus
                      placeholder="ESCANEÉ ID DE CAJA (EJ: BOX-001)..."
                      className="w-full h-20 pl-16 pr-6 bg-slate-50 border-2 border-slate-100 rounded-3xl text-2xl font-mono font-black outline-none focus:border-[#2ec4f1] focus:bg-white transition-all uppercase shadow-inner"
                      value={transferScanInput}
                      onChange={e => setTransferScanInput(e.target.value)}
                    />
                  </form>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Selección Actual ({selectedBoxesForTransfer.length})</label>
                  <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {inventory.map(box => {
                      const marcaStr = catMarcas.find((m: any) => m.id === (box.marca || box.brand_id))?.name || 'S/M';
                      const modeloStr = catModelos.find((m: any) => m.id === (box.modelo || box.model_id))?.name || '';
                      const boxCode = box.box_code || box.id;
                      const rackLoc = box.rack_location || box.rack || 'Sin Rack';
                      
                      return (
                        <div 
                          key={box.id}
                          onClick={() => {
                            if (selectedBoxesForTransfer.includes(box.id)) {
                              setSelectedBoxesForTransfer(selectedBoxesForTransfer.filter(id => id !== box.id));
                            } else {
                              setSelectedBoxesForTransfer([...selectedBoxesForTransfer, box.id]);
                            }
                          }}
                          className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex justify-between items-center ${selectedBoxesForTransfer.includes(box.id) ? 'border-[#2ec4f1] bg-[#2ec4f1]/5' : 'border-slate-100 bg-white hover:border-slate-200'}`}
                        >
                          <div>
                            <p className="text-sm font-black text-[#181c3a]">{boxCode}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">{marcaStr} {modeloStr} • {rackLoc}</p>
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedBoxesForTransfer.includes(box.id) ? 'bg-[#2ec4f1] border-[#2ec4f1]' : 'border-slate-200'}`}>
                            {selectedBoxesForTransfer.includes(box.id) && <div className="w-2 h-2 bg-white rounded-full" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">2. Área de Destino</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['Bodega Central', 'Bodega SCRAP', 'Bodega Obsoleto', 'Diagnóstico'].map(area => (
                        <button 
                          key={area}
                          onClick={() => setDestinationArea(area)}
                          className={`px-4 py-3 rounded-xl border-2 font-bold text-[10px] uppercase transition-all text-left flex items-center justify-between ${destinationArea === area ? 'border-[#2ec4f1] bg-[#2ec4f1]/5 text-[#181c3a]' : 'border-slate-100 text-slate-400 hover:border-slate-200'}`}
                        >
                          {area}
                          {destinationArea === area && <div className="w-2 h-2 bg-[#2ec4f1] rounded-full" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <Button variant="outline" className="flex-1 h-14 font-black uppercase tracking-widest text-[10px]" onClick={() => setShowTransferModal(false)}>Cancelar</Button>
                  <Button 
                    variant="primary" 
                    className="flex-1 h-14 font-black uppercase tracking-widest text-[10px] bg-[#181c3a]" 
                    onClick={handleExecuteTransfer}
                    disabled={selectedBoxesForTransfer.length === 0}
                  >
                    Ejecutar Movimiento ({selectedBoxesForTransfer.length})
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
      {/* MODAL DE TRAZABILIDAD (TIMELINE) */}
      {showTimeline && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#181c3a]/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl border-none overflow-hidden animate-rise-in p-0">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
               <div className="flex items-center gap-4">
                 <div className="w-12 h-12 bg-[#2ec4f1] rounded-2xl flex items-center justify-center text-[#181c3a] shadow-lg shadow-[#2ec4f1]/20">
                   <History size={24} />
                 </div>
                 <div>
                   <h3 className="text-xl font-black text-[#181c3a] uppercase tracking-tighter leading-none">Trazabilidad de la Guía</h3>
                   <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-widest font-mono">
                     {showTimeline.box_code ? `${showTimeline.box_code} · ` : ''}{showTimeline.guide_number}
                   </p>
                 </div>
               </div>
               <button onClick={() => setShowTimeline(null)} className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 hover:text-rose-500 transition-all border border-slate-100"><X size={20} /></button>
            </div>
            <div className="p-10 max-h-[60vh] overflow-y-auto custom-scrollbar bg-white">
               <div className="relative border-l-2 border-slate-100 ml-4 space-y-10">
                  {(() => {
                    if (loadingBoxHistory) {
                      return (
                        <div className="text-center py-20 opacity-50">
                          <Loader2 size={48} className="mx-auto mb-4 animate-spin" />
                          <p className="text-xs font-black uppercase tracking-widest">Cargando Historial Transaccional...</p>
                        </div>
                      );
                    }

                    if (boxHistoryData.length === 0) {
                      return (
                        <div className="text-center py-20 opacity-20">
                          <Clock size={48} className="mx-auto mb-4" />
                          <p className="text-xs font-black uppercase tracking-widest">Sin eventos registrados</p>
                        </div>
                      );
                    }

                    return (
                      <>
                        {boxHistoryData.map((event: any, idx: number) => {
                          const cleanTime = new Date(
                            event.timestamp || event.ts || event.created_at
                          ).toLocaleString();
                          let content = event.reason || `Movimiento: ${event.movement_type || 'EVENTO'}`;
                          if (!event.reason && event.movement_type) {
                            content = `Movimiento: ${event.movement_type}`;
                            if (event.source_location) content += ` | Origen: ${event.source_location}`;
                            if (event.target_location) content += ` | Destino: ${event.target_location}`;
                            if (event.series_count != null) content += ` | Series: ${event.series_count}`;
                          }

                          const operator = event.user_name || event.operator_name || 'Sistema';

                          const isLast = idx === boxHistoryData.length - 1;
                          return (
                            <div key={idx} className="relative group">
                              <div className="absolute -left-[23px] top-1/2 -mt-1.5 w-3 h-3 rounded-full bg-slate-200 group-hover:bg-[#2ec4f1] ring-4 ring-white shadow-sm transition-colors z-10" />
                              <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-md hover:border-[#2ec4f1]/30 transition-all">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <Clock size={12} className="text-slate-400" />
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{cleanTime}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-slate-400">
                                    <Info size={12} />
                                    <span className="text-[9px] font-black uppercase tracking-widest">{operator}</span>
                                  </div>
                                </div>
                                <p className="text-sm font-semibold text-[#181c3a]">{content}</p>
                              </div>
                              {!isLast && <div className="absolute left-[-17px] top-[calc(50%+6px)] bottom-[-calc(50%+6px)] w-[2px] bg-slate-100" />}
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
               </div>

               {timelineGuideDetails?.loading ? (
                 <div className="mt-8 text-center text-slate-400">
                   <div className="w-6 h-6 border-2 border-[#2ec4f1] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                   <p className="text-[10px] uppercase font-black tracking-widest">Cargando detalles de la guía...</p>
                 </div>
               ) : timelineGuideDetails?.data ? (
                 <div className="mt-10 pt-8 border-t-2 border-dashed border-slate-200">
                   <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                     <Box size={14} className="text-[#2ec4f1]" />
                     Equipos Registrados en esta Guía
                   </h4>
                   <div className="grid grid-cols-2 gap-4">
                     {timelineGuideDetails.data.service_orders?.map((so: any, i: number) => {
                       const marcaStr = catMarcas.find((m: any) => m.id === so.brand_id)?.name || '---';
                       const modeloStr = catModelos.find((m: any) => m.id === so.model_id)?.name || '---';
                       return (
                         <div key={so.id} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 group hover:border-[#2ec4f1]/30 transition-colors">
                           <div className="flex justify-between items-start mb-3">
                             <div>
                               <span className="text-[9px] font-black uppercase text-[#2ec4f1] tracking-widest block mb-0.5">{so.os_label}</span>
                               <span className="text-xs font-black text-[#181c3a]">{marcaStr} {modeloStr}</span>
                             </div>
                             <Badge variant="outline" className="bg-white border-slate-200 text-slate-400 text-[9px] font-black tracking-widest">
                               {so.series?.length || 0} SERIE{(so.series?.length || 0) !== 1 ? 'S' : ''}
                             </Badge>
                           </div>
                           <details className="group/details mt-3">
                             <summary className="text-[9px] font-black uppercase text-slate-400 cursor-pointer hover:text-[#2ec4f1] list-none outline-none select-none flex items-center justify-between p-2 bg-white border border-slate-100 rounded-lg transition-colors">
                               <span>Ver detalle de series en log</span>
                               <span className="group-open/details:rotate-180 transition-transform duration-300 text-[8px]">▼</span>
                             </summary>
                             <div className="space-y-1 mt-2 bg-white rounded-xl p-2 border border-slate-100 shadow-sm">
                               {so.series?.map((s: any, idx: number) => (
                                 <div key={idx} className="flex gap-2 items-center text-[10px] font-mono font-bold text-slate-500 bg-slate-50 p-1.5 rounded-lg">
                                   <span className="text-slate-400 w-6">S-{idx + 1}</span>
                                   <span className="text-[#181c3a]">{s.serial_number}</span>
                                 </div>
                               ))}
                             </div>
                           </details>
                         </div>
                       );
                     })}
                   </div>
                 </div>
               ) : timelineGuideDetails?.error ? (
                 <div className="mt-8 text-center text-rose-400 bg-rose-50 p-4 rounded-xl">
                   <p className="text-[10px] uppercase font-black tracking-widest">{timelineGuideDetails.error}</p>
                 </div>
               ) : null}

            </div>
            <div className="p-8 bg-slate-50 text-center border-t border-slate-100">
               <Badge className="bg-[#181c3a] text-white px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] border-none shadow-xl">
                 Estatus Actual: {showTimeline.status}
               </Badge>
            </div>
          </Card>
        </div>
      )}

      {/* PRINT OPTIONS MODAL */}
      {showPrintModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <Card className="w-full max-w-md p-6 bg-white shadow-2xl rounded-3xl border-slate-100 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-black text-[#181c3a]">Opciones de Impresión</h3>
              <button onClick={() => setShowPrintModal(null)} className="p-2 bg-slate-100 text-slate-400 rounded-full hover:bg-rose-100 hover:text-rose-500 transition-colors">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-6">Selecciona el formato de etiqueta que deseas imprimir para la caja <strong className="text-[#181c3a]">{showPrintModal.id}</strong>:</p>
            
            <div className="grid grid-cols-2 gap-4">
              <Button 
                variant="outline"
                className="flex flex-col items-center justify-center h-32 gap-3 bg-white border-2 border-slate-200 hover:border-[#2ec4f1] hover:bg-[#2ec4f1]/5 text-slate-600 hover:text-[#2ec4f1] transition-all rounded-2xl"
                onClick={() => { printBoxLabel(showPrintModal, 'simple'); setShowPrintModal(null); }}
              >
                <Printer size={32} strokeWidth={1.5} />
                <div className="text-center">
                  <span className="block font-black text-[12px]">Etiqueta Simple</span>
                  <span className="block font-normal text-[10px] opacity-70 mt-1">Identificador Exterior</span>
                </div>
              </Button>
              <Button 
                variant="outline"
                className="flex flex-col items-center justify-center h-32 gap-3 bg-white border-2 border-slate-200 hover:border-[#181c3a] hover:bg-[#181c3a]/5 text-slate-600 hover:text-[#181c3a] transition-all rounded-2xl"
                onClick={() => { printBoxLabel(showPrintModal, 'master'); setShowPrintModal(null); }}
              >
                <QrCode size={32} strokeWidth={1.5} />
                <div className="text-center">
                  <span className="block font-black text-[12px]">Caja Master</span>
                  <span className="block font-normal text-[10px] opacity-70 mt-1">Detalle de Series (Guía)</span>
                </div>
              </Button>
            </div>
          </Card>
        </div>
      )}
      {/* EDIT RACK MODAL */}
      {showRackModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <Card className="w-full max-w-md p-6 bg-white shadow-2xl rounded-3xl border-slate-100 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-black text-[#181c3a] flex items-center gap-2">
                <MapPin className="w-5 h-5 text-[#2ec4f1]" />
                Actualizar Ubicación (Rack)
              </h3>
              <button onClick={() => setShowRackModal(null)} className="p-2 bg-slate-100 text-slate-400 rounded-full hover:bg-rose-100 hover:text-rose-500 transition-colors">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-6">
              Ingrese las coordenadas exactas de la ubicación para la caja <strong className="text-[#181c3a]">{showRackModal.id}</strong>.
            </p>
            
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">
                    No. Rack
                  </label>
                  <input
                    type="text"
                    autoFocus
                    className="w-full h-12 px-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-[#2ec4f1] focus:bg-white transition-all uppercase"
                    placeholder="Ej: A"
                    value={rackNum}
                    onChange={(e) => setRackNum(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">
                    Nivel
                  </label>
                  <input
                    type="text"
                    className="w-full h-12 px-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-[#2ec4f1] focus:bg-white transition-all uppercase"
                    placeholder="Ej: 2"
                    value={rackNivel}
                    onChange={(e) => setRackNivel(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">
                    Posición
                  </label>
                  <input
                    type="text"
                    className="w-full h-12 px-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold outline-none focus:border-[#2ec4f1] focus:bg-white transition-all uppercase"
                    placeholder="Ej: A1"
                    value={rackPosicion}
                    onChange={(e) => setRackPosicion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUpdateRack();
                    }}
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <Button 
                  variant="outline" 
                  className="flex-1 h-12 font-black uppercase tracking-widest text-[10px]" 
                  onClick={() => setShowRackModal(null)}
                >
                  Cancelar
                </Button>
                <Button 
                  variant="primary" 
                  className="flex-1 h-12 font-black uppercase tracking-widest text-[10px] bg-[#181c3a]"
                  onClick={handleUpdateRack}
                  disabled={loading}
                >
                  {loading ? 'Guardando...' : 'Guardar Ubicación'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Modal Despacho */}
        {showDispatchModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#181c3a]/40 backdrop-blur-sm p-4">
            <Card className="w-full max-w-md shadow-2xl animate-rise-in p-0 overflow-hidden">
              <div className="bg-[#181c3a] p-5 text-white flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-lg">
                  <Truck className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-black text-lg">Procesar Series de Inventario</h3>
                  <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">{showDispatchModal.id}</p>
                </div>
              </div>
              
              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-600">
                  Selecciona las series que deseas extraer. La caja quedará con las series restantes.
                </p>
                
                <div className="flex bg-slate-100 p-1 rounded-lg">
                  <button 
                    onClick={() => setDispatchAction('despacho')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${dispatchAction === 'despacho' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}
                  >
                    Despachar (Salida)
                  </button>
                  <button 
                    onClick={() => setDispatchAction('traslado')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${dispatchAction === 'traslado' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                  >
                    Trasladar a Área
                  </button>
                </div>
                <div className="space-y-2 mt-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pistolear Serie</label>
                  <div className="relative">
                    <QrCode className="absolute left-3 top-2.5 h-4 w-4 text-emerald-500" />
                    <input 
                      type="text" 
                      placeholder="Escanea la serie aquí..." 
                      className="w-full bg-slate-50 pl-9 pr-3 py-2 text-sm border border-emerald-200 focus:border-emerald-500 rounded-lg outline-none transition-colors"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = e.currentTarget.value.trim();
                          if (val) {
                            const exists = showDispatchModal.series?.find((s: any) => s.serial_number === val || s.id === val);
                            if (exists) {
                              const sn = exists.serial_number || exists.id;
                              if (!selectedSeriesForDispatch.includes(sn)) {
                                setSelectedSeriesForDispatch(prev => [...prev, sn]);
                              }
                            } else {
                              alert("La serie " + val + " no pertenece a esta caja.");
                            }
                            e.currentTarget.value = '';
                          }
                        }
                      }}
                      autoFocus
                    />
                  </div>
                </div>

                {selectedSeriesForDispatch.length > 0 && (
                  <div className="border border-emerald-100 bg-emerald-50/50 rounded-xl p-3 mt-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Series Escaneadas</span>
                      <span className="text-[10px] font-bold bg-emerald-500 text-white px-2 py-0.5 rounded-full">{selectedSeriesForDispatch.length} listas</span>
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto">
                      {selectedSeriesForDispatch.map((sn, idx) => (
                        <div key={idx} className="bg-white border border-emerald-200 text-emerald-700 text-xs font-mono font-bold px-2 py-1 rounded-md flex items-center gap-2">
                          {sn}
                          <button 
                            className="text-emerald-300 hover:text-red-500 transition-colors"
                            onClick={() => setSelectedSeriesForDispatch(prev => prev.filter(item => item !== sn))}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {dispatchAction === 'despacho' ? (
                  <>
                    <div className="space-y-2 mt-4">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Conduce de Salida *</label>
                      <input 
                        type="text"
                        value={dispatchDestination}
                        readOnly
                        placeholder="Generando código..."
                        className="w-full bg-slate-100 text-slate-500 p-3 rounded-xl border border-slate-200 font-bold text-sm outline-none cursor-not-allowed"
                      />
                    </div>
    
                    <div className="space-y-2 mt-4">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Notas Adicionales (Opcional)</label>
                      <textarea 
                        value={dispatchNotes}
                        onChange={(e) => setDispatchNotes(e.target.value)}
                        placeholder="Observaciones adicionales sobre el despacho..."
                        className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-emerald-500 transition-colors"
                        rows={2}
                      />
                    </div>
                    <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex gap-3 mt-4">
                      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                      <p className="text-xs text-amber-700 leading-tight">
                        Esta acción actualizará el estado de todas las series escaneadas a "Despachado" y saldrán de esta caja.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2 mt-4">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Área de Destino *</label>
                      <select 
                        value={dispatchArea}
                        onChange={(e) => setDispatchArea(e.target.value)}
                        className="w-full bg-white text-slate-700 p-3 rounded-xl border border-slate-200 font-bold text-sm outline-none focus:border-indigo-500 transition-colors"
                      >
                        <option value="Diagnóstico">Diagnóstico</option>
                        <option value="Reparación">Reparación (Calidad)</option>
                        <option value="Bodega Central">Reacondicionado (Bodega)</option>
                        <option value="L3">L3</option>
                        <option value="Bodega SCRAP">SCRAP</option>
                        <option value="Bodega Obsoleto">Obsoleto</option>
                      </select>
                    </div>
                    <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-xl flex gap-3 mt-4">
                      <AlertCircle className="w-5 h-5 text-indigo-600 shrink-0" />
                      <p className="text-xs text-indigo-700 leading-tight">
                        Esta acción desvinculará las series de la caja y las moverá al área de {dispatchArea} para ser trabajadas.
                      </p>
                    </div>
                  </>
                )}
              </div>

              <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowDispatchModal(null);
                    setDispatchDestination('');
                    setDispatchNotes('');
                    setSelectedSeriesForDispatch([]);
                    setDispatchAction('despacho');
                  }}
                  disabled={isDispatching}
                >
                  Cancelar
                </Button>
                <Button 
                  className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 border-none"
                  onClick={() => handleDispatchBox(showDispatchModal.id, showDispatchModal.realDbId)}
                  disabled={isDispatching || !dispatchDestination.trim()}
                >
                  {isDispatching ? 'Procesando...' : dispatchAction === 'despacho' ? 'Confirmar Despacho' : 'Confirmar Traslado'}
                </Button>
              </div>
            </Card>
          </div>
        )}
    </ModulePage>
  );
}
