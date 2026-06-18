// Backoffice Production Module
"use client";

import React, { useState, useEffect } from 'react';
import { Card, Badge, Button } from '@/components/ui';
import { getActualUserFullName } from '@/lib/auth';
import { ModulePage } from '@/components/module-page';
import { 
  Search, 
  CheckCircle2, 
  Monitor,
  Database,
  Plus,
  Trash2,
  Table,
  Hash,
  Truck,
  Box,
  ChevronLeft,
  ChevronDown,
  Barcode,
  History,
  Clock,
  FileText,
  Package,
  Radio,
  Eye,
  Edit2,
  Edit3,
  X,
  Download,
  Printer,
  RefreshCw,
  Camera,
  MapPin,
  UserCheck,
  Phone,
  Calendar,
  Stethoscope,
  RotateCcw
} from 'lucide-react';
import { getReceptions, createReception, updateReceptionStatus, updateProcessedGuides, addSeriesToReception, createServiceOrders, getSeriesByReceptionId, getReceptionsWithSeries, updateReception, clearAllReceptions, fixMissingOS } from '@/lib/database/receptions';
import { testSupabaseConnection } from '@/lib/supabase/test-connection';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  getTechnologies, getBrands, getModels, getAgencies
} from '@/lib/database/config';

type GuideItem = {
  id: number;
  tipo: string;
  marca: string;
  modelo: string;
  cantidad: number;
  scannedCount: number;
  series: string[][]; // Array of units, each unit is an array of series strings
  seriesPerUnit: number;
};

// Tipos para catálogos dinámicos (cargados desde Supabase → Configuración del Sistema)
type CatalogTech = { id: string; nombre: string; seriesCount: number };
type CatalogBrand = { id: string; nombre: string };
type CatalogModel = { id: string; marcaId: string; nombre: string; tecnologiaId: string; seriesCount: number; digitsPerSeries: number[] };
type CatalogAgency = { id: string; name: string; manager: string; email: string; direccion: string };

const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(event.target?.result as string);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

type ReceptionStep = 'category_selection' | 'classification' | 'initial' | 'config' | 'scanning' | 'return_confirmation' | 'sub_bodega_transfer' | 'completed';

// Helper function moved outside to avoid scope issues
const getReceiverName = (rec: any) => {
  if (!rec) return 'SISTEMA';
  const cacReceiverMatch = rec.notes?.split('Recibido Por: ')?.[1]?.split('\n')?.[0]?.trim();
  const cacReceiver = cacReceiverMatch ? cacReceiverMatch.split('@')[0].toUpperCase() : null;

  const backofficeReceiversMatch = rec.notes?.match(/Por:\s*([^\n]+)/g);
  let backofficeReceivers = [];
  if (backofficeReceiversMatch) {
    backofficeReceivers = Array.from(new Set(backofficeReceiversMatch.map((m: string) => m.replace('Por:', '').trim().toUpperCase())));
  }
  
  if (backofficeReceivers.length > 0) return backofficeReceivers.join(' / ');
  if (cacReceiver) return cacReceiver;
  if (rec.received_by) return rec.received_by.split('@')[0].toUpperCase();
  if (rec.usuario) return rec.usuario.split('@')[0].toUpperCase();
  
  return 'SISTEMA';
};

const getAgenciaLabel = (rec: any, agencies: CatalogAgency[], guideId?: string) => {
  if (!rec) return '---';
  let metaAgency = '';
  
  if (guideId && rec.notes) {
      const gEscaped = guideId.replace(/[-]/g, '\\-');
      const guideBlockRegex = new RegExp(`\\[Guía.*?(?:${gEscaped}).*?\\][\\s\\S]*?(?=\\[Guía|---|$)`, 'i');
      const match = rec.notes.match(guideBlockRegex);
      if (match) {
          metaAgency = match[0].split('Backoffice_Agency: ')[1]?.split('\n')[0]?.trim() || '';
      }
  }
  
  if (!metaAgency) {
      metaAgency = (rec.notes || '').split('Backoffice_Agency: ')[1]?.split('\n')[0]?.trim() || '';
  }
  
  if (metaAgency) {
    const matched = agencies.find(a => a.name.toUpperCase() === metaAgency.toUpperCase());
    return matched ? `${matched.id} — ${matched.name}` : metaAgency;
  }
  
  const agencyInCarrier = agencies.find(a => 
    rec.carrier?.toUpperCase().includes(a.name.toUpperCase()) ||
    rec.carrier?.toUpperCase().includes(a.id.toUpperCase())
  );
  if (agencyInCarrier) return `${agencyInCarrier.id} — ${agencyInCarrier.name}`;
  
  return rec.carrier || 'Agencia Central';
};

export default function BackofficePage() {
  const [activeTab, setActiveTab] = useState<'op' | 'history' | 'sub_accesorios' | 'sub_telefonos'>('op');
  const [receptionStep, setReceptionStep] = useState<ReceptionStep>('category_selection');
  const [accessoryPhotos, setAccessoryPhotos] = useState<string[]>([]);
  
  // Data State
  const [scannedGuides, setScannedGuides] = useState<string[]>([]);
  const [processedGuides, setProcessedGuides] = useState<string[]>([]);
  const [inboxSearch, setInboxSearch] = useState('');
  const [classificationSearch, setClassificationSearch] = useState('');
  const [dateFilterFrom, setDateFilterFrom] = useState('');
  const [dateFilterTo, setDateFilterTo] = useState('');

  const handleExportReport = async () => {
    // Usar la misma lógica de filtrado de la tabla UI
    const filteredRecords = historyReceptions
      .filter(r => {
        if (!dateFilterFrom && !dateFilterTo) return true;
        const d = new Date(r.created_at);
        if (dateFilterFrom && d < new Date(dateFilterFrom + 'T00:00:00')) return false;
        if (dateFilterTo) {
          const to = new Date(dateFilterTo + 'T23:59:59');
          if (d > to) return false;
        }
        return true;
      })
      .filter(r => {
        if (!historySearch) return true;
        const s = historySearch.toLowerCase();
        const piloto = r.notes?.split('Piloto: ')[1]?.split('\n')[0]?.toLowerCase() || '';
        const agencia = getAgenciaLabel(r, CAC_AGENCIES).toLowerCase();
        const sapDoc = (r.sap_document || '').toLowerCase();
        const matchingSeries = (r.series || []).some((ser: any) => 
          (ser.serial_number || '').toLowerCase().includes(s)
        );
        return r.guide_number.toLowerCase().includes(s) || 
               piloto.includes(s) || 
               agencia.includes(s) ||
               sapDoc.includes(s) ||
               (r.carrier || '').toLowerCase().includes(s) ||
               matchingSeries;
      });

    if (filteredRecords.length === 0) {
      alert("No hay datos que coincidan con la búsqueda o filtros actuales.");
      return;
    }

    const rows: any[] = [];
    
    filteredRecords.forEach(rec => {
      const dateObj = new Date(rec.created_at);
      const formattedDate = `${dateObj.getDate()}-${dateObj.getMonth() + 1}-${dateObj.getFullYear()} ${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;
      
      const rawNotes = rec.notes || '';
      let displayGuide = rec.guide_number;
      if (rec.processed_guides?.length > 0) {
         const equipoGuides = [];
         for (const g of rec.processed_guides) {
            const gEscaped = g.replace(/[-]/g, '\\-');
            const guideBlockRegex = new RegExp(`\\[Guía.*?(?:${gEscaped}).*?\\][\\s\\S]*?(?=\\[Guía|$)`, 'i');
            const guideBlockMatch = rawNotes.match(guideBlockRegex);
            if (guideBlockMatch && guideBlockMatch[0].toLowerCase().includes('equipo')) {
               equipoGuides.push(g);
           }
         }
         if (equipoGuides.length > 0) {
            displayGuide = Array.from(new Set(equipoGuides)).join(' / ');
         } else {
            displayGuide = Array.from(new Set(rec.processed_guides)).join(' / ');
         }
      }
      
      const piloto = rec.notes?.split('Piloto: ')[1]?.split('\n')[0] || '---';
      const agencia = getAgenciaLabel(rec, CAC_AGENCIES);
      const equipGroups = groupSeriesByEquipment(rec.series || []);
      
      if (equipGroups.length === 0) {
        const techVal = (rec.notes || '').split('Backoffice_Tech: ')[1]?.split('\n')[0] || '';
        const brandVal = (rec.notes || '').split('Backoffice_Brand: ')[1]?.split('\n')[0] || '';
        const modelVal = (rec.notes || '').split('Backoffice_Model: ')[1]?.split('\n')[0] || '';
        const categoryVal = (rec.notes || '').split('Backoffice_Category: ')[1]?.split('\n')[0] || '';
        
        let label = rec.status === 'PENDIENTE_BACKOFFICE' ? 'EN BACKOFFICE' : rec.status;
        if (rec.status === 'CLASIFICADA' || rec.status === 'RECIBIDO_BACKOFFICE') {
          label = 'INGRESADO A BACKOFFICE';
        }

        rows.push({
          'Fecha / Hora': formattedDate,
          'No. Guía': displayGuide,
          'Piloto': piloto,
          'Courier': rec.carrier || '---',
          'Recibió': getReceiverName(rec),
          'Estatus': label,
          'Orden de Servicio': '---',
          'Ingreso': '---',
          'Agencia CAC': agencia,
          'Tecnología': techVal || (categoryVal ? (categoryVal.toLowerCase() === 'accesorio' ? 'ACCESORIOS' : 'MÓVILES') : '---'),
          'Marca': brandVal || '---',
          'Modelo': modelVal || (categoryVal ? (categoryVal.toLowerCase() === 'accesorio' ? 'LOTE ACCESORIOS' : 'LOTE TELÉFONOS') : 'SIN EQUIPOS REGISTRADOS'),
          'Traslado SAP': rec.sap_document || '---',
          'S-1': '---',
          'S-2': '---',
          'S-3': '---',
          'S-4': '---'
        });
      } else {
        equipGroups.forEach(grp => {
          const modelObj = MASTER_MODELOS.find(m => m.id === grp.modelId);
          const brandObj = MASTER_MARCAS.find(b => b.id === grp.brandId);
          const techObj = modelObj ? MASTER_TECNOLOGIAS.find(t => t.id === modelObj.tecnologiaId) : null;
          const seriesPerUnit = modelObj?.seriesCount || 1;
          
          const units: any[][] = [];
          for (let i = 0; i < grp.fullSeries.length; i += seriesPerUnit) {
            units.push(grp.fullSeries.slice(i, i + seriesPerUnit));
          }

          units.forEach(unit => {
            const osLabel = unit.find((u: any) => u?.service_orders?.os_label)?.service_orders?.os_label || '---';
            const reentry = unit.find((u: any) => u?.service_orders?.reentry_count)?.service_orders?.reentry_count || 1;

            let unitGuide = displayGuide;
            if (unit[0]?.serial_number && rec.processed_guides?.length > 0) {
              for (const g of rec.processed_guides) {
                const gEscaped = g.replace(/[-]/g, '\\-');
                const guideBlockRegex = new RegExp(`\\[Guía.*?(?:${gEscaped}).*?\\][\\s\\S]*?(?=\\[Guía|$)`, 'i');
                const guideBlockMatch = rawNotes.match(guideBlockRegex);
                if (guideBlockMatch && guideBlockMatch[0].includes(unit[0].serial_number)) {
                  unitGuide = g;
                  break;
                }
              }
            }
            
            rows.push({
              'Fecha / Hora': formattedDate,
              'No. Guía': unitGuide,
              'Piloto': piloto,
              'Courier': rec.carrier || '---',
              'Recibió': getReceiverName(rec),
              'Estatus': 'RECIBIDO',
              'Orden de Servicio': osLabel,
              'Ingreso': `${reentry}° Ingreso`,
              'Agencia CAC': agencia,
              'Tecnología': techObj?.nombre || '---',
              'Marca': brandObj?.nombre || '---',
              'Modelo': modelObj?.nombre || '---',
              'Traslado SAP': rec.sap_document || '---',
              'S-1': unit[0]?.serial_number || '---',
              'S-2': unit[1]?.serial_number || '---',
              'S-3': unit[2]?.serial_number || '---',
              'S-4': unit[3]?.serial_number || '---'
            });
          });
        });
      }
    });

    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Histórico');
    XLSX.writeFile(wb, `Reporte_Backoffice_${dateFilterFrom || 'inicio'}_a_${dateFilterTo || 'fin'}.xlsx`);
  };
  const [currentGuideInput, setCurrentGuideInput] = useState('');
  const [agencia, setAgencia] = useState('');
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>('');
  const [category, setCategory] = useState<'Equipo' | 'Accesorio' | 'Teléfono'>('Equipo');
  const [guideItems, setGuideItems] = useState<GuideItem[]>([]);
  const [returnReason, setReturnReason] = useState('');
  const [returnTracking, setReturnTracking] = useState('');
  const [returnCourier, setReturnCourier] = useState('');
  const [sapTransferNumber, setSapTransferNumber] = useState('');
  
  // Form State for new item
  const [newItem, setNewItem] = useState({ tipo: '', marca: '', modelo: '', cantidad: 0 });

  // --- Catálogos dinámicos desde Supabase ---
  const [CAC_AGENCIES, setCAC_AGENCIES] = useState<CatalogAgency[]>([]);
  const [MASTER_TECNOLOGIAS, setMASTER_TECNOLOGIAS] = useState<CatalogTech[]>([]);
  const [MASTER_MARCAS, setMASTER_MARCAS] = useState<CatalogBrand[]>([]);
  const [MASTER_MODELOS, setMASTER_MODELOS] = useState<CatalogModel[]>([]);

  // Scanning State
  const [currentScanningIndex, setCurrentScanningIndex] = useState(0);
  const [currentSN, setCurrentSN] = useState('');
  const [pendingReceptions, setPendingReceptions] = useState<any[]>([]);
  const [currentUserFullName, setCurrentUserFullName] = useState('SISTEMA');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = React.useRef(false);

  useEffect(() => {
    async function initUser() {
      const name = await getActualUserFullName();
      setCurrentUserFullName(name);
    }
    initUser();
  }, []);

  const [activeReception, setActiveReception] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const [selectedReception, setSelectedReception] = useState<any>(null);
  const [selectedReceptionSeries, setSelectedReceptionSeries] = useState<any[]>([]);
  const [isLoadingSeries, setIsLoadingSeries] = useState(false);

  const handleViewReception = async (r: any) => {
    setSelectedReception(r);
    setIsLoadingSeries(true);
    try {
      const series = await getSeriesByReceptionId(r.id);
      setSelectedReceptionSeries(series || []);
    } catch (err) {
      console.error(err);
      setSelectedReceptionSeries([]);
    }
    setIsLoadingSeries(false);
  };
  
  // UI Selection State
  const [showAgencyModal, setShowAgencyModal] = useState(false);
  const [agencySearch, setAgencySearch] = useState('');
  const [itemSeriesInputs, setItemSeriesInputs] = useState<{[key: number]: string}>({});
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Helper para generar ID de Movimiento Único
  const generateMovId = () => `MOV-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  const [bulkTargetIdx, setBulkTargetIdx] = useState<number | null>(null);
  const [selectedItemIdx, setSelectedItemIdx] = useState<number | null>(null);

  // History & Edit State
  const [historySeries, setHistorySeries] = useState<any[]>([]);
  const [selectedHistoryReception, setSelectedHistoryReception] = useState<any | null>(null);
  const [historyModalSeries, setHistoryModalSeries] = useState<any[]>([]);
  const [guideModalSeries, setGuideModalSeries] = useState<any[]>([]);
  const [historyReceptions, setHistoryReceptions] = useState<any[]>([]);
  const [allReceptions, setAllReceptions] = useState<any[]>([]);
  const [editMetaRec, setEditMetaRec] = useState<any | null>(null);
  const [editMeta, setEditMeta] = useState({ agency: '', tech: '', brand: '', model: '' });
  const [editMetaSaving, setEditMetaSaving] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [historySearch, setHistorySearch] = useState('');
  const [showTimeline, setShowTimeline] = useState<any | null>(null);
  const [timelineActiveGuide, setTimelineActiveGuide] = useState<string | null>(null);

  const handleFixMissingOS = async (recId: string, unit: any[], modelId: string, brandId: string) => {
    if (!unit || unit.length === 0) return;
    const confirmFix = window.confirm('¿Desea generar la Orden de Servicio faltante para esta unidad?');
    if (!confirmFix) return;

    try {
      const allSerials = unit.map((s: any) => s.serial_number);
      const payload = {
        main_serial: allSerials[0],
        all_series: allSerials,
        model_id: modelId,
        brand_id: brandId
      };
      
      const res = await fixMissingOS(recId, payload);
      if (res.error) throw new Error(res.error);
      
      alert('✅ Orden de Servicio generada correctamente.');
      fetchHistory(); // Recargar historial
    } catch (err: any) {
      alert('❌ Error al generar OS: ' + err.message);
    }
  };

  // Mass Transfer to Workshop State
  const [showMassTransferModal, setShowMassTransferModal] = useState(false);
  const [massTransferData, setMassTransferData] = useState({
    techId: '',
    brandId: '',
    modelId: '',
    quantity: '' as number | ''
  });
  const [massTransferLoading, setMassTransferLoading] = useState(false);
  
  // Mass Transfer Scanning State
  const [isScanningForTransfer, setIsScanningForTransfer] = useState(false);
  const [scannedTransferSeries, setScannedTransferSeries] = useState<string[]>([]);
  const [currentScanInput, setCurrentScanInput] = useState('');
  const [eligibleSeriesIdsList, setEligibleSeriesIdsList] = useState<{allIds: string[], sn: string}[]>([]);

  // Auto-find or Selected Agency Details
  const agencyDetails = CAC_AGENCIES.find(a => 
    a.id === selectedAgencyId ||
    activeReception?.carrier?.toUpperCase().includes(a.name.toUpperCase()) ||
    activeReception?.carrier?.toUpperCase().includes(a.id.toUpperCase())
  );

  useEffect(() => {
    fetchPending();
    loadCatalogs();
  }, []);

  const loadCatalogs = async () => {
    try {
      const [techs, brands, models, agencies] = await Promise.all([
        getTechnologies(), getBrands(), getModels(), getAgencies()
      ]);
      setMASTER_TECNOLOGIAS(techs.map((t: any) => ({ id: t.id, nombre: t.name, seriesCount: t.series_count || 1 })));
      setMASTER_MARCAS(brands.map((b: any) => ({ id: b.id, nombre: b.name })));
      setMASTER_MODELOS(models.map((m: any) => ({ id: m.id, marcaId: m.brand_id, nombre: m.name, tecnologiaId: m.technology_id, seriesCount: m.series_count || 1, digitsPerSeries: m.digits_per_series || [12] })));
      setCAC_AGENCIES(agencies.map((a: any) => ({ 
        id: a.code, 
        name: a.name, 
        manager: a.manager || 'Encargado Pendiente', 
        email: a.email || 'correo@agencia.com', 
        direccion: a.address || 'Dirección no registrada',
        telefono: a.phone || '000-000-0000'
      })));
    } catch (err) {
      console.error('Error loading catalogs from Supabase:', err);
    }
  };

  useEffect(() => {
    if (activeReception && !selectedAgencyId) {
       const found = CAC_AGENCIES.find(a => 
         activeReception.carrier?.toUpperCase().includes(a.name.toUpperCase()) ||
         activeReception.carrier?.toUpperCase().includes(a.id.toUpperCase())
       );
       if (found) setSelectedAgencyId(found.id);
    }
  }, [activeReception]);

  // Expandir/Contraer filas de la tabla
  const toggleRow = (id: string) => setExpandedRows(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // Agrupa series por modelo/marca dentro de una recepción
  const groupSeriesByEquipment = (series: any[]) => {
    const groups = new Map<string, { modelId: string; brandId: string; fullSeries: any[] }>();
    for (const s of series) {
      if (!s.brand_id) continue;
      const key = (s.model_id || '') + '|' + (s.brand_id || '');
      if (!groups.has(key)) groups.set(key, { modelId: s.model_id, brandId: s.brand_id, fullSeries: [] });
      groups.get(key)!.fullSeries.push(s);
    }
    return Array.from(groups.values());
  };
  
  useEffect(() => {
    if (activeTab === 'history') {
      fetchPending();
      fetchHistory();
    }
  }, [activeTab]);

  const filteredAgencies = CAC_AGENCIES.filter(a => 
    a.name.toLowerCase().includes(agencySearch.toLowerCase()) || 
    a.id.toLowerCase().includes(agencySearch.toLowerCase())
  );

  // Filtrado Dinámico de Marcas y Modelos
  const availableBrandsConfig = MASTER_MARCAS.filter(b => 
    !newItem.tipo || MASTER_MODELOS.some(m => m.marcaId === b.id && m.tecnologiaId === newItem.tipo)
  );

  const availableModels = MASTER_MODELOS.filter(m => 
    (!newItem.tipo || m.tecnologiaId === newItem.tipo) && 
    (!newItem.marca || m.marcaId === newItem.marca)
  );

  const availableBrandsMassTransfer = MASTER_MARCAS.filter(b => 
    !massTransferData.techId || MASTER_MODELOS.some(m => m.marcaId === b.id && m.tecnologiaId === massTransferData.techId)
  );

  const fetchPending = async () => {
    setLoading(true);
    try {
      const data = await getReceptions(); 
      setAllReceptions(data);
      const pending = data.filter((r: any) => 
        (r.source !== 'px' || r.status === 'PENDIENTE_BACKOFFICE') &&
        r.status !== 'RECIBIDO_BACKOFFICE' && 
        r.status !== 'PROCESADO' &&
        r.status !== 'CLASIFICADA' &&
        r.status !== 'DEVUELTO_A_AGENCIA' &&
        r.status !== 'FINALIZADO' &&
        r.status !== 'ELIMINADO' &&
        r.status !== 'ELIMINADO POR BODEGA'
      );
      setPendingReceptions(pending);
    } catch (error) {
      console.error("Error fetching receptions:", error);
    }
    setLoading(false);
  };

  const fetchHistory = async () => {
    try {
      const data = await getReceptionsWithSeries(); 
      // Filtrar para mostrar únicamente registros de categoría EQUIPOS (o que contengan series y no sean accesorios/móviles)
      const filtered = data.map((rec: any) => {
        const boxedOsIds = new Set(
          (rec.series || [])
            .filter((s: any) => s.current_box_id && s.service_orders?.id)
            .map((s: any) => s.service_orders.id)
        );

        return {
          ...rec,
          series: rec.series ? rec.series.filter((s: any) => {
            if (s.current_box_id) return false;
            if (s.service_orders?.id && boxedOsIds.has(s.service_orders.id)) return false;
            const cStatus = (s.current_status || '').toLowerCase().trim();
            const shouldFilter = ['in_workshop', 'in_qc', 'in_l3', 'in_scraps', 'in_control_warehouse', 'in_central_warehouse', 'ready_to_dispatch', 'dispatched'].includes(cStatus);
            console.log(`DEBUG_FILTER: Serie ${s.serial_number} has status: "${s.current_status}" -> cStatus: "${cStatus}" -> shouldFilter: ${shouldFilter}`);
            if (shouldFilter) return false;
            return true;
          }) : []
        };
      }).filter((rec: any) => {
        const notes = (rec.notes || '').toLowerCase();
        // Leer categorías desde reception_guides si están disponibles (Fase 3)
        // Fallback a notes para registros históricos previos a la migración
        const guideCategories: string[] = (rec.reception_guides || []).map((rg: any) => (rg.category || '').toLowerCase());
        const hasAccesorio = guideCategories.some((c: string) => c === 'accesorio') || notes.includes('backoffice_category: accesorio');
        const hasTelefono = guideCategories.some((c: string) => c === 'telefono') || notes.includes('backoffice_category: teléfono') || notes.includes('backoffice_category: movil');
        const hasEquipo = guideCategories.some((c: string) => c === 'equipo') || notes.includes('backoffice_category: equipo');
        
        // We have to duplicate the grouping logic here, but it's lightweight enough.
        let validSeriesCount = 0;
        for (const s of (rec.series || [])) {
          if (s.brand_id) validSeriesCount++;
        }

        // Si tiene equipos sin empaquetar, se muestra en el Historial Backoffices para proceder.
        return validSeriesCount > 0;
      });
      setHistoryReceptions(filtered);
    } catch (error) {
      console.error("Error fetching history with series:", error);
    }
  };

  const handlePrepareMassTransfer = () => {
    if (!massTransferData.techId || !massTransferData.brandId || !massTransferData.modelId || !massTransferData.quantity) {
      alert("Por favor completa todos los campos.");
      return;
    }

    const eligibleSeriesList: {allIds: string[], sn: string}[] = [];
    for (const rec of historyReceptions) {
      const groups = groupSeriesByEquipment(rec.series || []);
      for (const grp of groups) {
        const modelObj = MASTER_MODELOS.find((m: any) => m.id === grp.modelId);
        const techId = modelObj?.tecnologiaId;
        
        if (techId === massTransferData.techId &&
            grp.brandId === massTransferData.brandId &&
            grp.modelId === massTransferData.modelId) {
          
          const seriesPerUnit = modelObj?.seriesCount || 1;
          for (let i = 0; i < grp.fullSeries.length; i += seriesPerUnit) {
            const unit = grp.fullSeries.slice(i, i + seriesPerUnit);
            if (unit.length > 0) {
              eligibleSeriesList.push({ 
                allIds: unit.map(u => u.id), 
                sn: unit[0].serial_number 
              });
            }
          }
        }
      }
    }

    if (eligibleSeriesList.length < Number(massTransferData.quantity)) {
      alert(`No hay suficientes equipos disponibles en la selección. Disponibles: ${eligibleSeriesList.length}`);
      return;
    }

    setEligibleSeriesIdsList(eligibleSeriesList);
    setScannedTransferSeries([]);
    setCurrentScanInput('');
    setIsScanningForTransfer(true);
    setShowMassTransferModal(false);
  };

  const handleScanTransferSeries = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && currentScanInput.trim()) {
      e.preventDefault();
      if (scannedTransferSeries.length >= Number(massTransferData.quantity)) {
        alert("Ya has alcanzado la cantidad solicitada a trasladar.");
        return;
      }
      
      const sn = currentScanInput.trim();
      
      if (scannedTransferSeries.includes(sn)) {
        alert("Esta serie ya fue escaneada para traslado.");
        setCurrentScanInput('');
        return;
      }
      
      const isEligible = eligibleSeriesIdsList.find(s => s.sn === sn);
      if (!isEligible) {
        alert("La serie ingresada NO corresponde a la tecnología, marca y modelo seleccionados, o no está disponible en la bandeja.");
        setCurrentScanInput('');
        return;
      }
      
      setScannedTransferSeries([...scannedTransferSeries, sn]);
      setCurrentScanInput('');
    }
  };

  const handleConfirmMassTransfer = async () => {
    if (scannedTransferSeries.length !== Number(massTransferData.quantity)) {
      alert(`Debe escanear exactamente ${massTransferData.quantity} series.`);
      return;
    }

    setMassTransferLoading(true);
    try {
      const seriesToTransfer = scannedTransferSeries.flatMap(sn => {
        return eligibleSeriesIdsList.find(s => s.sn === sn)!.allIds;
      });
      
      const { transferMassiveToWorkshop } = await import('@/lib/database/workshop');
      const result = await transferMassiveToWorkshop(seriesToTransfer);
      
      if (result.error) throw new Error(result.error);
      
      alert(`Se trasladaron exitosamente ${seriesToTransfer.length} equipos al Taller.`);
      setIsScanningForTransfer(false);
      setScannedTransferSeries([]);
      setMassTransferData({ techId: '', brandId: '', modelId: '', quantity: '' });
      fetchHistory();
    } catch (error: any) {
      alert("Error en el traslado: " + error.message);
    }
    setMassTransferLoading(false);
  };

  const handlePrintConduce = (record: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Generar un número de recepción numérico a partir del ID o Timestamp
    const numericId = record.created_at 
      ? new Date(record.created_at).getTime().toString().slice(-8)
      : Math.floor(10000000 + Math.random() * 90000000).toString();

    const operatorName = getReceiverName(record);
    
    // Extraer datos de las notas
    const pilot = record.notes?.split('Piloto: ')[1]?.split(/\\n|\n/)[0] || '---';
    const cleanNotes = (record.notes || '').split('--- LÍNEA DE TIEMPO')[0].split('Backoffice_')[0].split('Guías Procesadas:')[0];
    const notesGuias = cleanNotes?.split('Guías: ')[1]?.split(/\\n|\n/)[0]?.split(',').map((g: string) => g.trim()).filter(Boolean) || [];
    const guias = (record.processed_guides && record.processed_guides.length > 0) 
      ? record.processed_guides 
      : (notesGuias.length > 0 ? notesGuias : (record.guide_number ? [record.guide_number] : []));

    const guideRows = guias.map((g: string, i: number) => `
      <tr>
        <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 11px;">${i + 1}</td>
        <td style="padding: 10px; border: 1px solid #e2e8f0; font-family: monospace; font-weight: bold; color: #181c3a; font-size: 14px;">${g}</td>
        <td style="padding: 10px; border: 1px solid #e2e8f0; color: #64748b; font-size: 11px; text-transform: uppercase;">Bulto / Guía CAC</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Conduce de Recepción CAC - ${numericId}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
            body { font-family: 'Inter', sans-serif; padding: 40px; color: #1e293b; line-height: 1.5; }
            .header { border-bottom: 4px solid #181c3a; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end; }
            .badge { background: #2ec4f1; color: #181c3a; padding: 4px 12px; border-radius: 6px; font-size: 10px; font-weight: 900; text-transform: uppercase; }
            .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 30px; }
            .card { background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; }
            .label { font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; display: block; }
            .value { font-size: 14px; font-weight: bold; color: #1e293b; }
            h2 { font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; margin: 30px 0 15px 0; border-left: 4px solid #2ec4f1; padding-left: 10px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th { background: #f8fafc; padding: 12px; text-align: left; font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; border: 1px solid #e2e8f0; }
            .signature { margin-top: 80px; display: grid; grid-template-columns: 1fr 1fr; gap: 100px; }
            .sig-line { border-top: 1px solid #94a3b8; text-align: center; padding-top: 10px; font-size: 10px; font-weight: bold; color: #64748b; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="header">
            <div>
              <div class="badge">Acuse de Recibo - Backoffice CAC</div>
              <h1 style="margin: 10px 0 0 0; font-size: 28px; font-weight: 900; letter-spacing: -1px;">Conduce de Recepción</h1>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: 900; color: #181c3a; font-size: 18px;">REC-${numericId}</div>
              <div style="font-size: 10px; color: #94a3b8; font-weight: bold;">SISTEMA TC-ERP</div>
            </div>
          </div>

          <div class="grid">
            <div class="card">
              <span class="label">Transportista / Piloto</span>
              <span class="value">${pilot}</span>
            </div>
            <div class="card">
              <span class="label">Fecha de Recepción</span>
              <span class="value">${new Date(record.created_at).toLocaleString()}</span>
            </div>
            <div class="card">
              <span class="label">Operador Responsable</span>
              <span class="value">${operatorName}</span>
            </div>
            <div class="card">
              <span class="label">Estatus Final</span>
              <span class="value" style="color: #10b981;">RECIBIDO</span>
            </div>
          </div>

          <h2>Detalle de Manifiesto</h2>
          <table>
            <thead>
              <tr>
                <th style="width: 50px;">Item</th>
                <th>Código de Guía / Bulto</th>
                <th>Tipo de Unidad</th>
              </tr>
            </thead>
            <tbody>
              ${guideRows}
            </tbody>
          </table>

          <div class="signature">
            <div class="sig-line">Entregado por (Firma / Sello)</div>
            <div class="sig-line">Recibido por (Firma / Sello)</div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleTestConnection = async () => {
    setLoading(true);
    const result = await testSupabaseConnection();
    if (result.success) {
      alert("✅ Conexión exitosa con Supabase");
    } else {
      alert(`❌ Error de conexión: ${result.error}`);
    }
    setLoading(false);
  };

  const handleBulkImport = () => {
    if (bulkTargetIdx === null) return;
    const lines = bulkText.split('\n').flatMap(l => l.split(',')).flatMap(l => l.split('\t')).flatMap(l => l.split(' ')).map(s => s.trim().toUpperCase()).filter(s => s !== "");
    const targetItem = { ...guideItems[bulkTargetIdx] };
    const seriesPerUnit = targetItem.seriesPerUnit;
    
    // Distribuir series en unidades
    const newSeries = [...targetItem.series];
    let currentUnit = newSeries.length > 0 && newSeries[newSeries.length - 1].length < seriesPerUnit 
      ? newSeries.pop()! 
      : [];

    for (const sn of lines) {
      if (targetItem.scannedCount >= targetItem.cantidad && currentUnit.length === 0) break;
      
      // Evitar duplicados globales en este item
      const flatSeries = newSeries.flat().concat(currentUnit);
      if (flatSeries.includes(sn)) continue;

      currentUnit.push(sn);
      
      if (currentUnit.length === seriesPerUnit) {
        newSeries.push(currentUnit);
        targetItem.scannedCount = newSeries.length;
        currentUnit = [];
      }
    }
    
    if (currentUnit.length > 0) {
      newSeries.push(currentUnit);
      targetItem.scannedCount = newSeries.length;
    }
    
    const newItems = [...guideItems];
    newItems[bulkTargetIdx] = { ...targetItem, series: newSeries };
    setGuideItems(newItems);
    setShowBulkModal(false);
    setBulkText('');
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      const { success, error } = await updateReceptionStatus(id, newStatus);
      if (success) {
        alert(`Lote actualizado a: ${newStatus}`);
        fetchPending();
      } else {
        alert(`Error al actualizar: ${error}`);
      }
    } catch (err) {
      console.error("Error updating status:", err);
      alert("Error de red al actualizar el lote. Verifique su conexión.");
    }
  };

  const handleReturnToPending = async (receptionId: string) => {
    if (!confirm("¿Está seguro de regresar este lote a estado PENDIENTE?")) return;
    try {
      // Usamos el estatus original para que vuelva a aparecer en la bandeja de entrada
      const { success, error } = await updateReceptionStatus(receptionId, 'PENDIENTE_BACKOFFICE');
      if (success) {
        alert("Lote regresado a Pendiente con éxito.");
        await fetchPending();
        await fetchHistory();
      } else {
        alert(`Error: ${error}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error al procesar la solicitud.");
    }
  };

  const handleViewManifest = (rec: any) => {
    const cleanNotes = (rec.notes || '').split('--- LÍNEA DE TIEMPO')[0].split('Backoffice_')[0].split('Guías Procesadas:')[0];
    const guias = cleanNotes?.split('Guías: ')[1]?.split('\n')[0] || rec.guide_number;
    const piloto = rec.notes?.split('Piloto: ')[1]?.split('\n')[0] || '---';
    alert(`📜 MANIFIESTO DE RECEPCIÓN\n\nGuías Incluidas:\n${guias}\n\nPiloto: ${piloto}\nRecibido por: ${getReceiverName(rec)}`);
  };

  const handleOpenEditMeta = (rec: any) => {
    setEditMetaRec(rec);
    setEditMeta({
      agency: (rec.notes?.includes('Backoffice_Agency: ') ? rec.notes.split('Backoffice_Agency: ')[1]?.split('\n')[0]?.trim() : '') || rec.carrier || '',
      tech:   (rec.notes?.includes('Backoffice_Tech: ') ? rec.notes.split('Backoffice_Tech: ')[1]?.split('\n')[0]?.trim() : ''),
      brand:  (rec.notes?.includes('Backoffice_Brand: ') ? rec.notes.split('Backoffice_Brand: ')[1]?.split('\n')[0]?.trim() : ''),
      model:  (rec.notes?.includes('Backoffice_Model: ') ? rec.notes.split('Backoffice_Model: ')[1]?.split('\n')[0]?.trim() : ''),
    });
  };

  const handleUndoClassification = async (guia: string) => {
    if (!confirm(`¿Está seguro que desea reclasificar la guía ${guia}? Esto borrará la clasificación anterior y deberá hacerla de nuevo.`)) return;
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      
      let currentNotes = activeReception?.notes || '';
      const guiaPattern = new RegExp(`\\[Guía.*?(?:${guia.replace(/[-]/g, '\\-')}).*?\\][\\s\\S]*?(?=\\[Guía|---|$)`, 'gi');
      
      const guideBlocks = currentNotes.match(guiaPattern);
      const serialsToDelete: string[] = [];
      
      if (guideBlocks) {
        for (const block of guideBlocks) {
          const sMatches = block.match(/S-\\d+: (.*)/g);
          if (sMatches) {
            for (const m of sMatches) {
              const sn = m.split(': ')[1]?.trim();
              if (sn && sn !== '---') serialsToDelete.push(sn);
            }
          }
        }
      }

      if (serialsToDelete.length > 0) {
        await supabase
          .from('series')
          .delete()
          .eq('current_reception_id', activeReception?.id)
          .in('serial_number', serialsToDelete);
          
        await supabase
          .from('service_orders')
          .delete()
          .eq('reception_id', activeReception?.id)
          .in('main_serial', serialsToDelete);
      }
      
      await supabase
        .from('boxes')
        .delete()
        .eq('reception_id', activeReception?.id)
        .eq('box_code', guia);

      currentNotes = currentNotes.replace(guiaPattern, '').trim();

      const timelinePattern = new RegExp(`^\\[.*\\].*CLASIFICACIÓN.*?(?:${guia.replace(/[-]/g, '\\-')}).*?$`, 'gim');
      currentNotes = currentNotes.replace(timelinePattern, '').trim();

      await supabase.from('receptions').update({ notes: currentNotes }).eq('id', activeReception?.id);

      const newProcessed = processedGuides.filter(g => g !== guia);
      setProcessedGuides(newProcessed);
      
      await supabase.from('receptions').update({ processed_guides: newProcessed }).eq('id', activeReception?.id);
      
      const { data: updatedRec } = await supabase.from('receptions').select('*').eq('id', activeReception?.id).single();
      
      if (newProcessed.length === 0) {
         await supabase.from('receptions').update({ status: 'PENDIENTE_BACKOFFICE' }).eq('id', activeReception?.id);
         if (updatedRec) updatedRec.status = 'PENDIENTE_BACKOFFICE';
      }
      
      if (updatedRec) setActiveReception(updatedRec);
      
      await fetchPending();
      await fetchHistory();
      alert(`La guía ${guia} ha sido restaurada. Ahora puede volver a clasificarla.`);
      
    } catch (err: any) {
      console.error(err);
      alert('Error al intentar deshacer la clasificación.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEditMeta = async () => {
    if (!editMetaRec) return;
    setEditMetaSaving(true);
    const baseNotes = (editMetaRec.notes || '')
      .split('\n')
      .filter((line: string) => !line.startsWith('Backoffice_Agency:') && 
                      !line.startsWith('Backoffice_Tech:') && 
                      !line.startsWith('Backoffice_Brand:') && 
                      !line.startsWith('Backoffice_Model:'))
      .join('\n');
    const newNotes = baseNotes +
      `\nBackoffice_Agency: ${editMeta.agency}` +
      `\nBackoffice_Tech: ${editMeta.tech}` +
      `\nBackoffice_Brand: ${editMeta.brand}` +
      `\nBackoffice_Model: ${editMeta.model}`;
    await updateReception(editMetaRec.id, { notes: newNotes });
    // Refresh history so table updates immediately
    await fetchHistory();
    setEditMetaRec(null);
    setEditMetaSaving(false);
  };

  const handleOpenHistoryModal = async (rec: any) => {
    setSelectedHistoryReception(rec);
    setHistoryModalSeries([]);
    try {
      // Use pre-loaded series if available, otherwise fetch
      const preLoaded = historyReceptions.find((r: any) => r.id === rec.id);
      if (preLoaded?.series?.length > 0) {
        setHistoryModalSeries(preLoaded.series);
      } else {
        const data = await getSeriesByReceptionId(rec.id);
        setHistoryModalSeries(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const addItem = () => {
    console.log("addItem triggered. Current newItem:", newItem);
    if (!newItem.tipo || !newItem.marca || !newItem.modelo || newItem.cantidad <= 0) {
      const msg = `Faltan campos por completar: ${!newItem.tipo ? 'Tecnología, ' : ''}${!newItem.marca ? 'Marca, ' : ''}${!newItem.modelo ? 'Modelo, ' : ''}${newItem.cantidad <= 0 ? 'Cantidad' : ''}`;
      console.warn("addItem validation failed:", msg);
      alert(msg);
      return;
    }
    // seriesCount viene del Modelo (configurado en Configuración del Sistema)
    const selectedModel = MASTER_MODELOS.find(m => m.id === newItem.modelo);
    const tech = MASTER_TECNOLOGIAS.find(t => t.id === newItem.tipo);
    const seriesPerUnit = selectedModel?.seriesCount || tech?.seriesCount || 1;
    
    console.log("Adding item to manifest:", { ...newItem, seriesPerUnit });
    
    const item: GuideItem = { 
      ...newItem, 
      id: Date.now(), 
      series: [], 
      scannedCount: 0,
      seriesPerUnit: seriesPerUnit
    };
    setGuideItems([...guideItems, item]);
    setNewItem({ tipo: '', marca: '', modelo: '', cantidad: 0 });
  };

  const handleStartScanning = async () => {
    if (guideItems.length > 0) {
      if (!selectedAgencyId) {
        alert("Por favor seleccione la Agencia CAC correspondiente.");
        return;
      }
      // Save processing metadata to notes so history table can display it
      if (activeReception?.id && guideItems.length > 0) {
        const firstItem = guideItems[0];
        const agencyObj = CAC_AGENCIES.find(a => a.id === selectedAgencyId);
        const techNameVal = MASTER_TECNOLOGIAS.find(t => t.id === firstItem.tipo)?.nombre || '';
        const brandNameVal = MASTER_MARCAS.find(b => b.id === firstItem.marca)?.nombre || '';
        const modelNameVal = MASTER_MODELOS.find(m => m.id === firstItem.modelo)?.nombre || '';
        const existingNotes = (activeReception.notes || '').split('\n').filter((line: string) => !line.startsWith('Backoffice_')).join('\n');
        const backofficeInfo = `\nBackoffice_Agency: ${agencyObj?.name || selectedAgencyId}\nBackoffice_Tech: ${techNameVal}\nBackoffice_Brand: ${brandNameVal}\nBackoffice_Model: ${modelNameVal}${sapTransferNumber ? `\nBackoffice_SAP: ${sapTransferNumber}` : ''}`;
        await updateReception(activeReception.id, { 
          notes: existingNotes + backofficeInfo,
          sap_document: sapTransferNumber || activeReception.sap_document
        });
      }
      if (category === 'Accesorio') {
        setReceptionStep('return_confirmation');
      } else {
        setReceptionStep('scanning');
        setCurrentScanningIndex(0);
      }
    }
  };
  const completeCurrentGuides = async () => {
    if (isSubmitting || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    
    // Prevent double processing if already in processedGuides
    if (scannedGuides.length > 0 && scannedGuides.every(g => processedGuides.includes(g))) {
      setReceptionStep('completed');
      isSubmittingRef.current = false;
      return;
    }

    setIsSubmitting(true);
    try {
    const newProcessed = Array.from(new Set([
      ...(activeReception?.processed_guides || []), 
      ...scannedGuides
    ].map(g => g.trim())));
    if (activeReception?.id) {
      // Se guarda el progreso en las notas para evitar errores de columna inexistente
      const progressNotes = `\nGuías Procesadas: ${newProcessed.join(', ')}`;
      await updateReception(activeReception.id, { 
        notes: (activeReception.notes || '') + progressNotes
      });
      setProcessedGuides(newProcessed);

      const isEquipment = category === 'Equipo';
      const hasItems = guideItems.length > 0;

      if (hasItems || !isEquipment) {
        const firstItem = hasItems ? guideItems[0] : null;
        const agencyObj = CAC_AGENCIES.find(a => a.id === selectedAgencyId);
        const techNameVal = firstItem ? (MASTER_TECNOLOGIAS.find(t => t.id === firstItem.tipo)?.nombre || '') : '';
        const brandNameVal = firstItem ? (MASTER_MARCAS.find(b => b.id === firstItem.marca)?.nombre || '') : '';
        const modelNameVal = firstItem ? (MASTER_MODELOS.find(m => m.id === firstItem.modelo)?.nombre || '') : '';
        
        const currentGuide = scannedGuides[0]?.trim().toUpperCase();
        const mainGuide = activeReception.guide_number?.trim().toUpperCase();

        // Extraer las guías reales de las notas (fuente de verdad)
        // El campo guide_number es un ID técnico, no el número de guía real
        const rawGuideNumber = activeReception.guide_number || '';
        const fallbackGuides = rawGuideNumber.split(/[\\/,]/).map(g => g.trim().toUpperCase()).filter(Boolean);
        const cleanNotesForGuias = (activeReception.notes || '')
          .split('--- LÍNEA DE TIEMPO')[0]
          .split('Backoffice_')[0]
          .split('Guías Procesadas:')[0];
        const guiasListString = cleanNotesForGuias?.split('Guías: ')[1]?.split('\n')[0];
        const receptionGuias = guiasListString 
          ? guiasListString.split(/[\\/,]/).map((g: string) => g.trim().toUpperCase()).filter(Boolean) 
          : fallbackGuides;

        // DETERMINACIÓN FALL-SAFE DE CATEGORÍA BASADA EN EL PASO ACTUAL
        let finalCategory = category || 'Equipo';
        if ((receptionStep as string) === 'accessories_photos') finalCategory = 'Accesorio';

        const agencyLabel = agencia || agencyObj?.name || selectedAgencyId || '';

        // Dynamic metadata defaults for Accessories and Phones
        const defaultTech = finalCategory.toLowerCase() === 'accesorio' ? 'ACCESORIOS' : (finalCategory.toLowerCase() === 'teléfono' ? 'MÓVILES' : '');
        const defaultBrand = finalCategory.toLowerCase() === 'accesorio' ? 'ACCESORIOS BODEGA' : (finalCategory.toLowerCase() === 'teléfono' ? 'MÓVILES BODEGA' : '');
        const defaultModel = finalCategory.toLowerCase() === 'accesorio' ? 'LOTE ACCESORIOS' : (finalCategory.toLowerCase() === 'teléfono' ? 'LOTE TELÉFONOS' : '');

        const techVal = techNameVal || defaultTech;
        const brandVal = brandNameVal || defaultBrand;
        const modelVal = modelNameVal || defaultModel;

        let targetReceptionId = activeReception.id;

        // 2. SIEMPRE ACTUALIZAR LA RECEPCIÓN MAESTRA (ej. REC-002) PARA REFLEJAR EL PROGRESO
        const timestamp = new Date().toLocaleString();
        const movId = generateMovId();
        const actionCode = finalCategory === 'Accesorio' ? 'BOD-ACC' : (finalCategory === 'Teléfono' ? 'BOD-MOV' : 'BOD-EQP');
        
        let cleanNotes = activeReception.notes || '';
        let baseNotes = cleanNotes;
        let detailsNotes = '';
        let timelineNotes = '';

        if (cleanNotes.includes('--- DETALLES BACKOFFICE ---') && cleanNotes.includes('--- LÍNEA DE TIEMPO (MATRIZ) ---')) {
          baseNotes = cleanNotes.split('--- DETALLES BACKOFFICE ---')[0].trim();
          detailsNotes = cleanNotes.split('--- DETALLES BACKOFFICE ---')[1].split('--- LÍNEA DE TIEMPO (MATRIZ) ---')[0].trim();
          timelineNotes = cleanNotes.split('--- LÍNEA DE TIEMPO (MATRIZ) ---').pop().replace(/Status:.*$/m, '').replace(/Photos:.*$/m, '').trim();
        } else if (cleanNotes.includes('--- LÍNEA DE TIEMPO (MATRIZ) ---')) {
          baseNotes = cleanNotes.split('--- LÍNEA DE TIEMPO (MATRIZ) ---')[0].trim();
          timelineNotes = cleanNotes.split('--- LÍNEA DE TIEMPO (MATRIZ) ---').pop().replace(/Status:.*$/m, '').replace(/Photos:.*$/m, '').trim();
        }

        if (baseNotes.includes('Guías Procesadas:')) {
          baseNotes = baseNotes.replace(/Guías Procesadas:.*$/m, `Guías Procesadas: ${newProcessed.join(', ')}`);
        } else {
          baseNotes += `\nGuías Procesadas: ${newProcessed.join(', ')}`;
        }

        const timelineEvent = `\n[${timestamp}] ${movId} | ${actionCode} | CLASIFICACIÓN (Guía ${scannedGuides.join(',')}): Movido a BODEGA: ${finalCategory.toUpperCase()} - Por: ${currentUserFullName}`;
        
        if (!timelineNotes) {
            timelineNotes = `[${new Date(activeReception.created_at).toLocaleString()}] MOV-START | REC-01 | RECEPCIÓN: Ingreso inicial al sistema en CAC.`;
        }
        timelineNotes += timelineEvent;

        detailsNotes += `\n\n[Guía ${scannedGuides.join(',')}]` +
          `\nBackoffice_Agency: ${agencyLabel}` +
          `\nBackoffice_Category: ${finalCategory.toLowerCase()}` +
          (techVal ? `\nBackoffice_Tech: ${techVal}` : '') +
          (brandVal ? `\nBackoffice_Brand: ${brandVal}` : '') +
          (modelVal ? `\nBackoffice_Model: ${modelVal}` : '') +
          (sapTransferNumber ? `\nBackoffice_SAP: ${sapTransferNumber}` : '') +
          `\nMotivo Devolución: ${returnReason || 'N/A'}` +
          `\nGuía de Envío: ${returnTracking || 'N/A'} (Logística: ${returnCourier || 'N/A'})`;

        const allProcessed = receptionGuias.length === 0 || receptionGuias.every((g: string) => newProcessed.includes(g));

        const finalNotes = baseNotes +
          `\n\n--- DETALLES BACKOFFICE ---\n` + detailsNotes.trim() +
          `\n\n--- LÍNEA DE TIEMPO (MATRIZ) ---\n` + timelineNotes.trim() +
          `\n\nStatus: ${allProcessed ? 'RECIBIDO_BACKOFFICE' : 'EN_PROCESO_BACKOFFICE'}` +
          `\nPhotos: ${accessoryPhotos.join(', ')}`;

        const cleanUpdate = { 
          status: allProcessed ? 'CLASIFICADA' : 'PENDIENTE DE CLASIFICAR',
          processed_guides: newProcessed,
          notes: finalNotes,
          // Mantenemos la evidencia en la maestra también
          evidence_url: activeReception.evidence_url || accessoryPhotos[0] || '',
          sap_document: sapTransferNumber || activeReception.sap_document,
        };

        const resUpdate = await updateReception(activeReception.id, cleanUpdate);
        
        if (resUpdate.error) {
          alert("❌ ERROR DE ACTUALIZACIÓN MAESTRA: " + resUpdate.error);
        }

        // --- NEW LOGIC: Update reception_guides ---
        const supabaseClient = getSupabaseBrowserClient();
        let updatedGuideId: string | undefined = undefined;

        if (!supabaseClient) {
          console.error("Warning: No Supabase client available, skipping reception_guides update.");
        } else {
          const { data: userData } = await supabaseClient.auth.getUser();
          const userEmail = userData?.user?.email || currentUserFullName;

          // Normalizar categoría eliminando tildes para la base de datos (telefono, devolucion, etc.)
          const dbCategory = finalCategory.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

          const { data: updatedGuides, error: guidesUpdateError } = await supabaseClient
            .from('reception_guides')
            .update({
              category: dbCategory,
              status: 'CLASIFICADO',
              agency: agencyLabel,
              classified_by: userEmail,
              classified_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              // Guardar motivo de devolución si aplica (Fase 3)
              ...(returnReason ? { motivo: returnReason } : {}),
            })
            .eq('reception_id', activeReception.id)
            .in('guide_number', scannedGuides)
            .select('id');

          // 3. Tolerancia a fallos en el update
          if (guidesUpdateError) {
            console.error("Warning: Falló la actualización en reception_guides:", guidesUpdateError.message);
          }

          updatedGuideId = updatedGuides && updatedGuides.length > 0 ? updatedGuides[0].id : undefined;
        }
        // ----------------------------------------

        // 3. CREAR LOS EQUIPOS (ORDENES DE SERVICIO) Y ATARLOS A LA RECEPCIÓN QUE CORRESPONDA (HIJA SI EXISTE, O MAESTRA)
        if (isEquipment && hasItems) {
          const unitsForOS = guideItems.flatMap(item => 
            item.series.map(unitSerials => ({
              main_serial: unitSerials[0], 
              model_id: item.modelo,
              brand_id: item.marca,
              all_series: unitSerials
            }))
          ).filter(u => u.main_serial);

          if (unitsForOS.length > 0) {
            await createServiceOrders(targetReceptionId, unitsForOS, updatedGuideId);
          }
        }
      }
    }
    await fetchHistory();
    
    if (category === 'Accesorio') {
      setActiveTab('sub_accesorios');
    } else if (category === 'Teléfono') {
      setActiveTab('sub_telefonos');
    }
    
    setReceptionStep('completed');
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  const handleConfirmReturn = async () => {
    if (!returnReason) {
      alert("Por favor ingrese el motivo de la devolución.");
      return;
    }
    await completeCurrentGuides();
  };

  const handleScanSN = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSN) return;

    const items = [...guideItems];
    const target = items[currentScanningIndex];

    if (target.scannedCount < target.cantidad) {
      if (target.series.includes(currentSN as any)) {
        alert("Esta serie ya fue escaneada.");
        return;
      }

      // Validar que la serie no esté en un proceso activo en el sistema
      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        const { data: existingSeries } = await supabase
          .from('series')
          .select('id, serial_number, current_reception_id, receptions:current_reception_id(guide_number, created_at)')
          .eq('serial_number', currentSN.trim().toUpperCase())
          .maybeSingle();

        if (existingSeries) {
          const { data: latestOS } = await supabase
            .from('service_orders')
            .select('os_label, status, reentry_count')
            .eq('series_id', existingSeries.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const exitedStatuses = ['DESPACHADO', 'ENTREGADO', 'SALIDA', 'DEVUELTO'];
          const currentStatus = (latestOS?.status || '').toUpperCase();
          const canReenter = !latestOS || exitedStatuses.some(s => currentStatus.includes(s));

          if (!canReenter) {
            const reception = existingSeries.receptions as any;
            const recGuide = reception?.guide_number || 'N/A';
            const recDate = reception?.created_at ? new Date(reception.created_at).toLocaleDateString() : '';
            const osLabel = latestOS?.os_label || 'N/A';
            alert(
              `🚫 SERIE EN PROCESO ACTIVO\n\n` +
              `La serie "${currentSN}" ya está registrada en el sistema:\n` +
              `📋 Recepción: ${recGuide}${recDate ? ` (${recDate})` : ''}\n` +
              `📦 OS: ${osLabel} — Estado: ${currentStatus || 'ACTIVO'}\n\n` +
              `Solo puede reingresar si fue despachada o salió del sistema.`
            );
            return;
          }
        }
      }

      target.series.push(currentSN as any);
      target.scannedCount++;
      setGuideItems(items);
      setCurrentSN('');
    }
  };

  return (
    <ModulePage 
      title="Recepción de Carga (CAC)" 
      category="Logística"
      actions={
        <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          <button className="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-[#181c3a] transition-all">MÓDULO PX</button>
          <button className="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white text-[#181c3a] shadow-sm">MÓDULO CAC</button>
        </div>
      }
    >
      {/* TABS NAVEGACIÓN */}
      <div className="flex items-center gap-10 mb-8 border-b border-slate-100">
        <button 
          onClick={() => setActiveTab('op')}
          className={`pb-4 px-2 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative ${activeTab === 'op' ? 'text-[#181c3a]' : 'text-slate-300 hover:text-slate-400'}`}
        >
          NUEVA RECEPCIÓN
          {activeTab === 'op' && <div className="absolute bottom-0 left-0 w-full h-1.5 bg-[#2ec4f1] rounded-t-full" />}
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`pb-4 px-2 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative ${activeTab === 'history' ? 'text-[#181c3a]' : 'text-slate-300 hover:text-slate-400'}`}
        >
          HISTORIAL / REGISTROS
          {activeTab === 'history' && <div className="absolute bottom-0 left-0 w-full h-1.5 bg-[#2ec4f1] rounded-t-full" />}
        </button>
        <button 
          onClick={() => setActiveTab('sub_accesorios')}
          className={`pb-4 px-2 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative ${activeTab === 'sub_accesorios' ? 'text-[#181c3a]' : 'text-slate-300 hover:text-slate-400'}`}
        >
          BODEGA ACCESORIOS
          {activeTab === 'sub_accesorios' && <div className="absolute bottom-0 left-0 w-full h-1.5 bg-emerald-500 rounded-t-full" />}
        </button>
        <button 
          onClick={() => setActiveTab('sub_telefonos')}
          className={`pb-4 px-2 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative ${activeTab === 'sub_telefonos' ? 'text-[#181c3a]' : 'text-slate-300 hover:text-slate-400'}`}
        >
          BODEGA TELÉFONOS
          {activeTab === 'sub_telefonos' && <div className="absolute bottom-0 left-0 w-full h-1.5 bg-amber-500 rounded-t-full" />}
        </button>
      </div>

      {activeTab === 'op' && (
        <div className="max-w-none mx-auto animate-rise-in">
          
          {/* STEP 0: INBOX */}
          {receptionStep === 'category_selection' && (
            <div className="space-y-8 animate-rise-in">
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-3xl font-black text-[#181c3a] uppercase tracking-tight">Bandeja de Entrada (CAC)</h2>
                  <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] mt-2">Recepciones pendientes de validación administrativa</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleTestConnection} className="font-black text-[10px] uppercase border-amber-200 text-amber-600 hover:bg-amber-50">
                    <Radio size={14} className="mr-2" /> Test Conexión
                  </Button>
                  <Button variant="outline" onClick={() => { fetchPending(); fetchHistory(); }} className="font-black text-[10px] uppercase">
                    <History size={14} className="mr-2" /> Refrescar
                  </Button>
                </div>
              </div>

              <div className="relative max-w-xl">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Escanea o escribe el número de guía..."
                  className="w-full bg-white border-2 border-slate-100 rounded-2xl py-4 pl-12 pr-4 text-sm font-black text-[#181c3a] outline-none focus:border-[#2ec4f1] focus:ring-4 focus:ring-[#2ec4f1]/10 transition-all placeholder:font-bold placeholder:text-slate-300"
                  value={inboxSearch}
                  onChange={(e) => setInboxSearch(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-1 gap-4">
                {pendingReceptions.filter(rec => rec.status !== 'ARCHIVADO' && rec.status !== 'RECIBIDO' && (!inboxSearch || rec.guide_number.toLowerCase().includes(inboxSearch.toLowerCase()))).map((rec) => (
                  <Card key={rec.id} className={`overflow-hidden border-2 transition-all group p-0 ${rec.status === 'PENDIENTE_BACKOFFICE' ? 'border-rose-400 hover:border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.15)] bg-rose-50/30' : 'border-slate-100 hover:border-[#2ec4f1]/30'}`}>
                    <div className="flex flex-col md:flex-row">
                      <div className={`md:w-56 p-4 text-white flex flex-col justify-between ${rec.status === 'PENDIENTE_BACKOFFICE' ? 'bg-gradient-to-br from-rose-900 to-rose-950' : 'bg-[#181c3a]'}`}>
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <Badge className={`border-none font-black text-[9px] uppercase ${rec.status === 'PENDIENTE_BACKOFFICE' ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'bg-[#2ec4f1] text-[#181c3a]'}`}>
                              {rec.status === 'PENDIENTE_BACKOFFICE' ? 'REVERTIDO DE DEVOLUCIÓN' : rec.status}
                            </Badge>
                            <Box size={20} className="text-white/20" />
                          </div>
                          <h4 className="text-lg font-black font-mono">{rec.guide_number}</h4>
                          <p className="text-[9px] text-white/40 font-bold uppercase tracking-widest mt-0.5">LOTE ID: {rec.id.substring(0,8)}</p>
                        </div>
                        <div className="mt-4 flex items-center gap-2">
                          <Clock className={`w-3 h-3 ${rec.status === 'PENDIENTE_BACKOFFICE' ? 'text-rose-400' : 'text-[#2ec4f1]'}`} />
                          <span className="text-[10px] font-bold text-white/60">{new Date(rec.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="flex-1 p-4 flex flex-col justify-between">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase mb-0.5">Transportista</p>
                            <p className="text-sm font-black text-[#181c3a] leading-tight">{rec.carrier || '---'}</p>
                            <p className="text-[8px] font-bold text-[#2ec4f1] uppercase mt-0.5">Recibido por: {rec.received_by || 'SISTEMA'}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase mb-0.5">Unidades</p>
                            <p className="text-sm font-black text-[#181c3a] leading-tight">{rec.received_units} BULTOS</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase mb-0.5">Ubicación Actual</p>
                            <p className="text-sm font-black text-emerald-500 uppercase leading-tight">MUELLE DE CARGA</p>
                          </div>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-50 flex flex-col sm:flex-row justify-between items-center gap-3">
                          <div className="flex gap-4">
                            <button onClick={() => handlePrintConduce(rec)} className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 hover:text-[#181c3a] transition-all uppercase tracking-widest">
                              <Printer size={14} /> Imprimir Conduce
                            </button>
                            <button className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 hover:text-rose-500 transition-all uppercase tracking-widest">
                              <Trash2 size={14} /> Rechazar
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="primary" onClick={() => { setActiveReception(rec); setProcessedGuides(rec.processed_guides || []); setReceptionStep('classification'); }} className="rounded-xl bg-[#181c3a] text-white hover:bg-[#2ec4f1] transition-all font-black text-[9px] uppercase tracking-widest px-6 py-2">Procesar e Ingresar</Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
                {pendingReceptions.filter(rec => rec.status !== 'ARCHIVADO' && (!inboxSearch || rec.guide_number.toLowerCase().includes(inboxSearch.toLowerCase()))).length === 0 && !loading && (
                  <div className="py-24 text-center bg-white rounded-3xl border-2 border-dashed border-slate-100">
                    <Box className="w-16 h-16 mx-auto mb-4 text-slate-200" />
                    <p className="text-sm font-black text-slate-300 uppercase tracking-widest">No hay recepciones pendientes en la bandeja</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP: CLASIFICACIÓN */}
          {receptionStep === 'classification' && activeReception && (
            <div className="space-y-8 animate-rise-in">
              <div className="flex justify-between items-center">
                <button onClick={() => { setReceptionStep('category_selection'); setClassificationSearch(''); }} className="flex items-center gap-2 text-[10px] font-black text-slate-400 hover:text-[#181c3a] uppercase tracking-widest transition-all">
                  <ChevronLeft size={16} /> Volver a Bandeja
                </button>
                <div className="text-right">
                  <Badge className="bg-[#2ec4f1] text-[#181c3a] border-none font-black text-[9px] uppercase tracking-widest">{activeReception.status}</Badge>
                  <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">Lote: {activeReception.guide_number?.split(' ')[0]}</p>
                </div>
              </div>
              <div className="bg-white p-12 rounded-[2.5rem] shadow-2xl border border-slate-100 text-center">
                <h2 className="text-3xl font-black text-[#181c3a] uppercase mb-2 leading-none">Clasificación de Carga</h2>
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] mb-12">Seleccione una caja para iniciar su procesamiento</p>
                <div className="grid grid-cols-1 gap-4 max-w-7xl mx-auto">
                  {(() => {
                    const rawNotes = activeReception.notes || '';
                    const cleanNotes = rawNotes
                      .split('---')[0]
                      .split('Backoffice_')[0]
                      .split('Guías Procesadas:')[0];
                      
                    const rawGuideNumber = activeReception.guide_number || '';
                    const fallbackGuides = rawGuideNumber.split(/[\\/,]/).map(g => g.trim()).filter(Boolean);
                    const guiasListString = cleanNotes?.split('Guías: ')[1]?.split('\n')[0];
                    const guiasList = guiasListString 
                      ? guiasListString.split(/[\\/,]/).map((g: string) => g.trim()).filter(Boolean) 
                      : (fallbackGuides.length > 0 ? fallbackGuides : [rawGuideNumber]);
                      
                    const pendingCount = guiasList.filter((g: string) => !processedGuides.includes(g)).length;

                    return (
                      <>
                        <div className="flex justify-between items-center mb-2 px-2">
                          <p className="text-sm font-black text-slate-400 uppercase tracking-widest">
                            Estado del Lote
                          </p>
                          <Badge className="bg-slate-50 text-[#181c3a] font-black text-xs px-4 py-2 border border-slate-200">
                            {pendingCount} DE {guiasList.length} PENDIENTES
                          </Badge>
                        </div>
                        {/* BUSCADOR DE GUÍAS */}
                        <div className="relative mb-6">
                          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                          </div>
                          <input
                            type="text"
                            placeholder="Buscar número de guía..."
                            value={classificationSearch}
                            onChange={(e) => setClassificationSearch(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-[#2ec4f1] transition-all placeholder:text-slate-300"
                          />
                          {classificationSearch && (
                            <button
                              onClick={() => setClassificationSearch('')}
                              className="absolute inset-y-0 right-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                        {guiasList.map((guia: string, idx: number) => {
                          // Filtrar por búsqueda
                          if (classificationSearch && !guia.toLowerCase().includes(classificationSearch.toLowerCase())) return null;
                          const isProcessedLocally = processedGuides.includes(guia);
                          // Detección Global: Buscar si la guía ya existe en cualquier recepción terminada
                          const isProcessedGlobally = allReceptions.some(r => 
                            r.status === 'RECIBIDO_BACKOFFICE' && 
                            (r.guide_number === guia || r.notes?.toLowerCase().includes(guia.toLowerCase()))
                          );
                          const isProcessed = isProcessedLocally || isProcessedGlobally;

                          if (isProcessed) return null;

                          return (
                            <div key={idx} className={`bg-slate-50 p-8 rounded-3xl border-2 flex flex-col md:flex-row items-center justify-between transition-all shadow-sm border-slate-100 hover:border-[#2ec4f1]/30 hover:shadow-xl group`}>
                              <div className="flex items-center gap-6 mb-6 md:mb-0">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm transition-all ${isProcessed ? (isProcessedGlobally ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600') : 'bg-white text-[#181c3a] group-hover:bg-[#181c3a] group-hover:text-white'}`}>
                                  {isProcessed ? <CheckCircle2 size={24} /> : <Box size={24} />}
                                </div>
                                <div className="text-left">
                                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                                    No. de Guía / Caja 
                                    {isProcessedLocally && <span className="text-emerald-500 ml-2 font-black">— Procesada Ahora</span>}
                                    {!isProcessedLocally && isProcessedGlobally && <span className="text-blue-500 ml-2 font-black">— YA PROCESADA EN HISTORIAL</span>}
                                  </p>
                                  <h4 className={`text-xl font-black font-mono ${isProcessed ? 'text-slate-400' : 'text-[#181c3a]'}`}>{guia}</h4>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-3 justify-center md:justify-end">
                                {isProcessed ? (
                                  <div className="flex flex-col items-center gap-2 md:flex-row">
                                    <Badge className="bg-emerald-50 text-emerald-600 font-black text-[10px] px-6 py-4 rounded-xl border-none uppercase tracking-widest">
                                      Caja Recibida Completamente
                                    </Badge>
                                    <Button 
                                      onClick={() => handleUndoClassification(guia)} 
                                      disabled={loading}
                                      className="bg-slate-200 hover:bg-slate-300 text-slate-600 border-none rounded-xl px-4 py-4 font-black text-[10px] uppercase tracking-[0.1em] transition-all flex items-center justify-center"
                                    >
                                      <RefreshCw size={14} className="mr-2" /> Reclasificar
                                    </Button>
                                  </div>
                                ) : (
                                  <>
                                    <Button onClick={() => { setCategory('Equipo'); setScannedGuides([guia]); setAgencia(activeReception.carrier); setReceptionStep('config'); }} className="bg-[#181c3a] hover:bg-[#2ec4f1] text-white border-none rounded-2xl px-8 py-6 font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-lg group">
                                      <Monitor size={18} className="mr-3 group-hover:scale-110 transition-transform" /> Equipos
                                    </Button>
                                    <Button 
                                      onClick={() => { 
                                        setCategory('Accesorio'); 
                                        setScannedGuides([guia]); 
                                        setAgencia(activeReception.carrier); 
                                        setReceptionStep('accessories_photos' as any); 
                                      }} 
                                      className="bg-emerald-500 hover:bg-emerald-600 text-white border-none rounded-2xl px-8 py-6 font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-lg flex items-center justify-center group"
                                    >
                                      <Package size={18} className="mr-3 group-hover:scale-110 transition-transform" /> Accesorios
                                    </Button>
                                    <Button onClick={() => { setCategory('Teléfono'); setScannedGuides([guia]); setAgencia(activeReception.carrier); setReceptionStep('sub_bodega_transfer'); }} className="bg-amber-500 hover:bg-amber-600 text-white border-none rounded-2xl px-8 py-6 font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-lg group">
                                      <Radio size={18} className="mr-3 group-hover:scale-110 transition-transform" /> Teléfonos
                                    </Button>
                                    <Button onClick={() => { setCategory('Devolución' as any); setScannedGuides([guia]); setAgencia(activeReception.carrier); setReceptionStep('return_confirmation' as any); }} className="bg-rose-500 hover:bg-rose-600 text-white border-none rounded-2xl px-8 py-6 font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-lg flex items-center justify-center group">
                                      <RefreshCw size={18} className="mr-3 group-hover:scale-110 transition-transform" /> Devoluciones
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* STEP: CONFIGURATION */}
          {receptionStep === 'config' && activeReception && (
            <div className="space-y-6 animate-rise-in max-w-none mx-auto pb-20">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-4">
                  <button onClick={() => setReceptionStep('classification')} className="flex items-center gap-2 text-[10px] font-black text-slate-400 hover:text-[#181c3a] uppercase tracking-widest transition-all">
                    <ChevronLeft size={16} /> Volver al Triaje
                  </button>
                  <div className="h-6 w-[2px] bg-slate-100 mx-2"></div>
                  <h2 className="text-2xl font-black text-[#181c3a] uppercase tracking-tighter">Procesando Guía: <span className="text-[#2ec4f1] ml-2">{scannedGuides.map(g => g.split(' ')[0]).join(' / ') || activeReception.guide_number?.split(' ')[0]}</span></h2>
                </div>
                <div className="flex gap-2">
                   <Badge className="bg-[#181c3a] text-white px-6 py-2 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] border-none shadow-lg">Lote ID: {activeReception.id.substring(0,8)}</Badge>
                </div>
              </div>

              {/* PANEL DE INFORMACIÓN DE AGENCIA (HEADER) - REDISEÑADO PARA METADATOS DINÁMICOS */}
              <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-2xl grid grid-cols-1 md:grid-cols-3 gap-10 mb-8 relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#2ec4f1] to-[#181c3a]"></div>
                
                <button 
                  onClick={() => setShowAgencyModal(true)}
                  className="flex items-start gap-6 border-r border-slate-50 pr-6 text-left hover:bg-slate-50/50 transition-all rounded-[2rem] p-4 -m-4 group/btn"
                >
                  <div className="bg-slate-50 p-5 rounded-2xl text-[#181c3a] shadow-inner group-hover/btn:bg-[#181c3a] group-hover/btn:text-white transition-all"><Truck size={28} /></div>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Tienda / Agencia Destino</p>
                    <h3 className="text-xl font-black text-[#181c3a] uppercase truncate leading-tight group-hover/btn:text-[#2ec4f1] transition-colors">{agencyDetails?.name || 'SELECCIONAR AGENCIA'}</h3>
                    <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase flex items-center gap-2">
                      <MapPin size={12} className="text-[#2ec4f1]" /> {agencyDetails?.direccion || 'SIN DIRECCIÓN REGISTRADA'}
                    </p>
                  </div>
                </button>

                <div className="flex items-start gap-6 border-r border-slate-50 pr-6">
                  <div className="bg-blue-50 p-5 rounded-2xl text-[#2ec4f1] shadow-inner"><UserCheck size={28} /></div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Encargado de Tienda</p>
                    <h3 className="text-xl font-black text-[#181c3a] uppercase leading-tight">{agencyDetails?.manager || 'PENDIENTE'}</h3>
                    <p className="text-[10px] font-bold text-slate-400 mt-2 flex items-center gap-2">
                      <Phone size={12} className="text-[#2ec4f1]" /> {(agencyDetails as any)?.telefono || 'SIN TELÉFONO'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-6">
                  <div className="bg-emerald-50 p-5 rounded-2xl text-emerald-500 shadow-inner"><Calendar size={28} /></div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Fecha de Procesamiento</p>
                    <h3 className="text-xl font-black text-[#181c3a] uppercase leading-tight">{new Date().toLocaleDateString()}</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-2">Usuario: {activeReception.received_by || 'SISTEMA'}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                {/* SECCIÓN 1: CONFIGURACIÓN DE EQUIPOS */}
                <Card className="xl:col-span-4 p-10 border-none shadow-2xl rounded-[2.5rem] bg-white sticky top-8">
                  <div className="flex items-center gap-3 mb-8 border-b border-slate-100 pb-6">
                    <div className="w-8 h-8 bg-[#181c3a] text-white rounded-xl flex items-center justify-center font-black text-xs">1</div>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Definición de Manifiesto</h3>
                  </div>
                  
                  <div className={`space-y-6 transition-all ${!agencyDetails ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-400 mb-3 block ml-1">No. Traslado SAP (Opcional)</label>
                      <input 
                        type="text"
                        className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs text-[#181c3a] outline-none focus:border-[#2ec4f1] transition-all disabled:opacity-50" 
                        value={sapTransferNumber}
                        onChange={(e) => setSapTransferNumber(e.target.value)}
                        placeholder="Ej. TR-123456"
                        disabled={!agencyDetails}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-400 mb-3 block ml-1">Tecnología</label>
                      <select 
                        className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs text-[#181c3a] outline-none focus:border-[#2ec4f1] transition-all disabled:opacity-50" 
                        value={newItem.tipo} 
                        onChange={(e) => setNewItem({ ...newItem, tipo: e.target.value, modelo: '' })}
                        disabled={!agencyDetails}
                      >
                        <option value="">SELECCIONE TECNOLOGÍA...</option>
                        {MASTER_TECNOLOGIAS.map(t => (
                          <option key={t.id} value={t.id}>{t.nombre}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-400 mb-3 block ml-1">Marca</label>
                      <select 
                        className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs text-[#181c3a] outline-none focus:border-[#2ec4f1] transition-all disabled:opacity-50" 
                        value={newItem.marca} 
                        onChange={(e) => setNewItem({ ...newItem, marca: e.target.value, modelo: '' })}
                        disabled={!agencyDetails}
                      >
                        <option value="">SELECCIONE MARCA...</option>
                        {availableBrandsConfig.map(m => (
                          <option key={m.id} value={m.id}>{m.nombre}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="col-span-2">
                        <label className="text-[9px] font-black uppercase text-slate-400 mb-3 block ml-1">Modelo</label>
                        <select 
                          className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs text-[#181c3a] outline-none focus:border-[#2ec4f1] transition-all disabled:opacity-50" 
                          value={newItem.modelo} 
                          onChange={(e) => setNewItem({ ...newItem, modelo: e.target.value })}
                          disabled={!agencyDetails || !newItem.marca || !newItem.tipo}
                        >
                          <option value="">{newItem.marca ? 'SELECCIONE...' : 'ELIJA MARCA...'}</option>
                          {availableModels.map(m => (
                            <option key={m.id} value={m.id}>{m.nombre}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-1">
                        <label className="text-[9px] font-black uppercase text-slate-400 mb-3 block ml-1">Cant.</label>
                        <input 
                          type="number" 
                          className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs text-[#181c3a] outline-none focus:border-[#2ec4f1] transition-all disabled:opacity-50" 
                          value={newItem.cantidad || ''} 
                          onChange={(e) => setNewItem({ ...newItem, cantidad: parseInt(e.target.value) || 0 })} 
                          placeholder="0" 
                          disabled={!agencyDetails}
                        />
                      </div>
                    </div>

                    <Button 
                      onClick={addItem} 
                      disabled={!agencyDetails}
                      className={`w-full h-16 rounded-2xl flex items-center justify-center transition-all shadow-xl font-black uppercase tracking-widest text-[10px] gap-2 ${!agencyDetails ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' : 'bg-[#181c3a] hover:bg-[#2ec4f1] text-white'}`}
                    >
                      <Plus size={18} /> Agregar a la Lista
                    </Button>
                  </div>
                </Card>

                {/* SECCIÓN 2: LISTADO Y RESUMEN */}
                <Card className="xl:col-span-8 p-10 border-none shadow-2xl rounded-[2.5rem] bg-white min-h-[500px] flex flex-col">
                  <div className="flex items-center justify-between mb-8 border-b border-slate-100 pb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-[#2ec4f1] text-[#181c3a] rounded-xl flex items-center justify-center font-black text-xs">2</div>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Listado de Equipos del Conduce</h3>
                    </div>
                    <Badge className="bg-slate-50 text-slate-400 border-none font-black text-[9px] px-4 py-1.5 uppercase tracking-widest">{guideItems.length} GRUPOS</Badge>
                  </div>

                  {/* TABLA DE EQUIPOS */}
                  {guideItems.length > 0 ? (
                    <div className="space-y-8">
                      <div className="overflow-x-auto rounded-2xl border border-slate-100">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="bg-[#181c3a] border-b border-[#181c3a]">
                              <th className="px-5 py-5 text-[9px] font-black uppercase tracking-widest text-white/90">Tecnología</th>
                              <th className="px-5 py-5 text-[9px] font-black uppercase tracking-widest text-white/90">Marca</th>
                              <th className="px-5 py-5 text-[9px] font-black uppercase tracking-widest text-white/90">Modelo</th>
                              <th className="px-5 py-5 text-[9px] font-black uppercase tracking-widest text-white/90 text-center">Traslado SAP</th>
                              <th className="px-5 py-5 text-[9px] font-black uppercase tracking-widest text-white/90 text-center">Cantidad</th>
                              <th className="px-5 py-5 text-[9px] font-black uppercase tracking-widest text-white/90 text-center">Recibido</th>
                              <th className="px-5 py-5 text-[9px] font-black uppercase tracking-widest text-white/90 text-center">Pendiente</th>
                              <th className="px-5 py-5 text-[9px] font-black uppercase tracking-widest text-white/90 text-center">Series</th>
                              <th className="px-5 py-5 text-[9px] font-black uppercase tracking-widest text-white/90 text-right">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {guideItems.map((item, idx) => {
                              const techName = MASTER_TECNOLOGIAS.find(t => t.id === item.tipo)?.nombre || item.tipo;
                              const marcaName = MASTER_MARCAS.find(m => m.id === item.marca)?.nombre || item.marca;
                              const modeloName = MASTER_MODELOS.find(m => m.id === item.modelo)?.nombre || item.modelo;
                              const completedUnits = item.series.filter(u => u.length >= item.seriesPerUnit).length;
                              const pendingUnits = item.cantidad - completedUnits;
                              const totalSeries = item.series.flat().length;
                              const expectedSeries = item.cantidad * item.seriesPerUnit;
                              const isSelected = selectedItemIdx === idx;
                              const isComplete = completedUnits >= item.cantidad;

                              return (
                                <tr 
                                  key={idx} 
                                  className={`transition-all cursor-pointer ${isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50'} ${isComplete ? 'opacity-60' : ''}`}
                                  onClick={() => setSelectedItemIdx(isSelected ? null : idx)}
                                >
                                  <td className="px-5 py-4">
                                    <span className="text-[10px] font-black text-[#181c3a] uppercase">{techName}</span>
                                  </td>
                                  <td className="px-5 py-4">
                                    <span className="text-[10px] font-black text-[#181c3a] uppercase">{marcaName}</span>
                                  </td>
                                  <td className="px-5 py-4">
                                    <span className="text-xs font-black text-[#181c3a]">{modeloName}</span>
                                  </td>
                                  <td className="px-5 py-4 text-center">
                                    <span className="font-black text-[10px] text-slate-500">{sapTransferNumber || '---'}</span>
                                  </td>
                                  <td className="px-5 py-4 text-center">
                                    <span className="font-black text-sm text-[#181c3a]">{item.cantidad}</span>
                                  </td>
                                  <td className="px-5 py-4 text-center">
                                    <Badge className={`border-none font-black text-[10px] ${completedUnits > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                                      {completedUnits}
                                    </Badge>
                                  </td>
                                  <td className="px-5 py-4 text-center">
                                    <Badge className={`border-none font-black text-[10px] ${pendingUnits > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                      {pendingUnits}
                                    </Badge>
                                  </td>
                                  <td className="px-5 py-4 text-center">
                                    <span className={`text-[10px] font-mono font-black ${totalSeries >= expectedSeries ? 'text-emerald-600' : 'text-slate-400'}`}>
                                      {totalSeries}/{expectedSeries}
                                    </span>
                                  </td>
                                  <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex justify-end gap-1">
                                      <button 
                                        onClick={() => setSelectedItemIdx(isSelected ? null : idx)} 
                                        className={`p-2 rounded-lg transition-all ${isSelected ? 'bg-[#2ec4f1] text-white' : 'text-slate-300 hover:text-[#2ec4f1] hover:bg-blue-50'}`}
                                        title="Pistolear series"
                                      >
                                        <Barcode size={16} />
                                      </button>
                                      <button 
                                        onClick={() => { setSelectedItemIdx(null); setGuideItems(guideItems.filter((_, i) => i !== idx)); }} 
                                        className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* ZONA DE PISTOLEO (aparece al seleccionar un item) */}
                      {selectedItemIdx !== null && guideItems[selectedItemIdx] && (() => {
                        const item = guideItems[selectedItemIdx];
                        const idx = selectedItemIdx;
                        const techName = MASTER_TECNOLOGIAS.find(t => t.id === item.tipo)?.nombre || '';
                        const marcaName = MASTER_MARCAS.find(m => m.id === item.marca)?.nombre || '';
                        const modeloName = MASTER_MODELOS.find(m => m.id === item.modelo)?.nombre || '';
                        const totalSeries = item.series.flat().length;
                        const expectedSeries = item.cantidad * item.seriesPerUnit;

                        return (
                          <div className="bg-slate-50 rounded-[2rem] p-8 border-2 border-[#2ec4f1]/20 animate-rise-in">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                              <div>
                                <p className="text-[9px] font-black text-[#2ec4f1] uppercase tracking-widest mb-1">{techName} • {marcaName}</p>
                                <h4 className="text-lg font-black text-[#181c3a] uppercase">{modeloName}</h4>
                                <p className="text-[9px] font-black text-slate-400 uppercase mt-1">
                                  {item.seriesPerUnit} series/unidad — <span className="text-emerald-500">{totalSeries}/{expectedSeries} series totales</span>
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                {/* Botón eliminado para evitar cierres accidentales */}
                                {/* 
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={async () => {
                                    if (confirm("¿Marcar lote completo como recibido? Esto lo moverá al historial.")) {
                                                                  fetchPending();
                                      setActiveReception(null);
                                    }
                                  }}
                                  className="border-slate-200 text-[8px] font-black uppercase text-slate-400 hover:bg-emerald-50 hover:text-emerald-500 hover:border-emerald-100"
                                  leftIcon={<CheckCircle2 size={12} />}
                                >
                                  Marcar Recibido
                                </Button> 
                                */}
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => { setBulkTargetIdx(idx); setShowBulkModal(true); }}
                                  className="border-slate-200 text-[9px] font-black uppercase text-[#2ec4f1] hover:bg-blue-50"
                                >
                                  <Table size={12} className="mr-1.5" /> Carga Masiva
                                </Button>
                                <div className="flex gap-2">
                                  <input 
                                    type="text"
                                    autoFocus
                                    placeholder={`Pistolear ${item.series.length > 0 && item.series[item.series.length - 1].length < item.seriesPerUnit ? 'Serie ' + (item.series[item.series.length - 1].length + 1) + ' / Unidad ' + item.series.length : 'Serie 1 / Unidad ' + (item.series.length + 1)}...`}
                                    className="bg-white border-2 border-slate-200 rounded-xl px-4 py-3 text-xs font-mono font-bold outline-none focus:border-[#2ec4f1] w-64 transition-all"
                                    value={itemSeriesInputs[idx] || ''}
                                    onChange={(e) => setItemSeriesInputs({...itemSeriesInputs, [idx]: e.target.value})}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        const sn = itemSeriesInputs[idx]?.trim().toUpperCase();
                                        if (sn) {
                                          const newItems = [...guideItems];
                                          const target = { ...newItems[idx] };
                                          
                                          if (target.series.flat().includes(sn)) {
                                            alert("Serie ya existe");
                                            return;
                                          }

                                          let lastUnit = target.series.length > 0 ? target.series[target.series.length - 1] : null;
                                          
                                          if (lastUnit && lastUnit.length < target.seriesPerUnit) {
                                            lastUnit.push(sn);
                                          } else {
                                            if (target.series.length >= target.cantidad) {
                                              alert("Límite de unidades alcanzado");
                                              return;
                                            }
                                            target.series.push([sn]);
                                          }
                                          
                                          target.scannedCount = target.series.length;
                                          newItems[idx] = target;
                                          setGuideItems(newItems);
                                          setItemSeriesInputs({...itemSeriesInputs, [idx]: ''});
                                        }
                                      }
                                    }}
                                  />
                                  <Button 
                                    variant="secondary" 
                                    className="h-12 w-12 p-0 rounded-xl bg-[#181c3a] text-white hover:bg-[#2ec4f1]"
                                    onClick={() => {
                                      const sn = itemSeriesInputs[idx]?.trim().toUpperCase();
                                      if (!sn) return;
                                      const newItems = [...guideItems];
                                      const target = { ...newItems[idx] };
                                      if (target.series.flat().includes(sn)) { alert("Serie ya existe"); return; }
                                      let lastUnit = target.series.length > 0 ? target.series[target.series.length - 1] : null;
                                      if (lastUnit && lastUnit.length < target.seriesPerUnit) { lastUnit.push(sn); }
                                      else {
                                        if (target.series.length >= target.cantidad) { alert("Límite de unidades alcanzado"); return; }
                                        target.series.push([sn]);
                                      }
                                      target.scannedCount = target.series.length;
                                      newItems[idx] = target;
                                      setGuideItems(newItems);
                                      setItemSeriesInputs({...itemSeriesInputs, [idx]: ''});
                                    }}
                                  >
                                    <Plus size={16} />
                                  </Button>
                                </div>
                              </div>
                            </div>

                            {/* Grid de unidades escaneadas */}
                            {item.series.length > 0 ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                                {item.series.map((unit, uIdx) => (
                                  <div key={uIdx} className={`bg-white p-4 rounded-2xl border-2 flex flex-col gap-2 shadow-sm group/unit transition-all ${unit.length >= item.seriesPerUnit ? 'border-emerald-200' : 'border-amber-200'}`}>
                                    <div className="flex justify-between items-center">
                                      <div className="flex items-center gap-2">
                                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-black ${unit.length >= item.seriesPerUnit ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                          {uIdx + 1}
                                        </div>
                                        <span className="text-[8px] font-black text-slate-400 uppercase">
                                          Unidad {uIdx + 1} 
                                          {unit.length >= item.seriesPerUnit 
                                            ? <span className="text-emerald-500 ml-1.5">✓ Completa</span>
                                            : <span className="text-amber-500 ml-1.5">({unit.length}/{item.seriesPerUnit})</span>
                                          }
                                        </span>
                                      </div>
                                      <button 
                                        onClick={() => {
                                          const newItems = [...guideItems];
                                          newItems[idx].series.splice(uIdx, 1);
                                          newItems[idx].scannedCount = newItems[idx].series.length;
                                          setGuideItems(newItems);
                                        }}
                                        className="text-slate-200 hover:text-rose-500 opacity-0 group-hover/unit:opacity-100 transition-all"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                    <div className="space-y-1.5">
                                      {unit.map((sn, sIdx) => (
                                        <div key={sIdx} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 group/sn">
                                          <div className="flex items-center gap-2">
                                            <span className="text-[8px] font-black text-slate-300 w-4">S{sIdx + 1}</span>
                                            <span className="text-[10px] font-mono font-bold text-[#181c3a]">{sn}</span>
                                          </div>
                                          <div className="flex items-center gap-1 opacity-0 group-hover/sn:opacity-100 transition-all">
                                            <button 
                                              onClick={() => {
                                                const currentSN = unit[sIdx];
                                                const newSN = prompt("Editar número de serie:", currentSN);
                                                if (newSN !== null && newSN.trim() !== "") {
                                                  const newItems = [...guideItems];
                                                  newItems[idx].series[uIdx][sIdx] = newSN.trim().toUpperCase();
                                                  setGuideItems(newItems);
                                                }
                                              }}
                                              className="p-1.5 text-slate-400 hover:text-[#2ec4f1] transition-colors"
                                              title="Editar Serie"
                                            >
                                              <Edit3 size={10} />
                                            </button>
                                            <button 
                                              onClick={() => {
                                                if (confirm("¿Eliminar esta serie?")) {
                                                  const newItems = [...guideItems];
                                                  newItems[idx].series[uIdx].splice(sIdx, 1);
                                                  if (newItems[idx].series[uIdx].length === 0) {
                                                    newItems[idx].series.splice(uIdx, 1);
                                                  }
                                                  newItems[idx].scannedCount = newItems[idx].series.length;
                                                  setGuideItems(newItems);
                                                }
                                              }}
                                              className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors"
                                              title="Eliminar Serie"
                                            >
                                              <X size={10} />
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[10px] italic text-slate-300 text-center py-6">Escanee la primera serie para comenzar...</p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center py-20 text-center opacity-20">
                      <Package size={64} className="mb-4" />
                      <p className="text-[10px] font-black uppercase tracking-widest">El manifiesto está vacío</p>
                    </div>
                  )}


                  <div className="pt-8 border-t border-slate-100">
                    {(() => {
                      const isAllItemsComplete = guideItems.length > 0 && guideItems.every(item => {
                        const completedUnits = item.series.filter(u => u.length >= item.seriesPerUnit).length;
                        return completedUnits >= item.cantidad;
                      });

                      const isAccesorio = category === 'Accesorio';
                      const isReady = isAllItemsComplete || isAccesorio;

                      return (
                        <Button 
                          variant="primary" 
                          className={`w-full h-20 rounded-[1.5rem] shadow-2xl font-black uppercase tracking-[0.2em] text-xs transition-all ${(!isReady || isSubmitting) ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' : (isAccesorio ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-[#181c3a] hover:bg-[#2ec4f1] text-white')}`} 
                          onClick={async () => {
                            if (!isReady || isSubmitting) return;
                            if (isAccesorio) {
                              setReceptionStep('return_confirmation');
                            } else {
                              await completeCurrentGuides();
                            }
                          }} 
                          disabled={!isReady || guideItems.length === 0 || isSubmitting}
                        >
                          {isSubmitting ? 'Procesando...' : (isAccesorio ? 'Finalizar y Notificar' : (isAllItemsComplete ? 'Finalizar Recepción' : 'Complete el Pistoleo de Series'))}
                        </Button>
                      );
                    })()}
                  </div>
                </Card>
              </div>
            </div>
          )}



          {(receptionStep as any) === 'accessories_photos' && (
            <div className="space-y-8 animate-rise-in max-w-4xl mx-auto">
              <div className="flex justify-between items-center">
                <button onClick={() => setReceptionStep('classification')} className="flex items-center gap-2 text-[10px] font-black text-slate-400 hover:text-[#181c3a] uppercase tracking-widest transition-all">
                  <ChevronLeft size={16} /> Volver a Clasificación
                </button>
              </div>

              <Card className="p-12 border-none shadow-2xl rounded-[3rem] bg-white text-center">
                <div className="bg-emerald-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 text-emerald-500">
                  <Camera size={48} />
                </div>
                <h2 className="text-3xl font-black text-[#181c3a] uppercase mb-4">Inspección Visual (Fotos)</h2>
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] mb-12">Capture evidencia del estado de la caja de accesorios</p>

                <div className="bg-slate-50 p-10 rounded-[2.5rem] border-2 border-dashed border-slate-200 mb-10 group hover:border-[#2ec4f1] transition-all">
                  <div className="flex flex-col items-center">
                    <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center text-slate-300 mb-4 shadow-sm group-hover:text-[#2ec4f1] group-hover:scale-110 transition-all">
                      <Plus size={32} />
                    </div>
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Subir fotos de la mercadería</p>
                    <p className="text-[10px] font-bold text-slate-300 uppercase">JPEG, PNG hasta 10MB</p>
                    
                    {/* Simulación de carga para demo */}
                    <input 
                      type="file" 
                      multiple 
                      className="hidden" 
                      id="photo-upload" 
                      onChange={(e) => {
                        // Aquí iría la lógica de carga a Supabase Storage
                        // Por ahora simulamos que se agregaron
                        setAccessoryPhotos(prev => [...prev, "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&auto=format&fit=crop&q=60"]);
                      }}
                    />
                    <label htmlFor="photo-upload" className="mt-6 px-10 py-4 bg-[#181c3a] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-[#2ec4f1] transition-all cursor-pointer shadow-xl shadow-blue-500/10">
                      Seleccionar Imágenes
                    </label>
                  </div>
                </div>

                {accessoryPhotos.length > 0 && (
                  <div className="grid grid-cols-4 gap-4 mb-10">
                    {accessoryPhotos.map((p, idx) => (
                      <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden border-2 border-white shadow-md group/photo">
                        <img src={p} className="w-full h-full object-cover" />
                        <button 
                          onClick={() => setAccessoryPhotos(prev => prev.filter((_, i) => i !== idx))}
                          className="absolute top-2 right-2 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/photo:opacity-100 transition-all"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-4">
                  <Button variant="outline" className="flex-1 h-20 rounded-2xl font-black uppercase text-xs" onClick={() => setReceptionStep('classification')}>Cancelar</Button>
                  <Button 
                    className="flex-[2] h-20 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl shadow-2xl shadow-emerald-500/20 font-black uppercase text-xs"
                    onClick={() => setReceptionStep('sub_bodega_transfer')}
                  >
                    Continuar con la Transferencia
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {receptionStep === 'return_confirmation' && (
            <div className="space-y-8 animate-rise-in max-w-4xl mx-auto">
              <div className="flex justify-between items-center">
                <button onClick={() => setReceptionStep('classification')} className="flex items-center gap-2 text-[10px] font-black text-slate-400 hover:text-[#181c3a] uppercase tracking-widest transition-all">
                  <ChevronLeft size={16} /> Volver a Clasificación
                </button>
              </div>

              <Card className="p-10 border-none shadow-2xl rounded-[2.5rem] bg-white text-center">
                <div className="bg-amber-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-8 text-amber-500">
                  <FileText size={40} />
                </div>
                <h2 className="text-3xl font-black text-[#181c3a] uppercase mb-4">Confirmación de Devolución</h2>
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] mb-12">Se enviará una notificación formal a la agencia</p>

                <div className="bg-slate-50 p-8 rounded-3xl text-left mb-8 border border-slate-100">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                    <div 
                      onClick={() => setShowAgencyModal(true)}
                      className="cursor-pointer hover:bg-slate-100 p-4 -m-4 rounded-2xl transition-all border-2 border-transparent hover:border-slate-200"
                    >
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-2 flex items-center gap-2">
                        Notificar a Encargado (Agencia)
                        <span className="bg-[#2ec4f1]/10 text-[#2ec4f1] px-2 py-0.5 rounded-full text-[8px]">Cambiar Agencia</span>
                      </p>
                      <p className="text-sm font-black text-[#181c3a] uppercase">{agencyDetails ? `${agencyDetails.name} - ${agencyDetails.manager || 'SIN ENCARGADO'}` : 'SELECCIONAR AGENCIA...'}</p>
                      <p className="text-[10px] font-bold text-[#2ec4f1] lowercase mt-1">
                        {agencyDetails?.email || 'correo@claro.com.gt'}
                        {activeReception?.received_by && <span className="text-slate-400 ml-2 text-[9px] uppercase">+ CC: {activeReception.received_by}</span>}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Guías de Recepción</p>
                      <p className="text-sm font-black text-[#181c3a] font-mono">{scannedGuides.join(', ')}</p>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                        <div>
                          <label className="text-[9px] font-black text-slate-400 uppercase">Guía de Envío</label>
                          <input 
                            type="text" 
                            className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg font-bold text-xs outline-none focus:ring-2 focus:ring-amber-500"
                            placeholder="No. Guía"
                            value={returnTracking}
                            onChange={(e) => setReturnTracking(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-black text-slate-400 uppercase">Logística (Courier)</label>
                          <input 
                            type="text" 
                            className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg font-bold text-xs outline-none focus:ring-2 focus:ring-amber-500"
                            placeholder="Ej. Guatex, Cargo Expreso"
                            value={returnCourier}
                            onChange={(e) => setReturnCourier(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center ml-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase">Motivo de la Devolución</label>
                    </div>
                    <textarea 
                      className="w-full p-6 bg-white border border-slate-200 rounded-2xl font-bold text-sm text-[#181c3a] outline-none focus:ring-2 focus:ring-amber-500 min-h-[120px] transition-all"
                      placeholder="Ej. Material no corresponde al manifiesto / Daño físico detectado..."
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                    />
                  </div>

                  <div className="mt-8 border-t border-slate-200 pt-8">
                    <div className="flex justify-between items-center mb-4">
                      <div>
                        <p className="text-[10px] font-black text-[#181c3a] uppercase">Evidencia Fotográfica</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Sube hasta 5 fotos (se comprimirán automáticamente)</p>
                      </div>
                      <input 
                        type="file" 
                        multiple 
                        accept="image/*"
                        className="hidden" 
                        id="return-photo-upload" 
                        onChange={async (e) => {
                          if (e.target.files) {
                            const files = Array.from(e.target.files);
                            if (accessoryPhotos.length + files.length > 5) {
                              alert("Solo puedes subir un máximo de 5 fotos.");
                              return;
                            }
                            try {
                              const compressed = await Promise.all(files.map(compressImage));
                              setAccessoryPhotos(prev => [...prev, ...compressed]);
                            } catch (err) {
                              console.error(err);
                              alert("Error al procesar las imágenes.");
                            }
                          }
                        }}
                      />
                      <label htmlFor="return-photo-upload" className="px-6 py-3 bg-slate-100 text-[#181c3a] rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-[#2ec4f1] hover:text-white transition-all cursor-pointer shadow-sm flex items-center gap-2">
                        <Camera size={14} /> Agregar Fotos
                      </label>
                    </div>

                    {accessoryPhotos.length > 0 && (
                      <div className="grid grid-cols-5 gap-3 mt-4">
                        {accessoryPhotos.map((p, idx) => (
                          <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 group/photo">
                            <img src={p} className="w-full h-full object-cover" />
                            <button 
                              onClick={() => setAccessoryPhotos(prev => prev.filter((_, i) => i !== idx))}
                              className="absolute top-1 right-1 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/photo:opacity-100 transition-all shadow-md"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-4">
                  <Button variant="outline" className="flex-1 h-16 rounded-2xl font-black uppercase text-xs" onClick={() => setReceptionStep('classification')}>Cancelar</Button>
                  <Button 
                    className={`flex-[2] h-16 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl shadow-xl shadow-amber-500/20 font-black uppercase text-xs ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={handleConfirmReturn}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Procesando...' : 'Confirmar y Enviar Notificación'}
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {receptionStep === 'sub_bodega_transfer' && (
            <div className="space-y-8 animate-rise-in max-w-4xl mx-auto">
              <div className="flex justify-between items-center">
                <button onClick={() => setReceptionStep('classification')} className="flex items-center gap-2 text-[10px] font-black text-slate-400 hover:text-[#181c3a] uppercase tracking-widest transition-all">
                  <ChevronLeft size={16} /> Volver a Clasificación
                </button>
              </div>

              <Card className="p-12 border-none shadow-2xl rounded-[2.5rem] bg-white text-center border border-slate-100">
                <div className={`${category === 'Accesorio' ? 'bg-emerald-50 text-emerald-500' : 'bg-amber-50 text-amber-500'} w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8`}>
                  {category === 'Accesorio' ? <Package size={48} /> : <Radio size={48} />}
                </div>
                <h2 className="text-3xl font-black text-[#181c3a] uppercase mb-4">Transferencia a Sub-Bodega</h2>
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] mb-12">Confirmar el envío de la caja a la sub-bodega correspondiente</p>

                <div className="bg-slate-50 p-8 rounded-3xl text-left mb-12 border border-slate-100">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Destino (Sub-Bodega)</p>
                      <p className={`text-xl font-black uppercase ${category === 'Accesorio' ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {category === 'Accesorio' ? 'Bodega de Accesorios' : 'Móviles (Teléfonos)'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Caja / Guía a Transferir</p>
                      <p className="text-xl font-black text-[#181c3a] font-mono">{scannedGuides.join(', ')}</p>
                    </div>
                  </div>
                  <div className="space-y-4 mb-8">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Agencia de Origen (CAC)</label>
                    <div className="relative">
                      <select 
                        className="w-full p-6 bg-white border border-slate-200 rounded-2xl font-bold text-sm text-[#181c3a] outline-none focus:ring-2 focus:ring-[#2ec4f1] appearance-none transition-all"
                        value={agencia}
                        onChange={(e) => setAgencia(e.target.value)}
                      >
                        <option value="">-- Seleccionar Agencia --</option>
                        {CAC_AGENCIES.map((a: any) => (
                          <option key={a.id} value={a.name}>{a.name}</option>
                        ))}
                      </select>
                      <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <ChevronDown size={18} />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Notas de la Transferencia (Opcional)</label>
                    <textarea 
                      className="w-full p-6 bg-white border border-slate-200 rounded-2xl font-bold text-sm text-[#181c3a] outline-none focus:ring-2 focus:ring-[#2ec4f1] min-h-[100px] transition-all"
                      placeholder="Ej. Cantidad estimada de piezas, estado de la caja..."
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex gap-4">
                  <Button variant="outline" className="flex-1 h-20 rounded-2xl font-black uppercase text-xs" onClick={() => setReceptionStep('classification')}>Cancelar</Button>
                   <Button 
                    className={`flex-[2] h-20 text-white rounded-2xl shadow-2xl font-black uppercase text-xs transition-all ${(!agencia || isSubmitting) ? 'bg-slate-300 cursor-not-allowed' : (category === 'Accesorio' ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20' : 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20')}`}
                    onClick={async () => {
                      if (!agencia || isSubmitting) {
                        if (!agencia) alert("Por favor, seleccione una agencia de origen.");
                        return;
                      }
                      // Forzamos que la categoría sea la correcta antes de guardar
                      await completeCurrentGuides();
                    }}
                    disabled={!agencia || isSubmitting}
                  >
                    {isSubmitting ? 'Procesando...' : 'Confirmar Envío a Sub-Bodega'}
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {receptionStep === 'completed' && (
            <div className="flex flex-col items-center justify-center py-24 bg-white rounded-3xl border-2 border-slate-100 shadow-xl animate-rise-in">
              <div className="bg-emerald-100 p-10 rounded-full mb-8"><CheckCircle2 className="w-20 h-20 text-emerald-500" /></div>
              <h3 className="text-3xl font-black text-[#181c3a] mb-4 uppercase">Proceso Finalizado</h3>
              <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.3em] mb-12 text-center max-w-sm">
                La información ha sido procesada {category === 'Accesorio' ? 'y la agencia ha sido notificada vía correo.' : 'y enviada a bodega.'}
              </p>
              <Button variant="primary" className="bg-[#181c3a] px-12 h-16 rounded-2xl font-black uppercase text-xs" onClick={() => { fetchHistory(); setReceptionStep('classification'); setGuideItems([]); setScannedGuides([]); setAgencia(''); setReturnReason(''); setSelectedItemIdx(null); setItemSeriesInputs({}); setAccessoryPhotos([]); }}>Siguiente Caja</Button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-4 animate-rise-in">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-9 gap-4 mb-10">
            {(() => {
              const baseDataForMetrics = historyReceptions;
              
              const techCounts: Record<string, number> = {};
              let totalGlobalUnits = 0;
              let unknownTechUnits = 0;

              baseDataForMetrics.forEach(rec => {
                const groups = groupSeriesByEquipment(rec.series || []);
                groups.forEach(g => {
                  const model = MASTER_MODELOS.find(m => m.id === g.modelId);
                  const seriesPerUnit = model?.seriesCount || 1;
                  const unitCount = g.fullSeries.length / seriesPerUnit;
                  
                  totalGlobalUnits += unitCount;
                  
                  if (model?.tecnologiaId) {
                    techCounts[model.tecnologiaId] = (techCounts[model.tecnologiaId] || 0) + unitCount;
                  } else {
                    unknownTechUnits += unitCount;
                  }
                });
              });

              return (
                <>
                  {MASTER_TECNOLOGIAS.map(tech => {
                    const count = Math.ceil(techCounts[tech.id] || 0);
                    return (
                      <Card key={tech.id} className="p-6 border-none shadow-2xl bg-white rounded-[2.5rem] flex flex-col items-center justify-center text-center group hover:bg-[#181c3a] transition-all duration-500 border border-slate-100/50 h-40">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 group-hover:text-white/50 mb-4">{tech.nombre}</p>
                        <p className="text-5xl font-black text-[#181c3a] group-hover:text-[#2ec4f1] leading-none tracking-tighter">{count}</p>
                        <p className="text-[9px] font-black text-slate-300 group-hover:text-white/20 uppercase mt-4 tracking-widest">Equipos</p>
                      </Card>
                    );
                  })}

                  {unknownTechUnits > 0 && (
                    <Card className="p-6 border-none shadow-2xl bg-rose-50 rounded-[2.5rem] flex flex-col items-center justify-center text-center group hover:bg-rose-500 transition-all duration-500 border border-rose-100 h-40">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-400 group-hover:text-white mb-4">SIN TECNOLOGÍA</p>
                      <p className="text-5xl font-black text-rose-500 group-hover:text-white leading-none tracking-tighter">{Math.ceil(unknownTechUnits)}</p>
                      <p className="text-[9px] font-black text-rose-200 group-hover:text-white/50 uppercase mt-4 tracking-widest">Revisar Modelos</p>
                    </Card>
                  )}
                  
                  <Card className="p-6 border-none shadow-2xl bg-white rounded-[2.5rem] flex flex-col items-center justify-center text-center group hover:bg-[#181c3a] transition-all duration-500 border border-slate-100/50 h-40">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 group-hover:text-white/50 mb-4">Total Global</p>
                    <p className="text-5xl font-black text-[#181c3a] group-hover:text-[#2ec4f1] leading-none tracking-tighter">{Math.ceil(totalGlobalUnits)}</p>
                    <p className="text-[9px] font-black text-slate-300 group-hover:text-white/20 uppercase mt-4 tracking-widest">Unidades</p>
                  </Card>

                  <Card className="p-6 border-none shadow-2xl bg-[#2ec4f1] rounded-[2.5rem] flex flex-col items-center justify-center text-center text-[#181c3a] h-40">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#181c3a]/30 mb-4">Órdenes (OS)</p>
                    <p className="text-6xl font-black text-[#181c3a] leading-none tracking-tighter">
                      {baseDataForMetrics.reduce((acc, rec) => {
                        const osSet = new Set((rec.series || []).map((s: any) => s.service_orders?.os_label).filter(Boolean));
                        return acc + osSet.size;
                      }, 0)}
                    </p>
                    <p className="text-[9px] font-black text-[#181c3a]/20 uppercase mt-4 tracking-widest">Generadas</p>
                  </Card>
                </>
              );
            })()}
          </div>


          {/* Toolbar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-2 mb-10">
            <div className="flex flex-col">
              <h2 className="text-xl font-black text-[#181c3a] uppercase tracking-tight">Bandeja de Historial Global</h2>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mt-2">
                {historyReceptions.length} registros totales encontrados
              </p>
            </div>
            
            <div className="flex flex-wrap gap-4 items-center">
              {/* Filtros de Fecha */}
              <div className="flex items-center gap-4 bg-white p-2.5 rounded-3xl border border-slate-100 shadow-sm px-6">
                <div className="flex flex-col">
                  <label className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-0.5">Desde</label>
                  <input 
                    type="date" 
                    className="text-[11px] font-bold text-[#181c3a] outline-none cursor-pointer" 
                    value={dateFilterFrom}
                    onChange={(e) => setDateFilterFrom(e.target.value)}
                  />
                </div>
                <div className="w-[1px] h-8 bg-slate-100" />
                <div className="flex flex-col">
                  <label className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-0.5">Hasta</label>
                  <input 
                    type="date" 
                    className="text-[11px] font-bold text-[#181c3a] outline-none cursor-pointer" 
                    value={dateFilterTo}
                    onChange={(e) => setDateFilterTo(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleExportReport}
                  className="flex items-center gap-3 px-8 h-16 bg-[#2ec4f1] text-[#181c3a] rounded-3xl text-[10px] font-black uppercase tracking-widest hover:bg-[#181c3a] hover:text-white transition-all shadow-xl shadow-[#2ec4f1]/20 active:scale-95"
                >
                  <Download size={16} /> Generar Reporte
                </button>
                <button
                  onClick={() => setShowMassTransferModal(true)}
                  className="flex items-center gap-3 px-8 h-16 bg-amber-500 text-white rounded-3xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all shadow-xl shadow-amber-500/20 active:scale-95"
                >
                  <Stethoscope size={16} /> Trasladar a Taller
                </button>
              </div>
            </div>
          </div>

          <Card className="p-0 bg-white rounded-[2.5rem] shadow-2xl border-none overflow-hidden transition-all duration-500">
            <div className="p-8 border-b border-slate-50">
              <div className="relative group max-w-md">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-[#2ec4f1] transition-colors" />
                <input 
                  type="text" 
                  placeholder="BUSCAR POR GUÍA, PILOTO, AGENCIA O TRASLADO SAP..."
                  className="w-full h-14 pl-16 pr-6 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-[10px] text-[#181c3a] outline-none focus:border-[#2ec4f1] focus:bg-white transition-all uppercase tracking-widest"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[1400px]">
                <thead>
                  <tr className="bg-[#181c3a] text-white">
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">Fecha / Hora</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">No. Guía</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">Piloto</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">Courier</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">Recibió</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">Estatus</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">Orden de Servicio</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">Ingreso</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">Agencia CAC</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">Tecnología</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">Marca</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">Modelo</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">Traslado SAP</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">S-1</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">S-2</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">S-3</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap">S-4</th>
                    <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] whitespace-nowrap text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const baseData = historyReceptions;
                    
                    const filteredRecords = baseData
                      .filter(r => {
                        if (!dateFilterFrom && !dateFilterTo) return true;
                        const d = new Date(r.created_at);
                        if (dateFilterFrom && d < new Date(dateFilterFrom)) return false;
                        if (dateFilterTo) {
                          const to = new Date(dateFilterTo);
                          to.setHours(23, 59, 59);
                          if (d > to) return false;
                        }
                        return true;
                      })
                      .filter(r => {
                        if (!historySearch) return true;
                        const s = historySearch.toLowerCase();
                        const piloto = r.notes?.split('Piloto: ')[1]?.split('\n')[0]?.toLowerCase() || '';
                        const agencia = getAgenciaLabel(r, CAC_AGENCIES).toLowerCase();
                        const sapDoc = (r.sap_document || '').toLowerCase();
                        const matchingSeries = (r.series || []).some((ser: any) => 
                          (ser.serial_number || '').toLowerCase().includes(s)
                        );
                        return r.guide_number.toLowerCase().includes(s) || 
                               piloto.includes(s) || 
                               agencia.includes(s) ||
                               sapDoc.includes(s) ||
                               (r.carrier || '').toLowerCase().includes(s) ||
                               matchingSeries;
                      });

                    if (filteredRecords.length === 0) {
                      return (
                        <tr>
                          <td colSpan={17} className="p-12 text-center">
                            <Database className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No hay resultados que coincidan con la búsqueda o filtros</p>
                          </td>
                        </tr>
                      );
                    }

                    return filteredRecords.flatMap((rec, recIdx) => {
                      const dateObj = new Date(rec.created_at);
                      const formattedDate = `${dateObj.getDate()}-${dateObj.getMonth() + 1}-${dateObj.getFullYear()} ${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;
                      
                      const rawNotes = rec.notes || '';
                      let displayGuide = rec.guide_number;
                      if (rec.processed_guides?.length > 0) {
                         const equipoGuides = [];
                         for (const g of rec.processed_guides) {
                            const gEscaped = g.replace(/[-]/g, '\\-');
                            const guideBlockRegex = new RegExp(`\\[Guía.*?(?:${gEscaped}).*?\\][\\s\\S]*?(?=\\[Guía|$)`, 'i');
                            const guideBlockMatch = rawNotes.match(guideBlockRegex);
                            if (guideBlockMatch && guideBlockMatch[0].toLowerCase().includes('equipo')) {
                               equipoGuides.push(g);
                           }
                         }
                         if (equipoGuides.length > 0) {
                            displayGuide = Array.from(new Set(equipoGuides)).join(' / ');
                         } else {
                            displayGuide = Array.from(new Set(rec.processed_guides)).join(' / '); // fallback
                         }
                      }
                      const piloto = rec.notes?.split('Piloto: ')[1]?.split('\n')[0] || '---';
                      
                      const equipGroups = groupSeriesByEquipment(rec.series || []);
                      const bandBg = recIdx % 2 === 0 ? '' : 'bg-slate-50/50';
                      
                      // Si no hay equipos, mostrar al menos una fila con la información de la recepción
                      if (equipGroups.length === 0) {
                        const techVal = (rec.notes || '').split('Backoffice_Tech: ')[1]?.split('\n')[0] || '';
                        const brandVal = (rec.notes || '').split('Backoffice_Brand: ')[1]?.split('\n')[0] || '';
                        const modelVal = (rec.notes || '').split('Backoffice_Model: ')[1]?.split('\n')[0] || '';
                        const categoryVal = (rec.notes || '').split('Backoffice_Category: ')[1]?.split('\n')[0] || '';

                        return [(
                          <tr key={rec.id} className={`border-b border-slate-100 transition-colors hover:bg-blue-50/30 ${bandBg}`}>
                            <td className="px-4 py-3 text-[11px] font-bold text-[#181c3a] whitespace-nowrap">{formattedDate}</td>
                            <td className="px-4 py-3 whitespace-nowrap"><span className="text-[11px] font-black font-mono text-[#181c3a]">{displayGuide}</span></td>
                            <td className="px-4 py-3 text-[11px] font-black text-slate-500 uppercase whitespace-nowrap">{piloto}</td>
                            <td className="px-4 py-3 text-[11px] text-slate-400 uppercase whitespace-nowrap">{rec.carrier || '---'}</td>
                            <td className="px-4 py-3 text-[11px] text-slate-500 whitespace-nowrap">{getReceiverName(rec)}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {(() => {
                                const status = rec.status || '';
                                let label = status === 'PENDIENTE_BACKOFFICE' ? 'EN BACKOFFICE' : status;
                                let colorClass = 'bg-blue-50 text-blue-600';
                                
                                if (status === 'CLASIFICADA' || status === 'RECIBIDO_BACKOFFICE') {
                                  label = 'INGRESADO A BACKOFFICE';
                                  colorClass = 'bg-slate-100 text-[#181c3a]';
                                }

                                return (
                                  <span className={`text-[9px] uppercase font-black tracking-widest px-3 py-1 rounded-full ${colorClass}`}>
                                    {label}
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap"><Badge className="bg-slate-50 text-slate-300 border-none font-black text-[10px] px-2 py-0.5">---</Badge></td>
                            <td className="px-4 py-3 text-center whitespace-nowrap"><Badge className="bg-slate-50 text-slate-300 border-none font-black text-[10px] px-2 py-0.5">---</Badge></td>
                            <td className="px-4 py-3 text-[11px] font-bold text-[#181c3a] uppercase whitespace-nowrap">{getAgenciaLabel(rec, CAC_AGENCIES)}</td>
                            {/* Tecnología */}
                            <td className="px-4 py-3 text-[11px] font-black text-slate-500 uppercase whitespace-nowrap">
                              {techVal || (categoryVal ? (categoryVal.toLowerCase() === 'accesorio' ? 'ACCESORIOS' : 'MÓVILES') : '---')}
                            </td>
                            {/* Marca */}
                            <td className="px-4 py-3 text-[11px] font-black text-slate-600 uppercase whitespace-nowrap">
                              {brandVal || '---'}
                            </td>
                            {/* Modelo */}
                            <td className="px-4 py-3 text-[11px] font-bold text-[#181c3a] whitespace-nowrap">
                              {modelVal || (categoryVal ? (categoryVal.toLowerCase() === 'accesorio' ? 'LOTE ACCESORIOS' : 'LOTE TELÉFONOS') : 'SIN EQUIPOS REGISTRADOS')}
                            </td>
                            {/* Traslado SAP */}
                            <td className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase whitespace-nowrap">
                              {rec.sap_document || '---'}
                            </td>
                            {/* S-1 */}
                            <td className="px-4 py-3 text-[11px] font-mono font-bold text-slate-600 whitespace-nowrap">---</td>
                            {/* S-2 */}
                            <td className="px-4 py-3 text-[11px] font-mono font-bold text-slate-600 whitespace-nowrap">---</td>
                            {/* S-3 */}
                            <td className="px-4 py-3 text-[11px] font-mono font-bold text-slate-600 whitespace-nowrap">---</td>
                            {/* S-4 */}
                            <td className="px-4 py-3 text-[11px] font-mono font-bold text-slate-600 whitespace-nowrap">---</td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              <div className="flex justify-end gap-1">
                                <button 
                                  onClick={() => window.location.href = `/logistica/devoluciones?reception_id=${rec.id}`} 
                                  className="w-6 h-6 rounded-md bg-rose-50 flex items-center justify-center text-rose-500 hover:bg-rose-500 hover:text-white transition-all shadow-sm" 
                                  title="Devolver Lote (Gestión Retornos)"
                                >
                                  <RotateCcw size={11} />
                                </button>
                                {typeof window !== 'undefined' && (window.localStorage.getItem('user_role') === 'TI' || window.localStorage.getItem('user_role') === 'ROOT') && (
                                  <button 
                                    onClick={() => handleReturnToPending(rec.id)} 
                                    className="w-6 h-6 rounded-md bg-rose-50 flex items-center justify-center text-rose-500 hover:bg-rose-500 hover:text-white transition-all shadow-sm" 
                                    title="Regresar a Pendiente"
                                  >
                                    <RefreshCw size={11} />
                                  </button>
                                )}
                                <button onClick={() => setShowTimeline(rec)} className="w-6 h-6 rounded-md bg-blue-50 flex items-center justify-center text-[#2ec4f1] hover:bg-[#2ec4f1] hover:text-white transition-all shadow-sm" title="Ver Trazabilidad"><Clock size={11} /></button>
                                <button onClick={() => handleOpenHistoryModal(rec)} className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-slate-400 hover:text-[#181c3a] transition-all" title="Ver Detalle"><Eye size={11} /></button>
                                <button 
                                  onClick={() => { setActiveReception(rec); setProcessedGuides(rec.processed_guides || []); setReceptionStep('classification'); setActiveTab('op'); }} 
                                  className="w-6 h-6 rounded-md bg-emerald-50 flex items-center justify-center text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all shadow-sm" 
                                  title="Abrir en Bandeja (Reclasificar)"
                                >
                                  <Box size={11} />
                                </button>
                                <button onClick={() => handleOpenEditMeta(rec)} className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-slate-400 hover:text-amber-500 transition-all" title="Editar Metadatos"><Edit2 size={11} /></button>
                                <button onClick={() => handlePrintConduce(rec)} className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-slate-400 hover:text-blue-500 transition-all" title="Imprimir PDF"><Printer size={11} /></button>
                              </div>
                            </td>
                          </tr>
                        )];
                      }

                      // Si hay equipos, mapear cada unidad individualmente
                      return equipGroups.flatMap((grp, gi) => {
                        const modelObj = MASTER_MODELOS.find(m => m.id === grp.modelId);
                        const brandObj = MASTER_MARCAS.find(b => b.id === grp.brandId);
                        const techObj = modelObj ? MASTER_TECNOLOGIAS.find(t => t.id === modelObj.tecnologiaId) : null;
                        const seriesPerUnit = modelObj?.seriesCount || 1;
                        
                        const units: any[][] = [];
                        for (let i = 0; i < grp.fullSeries.length; i += seriesPerUnit) {
                          units.push(grp.fullSeries.slice(i, i + seriesPerUnit));
                        }

                        return units.map((unit, ui) => {
                          const osLabel = unit.find((u: any) => u?.service_orders?.os_label)?.service_orders?.os_label || '---';
                          const reentry = unit.find((u: any) => u?.service_orders?.reentry_count)?.service_orders?.reentry_count || 1;

                          let unitGuide = displayGuide;
                          if (unit[0]?.serial_number && rec.processed_guides?.length > 0) {
                            for (const g of rec.processed_guides) {
                              const gEscaped = g.replace(/[-]/g, '\\-');
                              const guideBlockRegex = new RegExp(`\\[Guía.*?(?:${gEscaped}).*?\\][\\s\\S]*?(?=\\[Guía|$)`, 'i');
                              const guideBlockMatch = rawNotes.match(guideBlockRegex);
                              if (guideBlockMatch && guideBlockMatch[0].includes(unit[0].serial_number)) {
                                unitGuide = g;
                                break;
                              }
                            }
                          }

                          return (
                            <tr key={`${rec.id}-${gi}-${ui}`} className={`border-b border-slate-100 transition-colors hover:bg-blue-50/30 ${bandBg}`}>
                              <td className="px-4 py-3 text-[11px] font-bold text-[#181c3a] whitespace-nowrap">{formattedDate}</td>
                              <td className="px-4 py-3 whitespace-nowrap"><span className="text-[11px] font-black font-mono text-[#181c3a]">{unitGuide}</span></td>
                              <td className="px-4 py-3 text-[11px] font-black text-slate-500 uppercase whitespace-nowrap">{piloto}</td>
                              <td className="px-4 py-3 text-[11px] text-slate-400 uppercase whitespace-nowrap">{rec.carrier || '---'}</td>
                              <td className="px-4 py-3 text-[11px] text-slate-500 whitespace-nowrap">{getReceiverName(rec)}</td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className="text-[9px] uppercase font-black tracking-widest px-3 py-1 rounded-full bg-blue-50 text-blue-600">
                                  RECIBIDO
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap flex items-center gap-2">
                                <Badge className="bg-blue-50 text-blue-600 border-none font-black text-[10px] px-2 py-0.5">{osLabel}</Badge>
                                {osLabel === '---' && (
                                  <button 
                                    onClick={() => handleFixMissingOS(rec.id, unit, grp.modelId, grp.brandId)}
                                    className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-bold rounded-md hover:bg-amber-200 transition-colors"
                                    title="Forzar creación de Orden de Servicio"
                                  >
                                    GENERAR OS
                                  </button>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center whitespace-nowrap">
                                <Badge className={`border-none font-black text-[10px] px-2 py-0.5 ${reentry > 1 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'}`}>
                                  {reentry}° Ingreso
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-[11px] font-bold text-[#181c3a] uppercase whitespace-nowrap">
                                {getAgenciaLabel(rec, CAC_AGENCIES)}
                              </td>
                              <td className="px-4 py-3 text-[11px] font-black text-slate-500 uppercase whitespace-nowrap">
                                {techObj?.nombre || '---'}
                              </td>
                              <td className="px-4 py-3 text-[11px] font-black text-slate-600 uppercase whitespace-nowrap">
                                {brandObj?.nombre || '---'}
                              </td>
                              <td className="px-4 py-3 text-[11px] font-bold text-[#181c3a] whitespace-nowrap">
                                {modelObj?.nombre || '---'}
                              </td>
                              <td className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase whitespace-nowrap">
                                {rec.sap_document || '---'}
                              </td>
                              {[0, 1, 2, 3].map(si => (
                                <td key={si} className="px-4 py-3 text-[11px] font-mono font-bold text-slate-600 whitespace-nowrap">
                                  {unit[si]?.serial_number ? <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] tracking-wide">{unit[si].serial_number}</span> : ''}
                                </td>
                              ))}
                              <td className="px-4 py-3 text-right whitespace-nowrap">
                                <div className="flex justify-end gap-1">
                                  <button 
                                    onClick={() => window.location.href = `/logistica/devoluciones?reception_id=${rec.id}`} 
                                    className="w-6 h-6 rounded-md bg-rose-50 flex items-center justify-center text-rose-500 hover:bg-rose-500 hover:text-white transition-all shadow-sm" 
                                    title="Devolver Lote (Gestión Retornos)"
                                  >
                                    <RotateCcw size={11} />
                                  </button>
                                  {typeof window !== 'undefined' && (window.localStorage.getItem('user_role') === 'TI' || window.localStorage.getItem('user_role') === 'ROOT') && (
                                    <button 
                                      onClick={() => handleReturnToPending(rec.id)} 
                                      className="w-6 h-6 rounded-md bg-rose-50 flex items-center justify-center text-rose-500 hover:bg-rose-500 hover:text-white transition-all shadow-sm" 
                                      title="Regresar a Pendiente"
                                    >
                                      <RefreshCw size={11} />
                                    </button>
                                  )}
                                  <button onClick={() => setShowTimeline(rec)} className="w-6 h-6 rounded-md bg-blue-50 flex items-center justify-center text-[#2ec4f1] hover:bg-[#2ec4f1] hover:text-white transition-all shadow-sm" title="Ver Trazabilidad"><Clock size={11} /></button>
                                  <button onClick={() => handleOpenHistoryModal(rec)} className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-slate-400 hover:text-[#181c3a] transition-all" title="Ver Detalle"><Eye size={11} /></button>
                                  <button onClick={() => handleOpenEditMeta(rec)} className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-slate-400 hover:text-amber-500 transition-all" title="Editar Metadatos"><Edit2 size={11} /></button>
                                  <button onClick={() => handlePrintConduce(rec)} className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-slate-400 hover:text-blue-500 transition-all" title="Imprimir PDF"><Printer size={11} /></button>
                                </div>
                              </td>
                            </tr>
                            );
                          });
                        });
                      });
                    })()}
                  </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}



      {/* MODAL COMPLETAR DATOS DE RECEPCIÓN */}

      {editMetaRec && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#181c3a]/80 backdrop-blur-xl p-6">
          <Card className="w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border-none animate-rise-in p-0">
            <div className="bg-[#181c3a] p-7 text-white flex justify-between items-center">
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-white/40 mb-1">Completar datos faltantes</p>
                <h3 className="text-lg font-black uppercase tracking-tight">Guía {editMetaRec.guide_number}</h3>
              </div>
              <button onClick={() => setEditMetaRec(null)} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all">
                <Plus size={18} className="rotate-45" />
              </button>
            </div>
            <div className="p-7 space-y-4">
              {/* Agencia */}
              <div>
                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-1">Agencia CAC</label>
                <select
                  value={editMeta.agency}
                  onChange={e => setEditMeta(m => ({ ...m, agency: e.target.value }))}
                  className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs text-[#181c3a] outline-none focus:border-[#2ec4f1] transition-all"
                >
                  <option value="">— Seleccionar Agencia —</option>
                  {CAC_AGENCIES.map(a => (
                    <option key={a.id} value={a.name}>{a.id} — {a.name}</option>
                  ))}
                </select>
              </div>
              {/* Tecnología */}
              <div>
                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-1">Tecnología</label>
                <select
                  value={editMeta.tech}
                  onChange={e => setEditMeta(m => ({ ...m, tech: e.target.value, brand: '', model: '' }))}
                  className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs text-[#181c3a] outline-none focus:border-[#2ec4f1] transition-all"
                >
                  <option value="">— Seleccionar Tecnología —</option>
                  {MASTER_TECNOLOGIAS.map(t => (
                    <option key={t.id} value={t.nombre}>{t.nombre}</option>
                  ))}
                </select>
              </div>
              {/* Marca */}
              <div>
                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-1">Marca</label>
                <select
                  value={editMeta.brand}
                  onChange={e => setEditMeta(m => ({ ...m, brand: e.target.value, model: '' }))}
                  className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs text-[#181c3a] outline-none focus:border-[#2ec4f1] transition-all"
                >
                  <option value="">— Seleccionar Marca —</option>
                  {MASTER_MARCAS.map(b => (
                    <option key={b.id} value={b.nombre}>{b.nombre}</option>
                  ))}
                </select>
              </div>
              {/* Modelo */}
              <div>
                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-1">Modelo</label>
                <select
                  value={editMeta.model}
                  onChange={e => setEditMeta(m => ({ ...m, model: e.target.value }))}
                  className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs text-[#181c3a] outline-none focus:border-[#2ec4f1] transition-all"
                >
                  <option value="">— Seleccionar Modelo —</option>
                  {MASTER_MODELOS
                    .filter(m => !editMeta.brand || MASTER_MARCAS.find(b => b.nombre === editMeta.brand)?.id === m.marcaId)
                    .map(m => (
                      <option key={m.id} value={m.nombre}>{m.nombre}</option>
                    ))}
                </select>
              </div>
            </div>
            <div className="px-7 pb-7 flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setEditMetaRec(null)} className="rounded-xl font-black uppercase text-[10px] tracking-widest px-6">Cancelar</Button>
              <Button
                onClick={handleSaveEditMeta}
                disabled={editMetaSaving}
                className="rounded-xl font-black uppercase text-[10px] tracking-widest px-8 bg-[#181c3a] text-white hover:bg-[#2ec4f1] hover:text-[#181c3a] transition-all"
              >
                {editMetaSaving ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* MODAL HISTORIAL DE SERIES */}
      {selectedHistoryReception && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#181c3a]/80 backdrop-blur-xl p-6">
          <Card className="w-full max-w-5xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border-none animate-rise-in p-0 flex flex-col max-h-[88vh]">
            {/* Header */}
            <div className="bg-[#181c3a] p-8 text-white flex justify-between items-start shrink-0">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40 mb-1">Detalle de Mercadería — Backoffice</p>
                <h3 className="text-2xl font-black uppercase tracking-tight">Guía {selectedHistoryReception.guide_number}</h3>
              </div>
              <button onClick={() => setSelectedHistoryReception(null)} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all mt-1">
                <Plus size={20} className="rotate-45" />
              </button>
            </div>

            {/* Info cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-6 bg-slate-50 border-b border-slate-100 shrink-0">
              {/* Agencia */}
              <div className="bg-white rounded-2xl p-4 border border-slate-100">
                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Agencia CAC</p>
                <p className="text-sm font-black text-[#181c3a] uppercase leading-tight">
                  {(() => {
                    const carrier = selectedHistoryReception.carrier || '';
                    const notesAgency = selectedHistoryReception.notes?.includes('Backoffice_Agency: ') 
                      ? selectedHistoryReception.notes.split('Backoffice_Agency: ')[1]?.split('\n')[0]?.trim() 
                      : '';
                    const matchedCarrier = CAC_AGENCIES.find(a =>
                      carrier.toUpperCase().includes(a.name.toUpperCase()) ||
                      carrier.toUpperCase() === a.id.toUpperCase() ||
                      carrier.toUpperCase().includes(a.id.toUpperCase())
                    );
                    return notesAgency || (matchedCarrier ? matchedCarrier.name : carrier) || '---';
                  })()}
                </p>
              </div>
              {/* Tecnología */}
              <div className="bg-white rounded-2xl p-4 border border-slate-100">
                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Tecnología</p>
                <p className="text-sm font-black text-[#181c3a] uppercase leading-tight">
                  {(() => {
                    const equipSeries = (historyModalSeries).filter((s: any) => s.brand_id);
                    const firstEquip = equipSeries[0];
                    const modelObj = firstEquip ? MASTER_MODELOS.find(m => m.id === firstEquip.model_id) : null;
                    const techFromSeries = modelObj ? (MASTER_TECNOLOGIAS.find(t => t.id === modelObj.tecnologiaId)?.nombre || '') : '';
                    const notesTech = selectedHistoryReception.notes?.includes('Backoffice_Tech: ') 
                      ? selectedHistoryReception.notes.split('Backoffice_Tech: ')[1]?.split('\n')[0]?.trim() 
                      : '';
                    return techFromSeries || notesTech || <span className="text-slate-300">—</span>;
                  })()}
                </p>
              </div>
              {/* Marca */}
              <div className="bg-white rounded-2xl p-4 border border-slate-100">
                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Marca</p>
                <p className="text-sm font-black text-[#181c3a] uppercase leading-tight">
                  {(() => {
                    const equipSeries = (historyModalSeries).filter((s: any) => s.brand_id);
                    const firstEquip = equipSeries[0];
                    const brandFromSeries = firstEquip ? (MASTER_MARCAS.find(b => b.id === firstEquip.brand_id)?.nombre || '') : '';
                    const notesBrand = selectedHistoryReception.notes?.includes('Backoffice_Brand: ') 
                      ? selectedHistoryReception.notes.split('Backoffice_Brand: ')[1]?.split('\n')[0]?.trim() 
                      : '';
                    return brandFromSeries || notesBrand || <span className="text-slate-300">—</span>;
                  })()}
                </p>
              </div>
              {/* Modelo */}
              <div className="bg-white rounded-2xl p-4 border border-slate-100">
                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Modelo</p>
                <p className="text-sm font-black text-[#181c3a] uppercase leading-tight">
                  {(() => {
                    const equipSeries = (historyModalSeries).filter((s: any) => s.brand_id);
                    const firstEquip = equipSeries[0];
                    const modelObj = firstEquip ? MASTER_MODELOS.find(m => m.id === firstEquip.model_id) : null;
                    const modelFromSeries = modelObj?.nombre || '';
                    const notesModel = selectedHistoryReception.notes?.includes('Backoffice_Model: ') 
                      ? selectedHistoryReception.notes.split('Backoffice_Model: ')[1]?.split('\n')[0]?.trim() 
                      : '';
                    return modelFromSeries || notesModel || <span className="text-slate-300">---</span>;
                  })()}
                </p>
              </div>
              {/* Piloto */}
              <div className="bg-white rounded-2xl p-4 border border-slate-100">
                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Piloto</p>
                <p className="text-sm font-black text-[#181c3a] uppercase leading-tight">
                  {selectedHistoryReception.notes?.split('Piloto: ')[1]?.split('\n')[0] || selectedHistoryReception.carrier || '---'}
                </p>
              </div>
            </div>
            {/* Second row: received by + status */}
            <div className="grid grid-cols-2 gap-4 px-6 pb-4 bg-slate-50 border-b border-slate-100 shrink-0">
              <div className="bg-white rounded-2xl p-4 border border-slate-100">
                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Recibido en Backoffice</p>
                <p className="text-sm font-black text-[#181c3a] uppercase leading-tight">{selectedHistoryReception.received_by || 'SISTEMA'}</p>
              </div>
              <div className="bg-white rounded-2xl p-4 border border-slate-100">
                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Estatus</p>
                <span className={`text-[9px] uppercase font-black tracking-widest ${selectedHistoryReception.status === 'EN_PROCESO_BACKOFFICE' ? 'text-[#181c3a]' : 'text-[#2ec4f1]'}`}>
                  {selectedHistoryReception.status}
                </span>
              </div>
            </div>

            {/* Series table */}
            <div className="p-6 overflow-y-auto flex-1">
              {(() => {
                const equipModalSeries = historyModalSeries.filter((s: any) => s.brand_id);
                const guideModalSeries = historyModalSeries.filter((s: any) => !s.brand_id);
                const hasEquip = equipModalSeries.length > 0;
                return (
                  <>
                    {/* Equipment series */}
                    {hasEquip && (
                      <div className="mb-4">
                        <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-2 px-1">Series de Equipo ({equipModalSeries.length})</p>
                        <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm bg-white">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-[#181c3a] text-white">
                                <th className="p-3 text-[8px] font-black uppercase tracking-widest">#</th>
                                <th className="p-3 text-[8px] font-black uppercase tracking-widest">No. de Serie</th>
                                <th className="p-3 text-[8px] font-black uppercase tracking-widest">Tecnología</th>
                                <th className="p-3 text-[8px] font-black uppercase tracking-widest">Marca</th>
                                <th className="p-3 text-[8px] font-black uppercase tracking-widest">Modelo</th>
                                <th className="p-3 text-[8px] font-black uppercase tracking-widest">No. Guía</th>
                                <th className="p-3 text-[8px] font-black uppercase tracking-widest text-right">Estado</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {equipModalSeries.map((s: any, idx: number) => {
                                const brand = MASTER_MARCAS.find(b => b.id === s.brand_id)?.nombre || s.brand_id || '---';
                                const modelObj = MASTER_MODELOS.find(m => m.id === s.model_id);
                                const model = modelObj?.nombre || s.model_id || '---';
                                const tech = modelObj ? (MASTER_TECNOLOGIAS.find(t => t.id === modelObj.tecnologiaId)?.nombre || '---') : '---';
                                return (
                                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-3 text-[9px] font-black text-slate-300">S-{idx + 1}</td>
                                    <td className="p-3 font-mono font-black text-[#181c3a] text-xs">{s.serial_number}</td>
                                    <td className="p-3 text-[10px] font-bold text-slate-500 uppercase">{tech}</td>
                                    <td className="p-3 text-[10px] font-bold text-slate-500 uppercase">{brand}</td>
                                    <td className="p-3 text-[10px] font-bold text-slate-500 uppercase">{model}</td>
                                    <td className="p-3 font-mono text-[10px] font-black text-[#181c3a]">{selectedHistoryReception.guide_number}</td>
                                    <td className="p-3 text-right">
                                      <Badge className="bg-emerald-100 text-emerald-600 border-none text-[8px] uppercase font-black px-2 py-0.5">Recibido</Badge>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Guide numbers */}
                    {guideModalSeries.length > 0 && (
                      <div>
                        <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-2 px-1">Guías / Cajas recibidas ({guideModalSeries.length})</p>
                        <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm bg-white">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-100 border-b border-slate-100">
                                <th className="p-3 text-[8px] font-black uppercase tracking-widest text-slate-400">#</th>
                                <th className="p-3 text-[8px] font-black uppercase tracking-widest text-slate-400">No. de Guía / Caja</th>
                                <th className="p-3 text-[8px] font-black uppercase tracking-widest text-slate-400 text-right">Estado</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {guideModalSeries.map((s: any, idx: number) => (
                                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                  <td className="p-3 text-[9px] font-black text-slate-300">{idx + 1}</td>
                                  <td className="p-3 font-mono font-black text-[#181c3a] text-xs">{s.serial_number}</td>
                                  <td className="p-3 text-right">
                                    <Badge className="bg-blue-100 text-blue-500 border-none text-[8px] uppercase font-black px-2 py-0.5">En Proceso</Badge>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {historyModalSeries.length === 0 && (
                      <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-white">
                        <Database className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No se han registrado series para este manifiesto aún</p>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            <div className="p-6 bg-white border-t border-slate-100 flex justify-between items-center shrink-0">
              <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">
                {historyModalSeries.filter((s: any) => s.brand_id).length} equipos - {historyModalSeries.filter((s: any) => !s.brand_id).length} guias
              </p>
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="rounded-xl font-black uppercase text-[10px] tracking-widest px-8 border-2 border-slate-100 text-slate-500 hover:bg-slate-50" 
                  onClick={() => handlePrintConduce(selectedHistoryReception)}
                  leftIcon={<Printer className="w-4 h-4" />}
                >
                  Imprimir PDF
                </Button>
                <Button variant="primary" className="rounded-xl font-black uppercase text-[10px] tracking-widest px-8 bg-[#181c3a] text-white" onClick={() => setSelectedHistoryReception(null)}>Cerrar</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* MODAL SELECCIÓN DE AGENCIA */}
      {showAgencyModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#181c3a]/80 backdrop-blur-xl p-6">
          <Card className="w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border-none animate-rise-in p-0">
            <div className="bg-[#181c3a] p-8 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight">Seleccionar Agencia CAC</h3>
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">Directorio Maestro de Tiendas</p>
              </div>
              <button onClick={() => setShowAgencyModal(false)} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all">
                <Plus size={20} className="rotate-45" />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="relative group">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-[#2ec4f1] transition-colors" />
                <input 
                  type="text" 
                  autoFocus
                  placeholder="BUSCAR POR NOMBRE O ID (EJ. G213)..."
                  className="w-full h-16 pl-16 pr-6 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs text-[#181c3a] outline-none focus:border-[#2ec4f1] focus:bg-white transition-all uppercase"
                  value={agencySearch}
                  onChange={(e) => setAgencySearch(e.target.value)}
                />
              </div>

              <div className="max-h-[400px] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                {filteredAgencies.map(ag => (
                  <button 
                    key={ag.id}
                    onClick={() => { setSelectedAgencyId(ag.id); setShowAgencyModal(false); }}
                    className={`w-full flex items-center justify-between p-5 rounded-2xl border-2 transition-all text-left ${selectedAgencyId === ag.id ? 'border-[#2ec4f1] bg-blue-50/50' : 'border-slate-50 hover:border-slate-200 bg-white shadow-sm hover:shadow-md'}`}
                  >
                    <div className="flex items-center gap-5">
                      <div className={`w-3 h-3 rounded-full ${selectedAgencyId === ag.id ? 'bg-[#2ec4f1] shadow-[0_0_10px_rgba(46,196,241,0.5)]' : 'bg-slate-200'}`} />
                      <div>
                        <p className="text-sm font-black text-[#181c3a] uppercase tracking-tight mb-1">{ag.name}</p>
                        <div className="flex items-center gap-2 text-slate-400">
                          <MapPin size={12} className="shrink-0 text-[#2ec4f1]" />
                          <p className="text-[10px] font-bold uppercase truncate max-w-[400px]">{ag.direccion}</p>
                        </div>
                      </div>
                    </div>
                    {selectedAgencyId === ag.id && (
                      <div className="w-8 h-8 rounded-full bg-[#2ec4f1]/10 flex items-center justify-center">
                        <CheckCircle2 className="text-[#2ec4f1] w-5 h-5" />
                      </div>
                    )}
                  </button>
                ))}
                {filteredAgencies.length === 0 && (
                  <div className="py-12 text-center text-slate-300 font-bold uppercase text-[10px] tracking-widest">
                    No se encontraron agencias
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
      {/* Modal Carga Masiva */}
      {showBulkModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#181c3a]/80 backdrop-blur-xl p-6">
          <Card className="max-w-xl w-full p-10 border-none shadow-2xl rounded-[3rem] animate-rise-in bg-white">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-xl font-black text-[#181c3a] uppercase tracking-tight">Carga Masiva de Series</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Pegue la lista de series a continuación</p>
              </div>
              <button onClick={() => setShowBulkModal(false)} className="text-slate-300 hover:text-[#181c3a]"><Plus size={24} className="rotate-45" /></button>
            </div>

            <div className="space-y-6">
              <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100 mb-6">
                  <p className="text-[10px] font-bold text-blue-600 uppercase leading-relaxed">
                    <span className="font-black mr-2">Regla actual:</span> 
                    Este equipo requiere <span className="font-black underline">{MASTER_MODELOS.find(m => m.id === guideItems[bulkTargetIdx!]?.modelo)?.nombre && MASTER_TECNOLOGIAS.find(t => t.id === guideItems[bulkTargetIdx!]?.tipo)?.seriesCount} series</span> por unidad. 
                    El sistema agrupara automaticamente cada bloque de series como una unidad completa.
                  </p>
              </div>

              <textarea 
                className="w-full h-64 bg-slate-50 border-2 border-slate-100 rounded-3xl p-6 font-mono text-xs font-bold outline-none focus:border-[#2ec4f1] transition-all"
                placeholder="SN1234567890&#10;MAC1234567890&#10;SN2234567890&#10;MAC2234567890..."
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
              />

              <div className="flex gap-4">
                <Button variant="outline" className="flex-1 h-14 rounded-2xl font-black uppercase text-[10px]" onClick={() => setShowBulkModal(false)}>Cancelar</Button>
                <Button variant="primary" className="flex-[2] h-14 rounded-2xl font-black uppercase text-[10px] bg-[#181c3a] text-white shadow-xl shadow-blue-500/10" onClick={handleBulkImport}>Procesar e Importar</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* CONTENIDO SUB-BODEGAS (ACCESORIOS / TELÉFONOS) */}
      {(activeTab === 'sub_accesorios' || activeTab === 'sub_telefonos') && (
        <div className="space-y-8 animate-rise-in">
          <div className="flex items-center justify-between px-2">
            <div>
              <h2 className="text-xl font-black text-[#181c3a] uppercase tracking-tight">
                {activeTab === 'sub_accesorios' ? 'Inventario de Accesorios' : 'Inventario de Teléfonos / Móviles'}
              </h2>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mt-2">
                Control de cajas enviadas a sub-bodega desde Backoffice
              </p>
            </div>
            <div className="flex gap-4 items-center">
              <div className="flex items-center gap-2 bg-white rounded-2xl border-2 border-slate-100 p-1">
                <input 
                  type="date" 
                  className="bg-transparent border-none text-[10px] font-black uppercase text-slate-500 outline-none px-2 h-10"
                  value={dateFilterFrom}
                  onChange={(e) => setDateFilterFrom(e.target.value)}
                  title="Fecha Inicial"
                />
                <span className="text-slate-300 font-bold">-</span>
                <input 
                  type="date" 
                  className="bg-transparent border-none text-[10px] font-black uppercase text-slate-500 outline-none px-2 h-10"
                  value={dateFilterTo}
                  onChange={(e) => setDateFilterTo(e.target.value)}
                  title="Fecha Final"
                />
                {(dateFilterFrom || dateFilterTo) && (
                  <button 
                    onClick={() => { setDateFilterFrom(''); setDateFilterTo(''); }}
                    className="w-6 h-6 flex items-center justify-center bg-rose-50 text-rose-500 rounded-full hover:bg-rose-100 mr-2"
                    title="Limpiar fechas"
                  >
                    <X size={12} strokeWidth={3} />
                  </button>
                )}
              </div>
              <Button 
                variant="outline" 
                className="rounded-2xl h-12 px-6 font-black text-[10px] uppercase tracking-widest border-2 border-slate-100 text-slate-400 hover:bg-slate-50 flex items-center gap-2"
                onClick={async () => {
                   await fetchHistory();
                   alert("Datos actualizados desde la base de datos");
                }}
              >
                <RefreshCw size={14} />
                Refrescar Datos
              </Button>
              <div className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest ${activeTab === 'sub_accesorios' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                {allReceptions.filter(r => {
                  if (r.status === 'ARCHIVADO') return false;
                  const n = (r.notes || '').toLowerCase();
                  const target = activeTab === 'sub_accesorios' ? 'accesorio' : 'teléfono';
                  const isCat = n.includes(target) && (n.includes('recibido') || n.includes('backoffice'));
                  if (!isCat) return false;
                  const d = new Date(r.created_at);
                  const from = dateFilterFrom ? new Date(dateFilterFrom) : null;
                  const to = dateFilterTo ? new Date(dateFilterTo) : null;
                  if (to) to.setHours(23, 59, 59);
                  if (from && d < from) return false;
                  if (to && d > to) return false;
                  return true;
                }).length} Cajas Registradas
              </div>
            </div>
          </div>

          <Card className="p-0 bg-white rounded-[2.5rem] shadow-2xl border-none overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className={activeTab === 'sub_accesorios' ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Fecha Ingreso</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">No. Guía / Caja</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Origen (Agencia)</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Notas de Transferencia</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-right">Estatus</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                    {allReceptions
                    .flatMap(r => {
                      if (r.status === 'ARCHIVADO') return [];
                      const notes = r.notes || '';
                      const d = new Date(r.created_at);
                      const from = dateFilterFrom ? new Date(dateFilterFrom) : null;
                      const to = dateFilterTo ? new Date(dateFilterTo) : null;
                      if (to) to.setHours(23, 59, 59);

                      if (from && d < from) return [];
                      if (to && d > to) return [];

                      const guides = r.processed_guides?.length > 0 ? r.processed_guides : [r.guide_number];
                      const rows = [];

                      for (const g of guides) {
                         // Leer categoría desde reception_guides (Fase 3) con fallback a notes
                         const guideRg = (r.reception_guides || []).find((rg: any) => rg.guide_number === g);
                         const rgCategory = (guideRg?.category || '').toLowerCase();
                         
                         // Fallback a notas solo si no hay registro en reception_guides
                         let isAccesorio = false;
                         let isTelefono = false;
                         
                         if (rgCategory) {
                           isAccesorio = rgCategory === 'accesorio';
                           isTelefono = rgCategory === 'telefono';
                         } else {
                           const notes = (r.notes || '').toLowerCase();
                           const gEscaped = g.replace(/[-]/g, '\\-');
                           const guideBlockRegex = new RegExp(`\\[Guía.*?(?:${gEscaped}).*?\\][\\s\\S]*?(?=\\[Guía|---|$)`, 'i');
                           const guideBlockMatch = notes.match(guideBlockRegex);
                           if (guideBlockMatch) {
                             const block = guideBlockMatch[0].toLowerCase();
                             isAccesorio = block.includes('backoffice_category: accesorio');
                             isTelefono = block.includes('backoffice_category: teléfono') || block.includes('backoffice_category: movil');
                           } else {
                             isAccesorio = notes.includes('backoffice_category: accesorio');
                             isTelefono = notes.includes('backoffice_category: teléfono') || notes.includes('backoffice_category: movil');
                           }
                         }

                         let match = false;
                         if (activeTab === 'sub_accesorios') match = isAccesorio;
                         if (activeTab === 'sub_telefonos') match = isTelefono;

                         if (match) {
                           const notes = (r.notes || '');
                           const gEscaped = g.replace(/[-]/g, '\\-');
                           const tlRegex = new RegExp(`\\[(.*?)\\].*?CLASIFICACIÓN.*?(?:${gEscaped}).*?- Por: (.*)`, 'i');
                           const tlMatch = notes.match(tlRegex);
                           const processDate = guideRg?.classified_at
                             ? new Date(guideRg.classified_at).toLocaleString()
                             : (tlMatch ? tlMatch[1] : new Date(r.created_at).toLocaleString());
                           const processUser = guideRg?.classified_by || (tlMatch ? tlMatch[2].trim() : (r.received_by || 'SISTEMA'));

                           rows.push({
                             id: r.id + '-' + g,
                             reception: r,
                             guide: g,
                             processDate,
                             processUser
                           });
                         }
                      }
                      return rows;
                    })
                    .map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-all group cursor-pointer" onClick={() => handleViewReception(item.reception)}>
                        <td className="px-8 py-6 text-xs font-bold text-slate-500">
                           {item.processDate}
                           <div className="text-[9px] text-slate-400 uppercase mt-1">Por: {item.processUser}</div>
                        </td>
                        <td className="px-8 py-6">
                          <span className="text-sm font-black text-[#181c3a] font-mono bg-slate-100 px-3 py-1.5 rounded-lg whitespace-pre-wrap">{item.guide}</span>
                        </td>
                        <td className="px-8 py-6 text-xs font-black text-[#181c3a] uppercase">{getAgenciaLabel(item.reception, CAC_AGENCIES, item.guide)}</td>
                        <td className="px-8 py-6">
                          <p className="text-xs font-bold text-slate-400 italic max-w-md">
                            {item.reception.notes?.split('Notas: ')[1] || 'Sin notas adicionales'}
                          </p>
                        </td>
                        <td className="px-8 py-6 text-right">
                          <Badge className={`border-none font-black text-[9px] uppercase tracking-widest px-4 py-1.5 rounded-full ${activeTab === 'sub_accesorios' ? 'bg-emerald-50 text-emerald-500' : 'bg-amber-50 text-amber-500'}`}>
                            {activeTab === 'sub_accesorios' ? 'BODEGA: ACCESORIOS' : 'BODEGA: MÓVILES'}
                          </Badge>
                        </td>
                        <td className="px-8 py-6 text-right">
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleViewReception(item.reception); }}
                              className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-400 rounded-lg transition-colors" title="Ver Detalles">
                              <Eye className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setActiveReception(item.reception); setProcessedGuides(item.reception.processed_guides || []); setReceptionStep('classification'); setActiveTab('op'); }}
                              className="p-2 bg-emerald-50 hover:bg-emerald-500 text-emerald-500 hover:text-white rounded-lg transition-colors" title="Abrir en Bandeja (Reclasificar)">
                              <Box className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm(`¿Está seguro de OCULTAR/ARCHIVAR la caja ${item.guide} y todo su contenido heredado?`)) return;
                                try {
                                  const supabase = getSupabaseBrowserClient();
                                  const { error } = await supabase.from('receptions').update({ status: 'ARCHIVADO' }).eq('id', item.reception.id);
                                  if (error) throw error;
                                  await supabase.from('series').update({ current_status: 'archivado' }).eq('current_reception_id', item.reception.id);
                                  setAllReceptions(prev => prev.map(r => r.id === item.reception.id ? { ...r, status: 'ARCHIVADO' } : r));
                                  alert('La caja y sus equipos han sido archivados correctamente.');
                                } catch (err: any) {
                                  alert('Error al archivar: ' + err.message);
                                }
                              }}
                              className="p-2 bg-rose-50 hover:bg-rose-500 text-rose-500 hover:text-white rounded-lg transition-colors" title="Eliminar / Archivar Caja">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  {allReceptions.filter(r => {
                    if (r.status === 'ARCHIVADO') return false;
                    // Leer categoría desde reception_guides (Fase 3) con fallback a notes
                    const guideCategories: string[] = (r.reception_guides || []).map((rg: any) => (rg.category || '').toLowerCase());
                    const notes = (r.notes || '').toLowerCase();

                    if (activeTab === 'sub_accesorios') {
                      if (guideCategories.length > 0) return guideCategories.some((c: string) => c === 'accesorio');
                      return notes.includes('backoffice_category: accesorio') || notes.includes('accesorio');
                    }
                    if (activeTab === 'sub_telefonos') {
                      if (guideCategories.length > 0) return guideCategories.some((c: string) => c === 'telefono');
                      return notes.includes('backoffice_category: teléfono') || notes.includes('backoffice_category: movil') || notes.includes('teléfono') || notes.includes('movil');
                    }
                    return false;
                  }).length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-20 text-center">
                        <Package className="w-12 h-12 text-slate-100 mx-auto mb-4" />
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">No hay cajas registradas en esta sub-bodega</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}


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
                   <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-widest font-mono">{showTimeline.guide_number}</p>
                 </div>
               </div>
               <button onClick={() => { setShowTimeline(null); setTimelineActiveGuide(null); }} className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 hover:text-rose-500 transition-all border border-slate-100"><X size={20} /></button>
            </div>
            <div className="p-10 max-h-[60vh] overflow-y-auto custom-scrollbar bg-white">
               {showTimeline.processed_guides && showTimeline.processed_guides.length > 1 && (
                 <div className="flex flex-wrap gap-2 mb-8">
                   <button 
                     onClick={() => setTimelineActiveGuide(null)}
                     className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!timelineActiveGuide ? 'bg-[#181c3a] text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                   >
                     Toda la Recepción
                   </button>
                   {Array.from(new Set(showTimeline.processed_guides)).map((g: any) => (
                     <button 
                       key={g}
                       onClick={() => setTimelineActiveGuide(g)}
                       className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${timelineActiveGuide === g ? 'bg-[#2ec4f1] text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                     >
                       Guía {g}
                     </button>
                   ))}
                 </div>
               )}
               <div className="relative border-l-2 border-slate-100 ml-4 space-y-10">
                  {(() => {
                    const notes = showTimeline.notes || '';
                    let timelinePart = '';
                    if (notes.includes('--- LÍNEA DE TIEMPO (MATRIZ) ---')) {
                      timelinePart = notes.split('--- LÍNEA DE TIEMPO (MATRIZ) ---').pop() || '';
                    } else if (notes.includes('--- LÍNEA DE TIEMPO ---')) {
                      timelinePart = notes.split('--- LÍNEA DE TIEMPO ---').pop() || '';
                    }
                    const events = timelinePart.trim().split('\n').filter((l: string) => l.trim() !== '');

                    let filteredEvents = events;
                    if (timelineActiveGuide) {
                       filteredEvents = events.filter((event: string) => {
                          if (!event.includes('(Guía ')) return true;
                          return event.includes(timelineActiveGuide);
                       });
                    }

                    if (filteredEvents.length === 0) {
                      return (
                        <div className="text-center py-20 opacity-20">
                          <Clock size={48} className="mx-auto mb-4" />
                          <p className="text-xs font-black uppercase tracking-widest">Sin eventos registrados</p>
                        </div>
                      );
                    }

                    let lastKnownTime = '';
                    return filteredEvents.map((event: string, idx: number) => {
                      let cleanTime = '';
                      let content = '';

                      if (event.includes('] ')) {
                        const [timeStr, ...rest] = event.split('] ');
                        cleanTime = (timeStr || '').replace('[', '');
                        lastKnownTime = cleanTime;
                        content = rest.join('] ');
                      } else {
                        // Skip corrupted lines that are not valid multi-line event continuations
                        if (event.includes('---') || event.toUpperCase().includes('BACKOFFICE_') || event.toUpperCase().includes('GUÍAS PROCESADAS')) {
                           return null;
                        }
                        content = event;
                        cleanTime = lastKnownTime;
                      }
                      
                      // PARSE MATRIZ: ID | CODE | ACTION: DETAIL
                      const pipeParts = content.split(' | ');
                      let meta = '';
                      let body = content;
                      if (pipeParts.length > 2) {
                        meta = pipeParts[0] + ' | ' + pipeParts[1];
                        body = pipeParts.slice(2).join(' | ');
                      } else if (pipeParts.length === 2) {
                        meta = pipeParts[0];
                        body = pipeParts[1];
                      }
                      
                      let action = '';
                      let detail = '';
                      
                      if (body) {
                         const parts = body.split(': ');
                         if (parts.length > 1) {
                            action = parts[0];
                            detail = parts.slice(1).join(': ');
                         } else {
                            action = 'METADATO / EVENTO';
                            detail = body;
                         }
                       } else if (content) {
                         const parts = content.split(': ');
                         if (parts.length > 1) {
                            action = parts[0];
                            detail = parts.slice(1).join(': ');
                         } else {
                            action = 'METADATO / EVENTO';
                            detail = content;
                         }
                      }

                      if (action.toUpperCase() === 'STATUS' && detail.toUpperCase() === 'RECIBIDO_BACKOFFICE') {
                         const agenciaNombre = getAgenciaLabel(showTimeline, CAC_AGENCIES);
                         if (agenciaNombre && agenciaNombre !== '---') {
                            detail = `${detail} - EN CAC / AGENCIA: ${agenciaNombre}`;
                         }
                      }

                      return (
                        <div key={idx} className="relative pl-10 group">
                          <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white border-2 border-[#2ec4f1] group-hover:scale-125 transition-transform shadow-sm" />
                          <div className="flex justify-between items-start mb-1">
                            {cleanTime && <p className="text-[9px] font-black text-[#2ec4f1] uppercase tracking-widest">{cleanTime}</p>}
                            {meta && (
                              <Badge className="bg-slate-100 text-slate-400 border-none text-[7px] font-black tracking-tighter px-1.5 h-4">
                                {meta.replace(' | ', ' • ')}
                              </Badge>
                            )}
                          </div>
                          <h4 className="text-sm font-black text-[#181c3a] uppercase mb-1 tracking-tight">{action}</h4>
                          <p className="text-[11px] font-bold text-slate-500 leading-relaxed uppercase">{detail}</p>
                        </div>
                      );
                    });
                  })()}
               </div>
            </div>
            <div className="p-8 bg-slate-50 text-center border-t border-slate-100">
               <Badge className="bg-[#181c3a] text-white px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] border-none shadow-xl">
                 Estatus Actual: {showTimeline.status}
               </Badge>
            </div>
          </Card>
        </div>
      )}
        
        {/* Modal Detalle de Recepción */}
        {selectedReception && (
          <div className="fixed inset-0 z-50 flex items-center justify-end bg-[#181c3a]/40 backdrop-blur-sm">
            <div className="w-[95vw] max-w-none h-full bg-white shadow-2xl animate-slide-in-right flex flex-col">
              <div className="bg-[#181c3a] p-8 text-white relative overflow-hidden shrink-0">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                  <Package className="w-40 h-40" />
                </div>
                
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="blue" className="bg-[#2ec4f1] text-[#181c3a]">NO. GUÍA / CAJA: {selectedReception.guide_number}</Badge>
                      </div>
                      <h3 className="text-3xl font-black uppercase">
                        {getAgenciaLabel(selectedReception, CAC_AGENCIES)}
                      </h3>
                      <div className="flex items-center gap-4 mt-2 text-white/60">
                        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest">
                          <Clock className="w-3 h-3 text-[#2ec4f1]" /> {new Date(selectedReception.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => setSelectedReception(null)} className="p-2 hover:bg-white/10 rounded-xl transition-all"><X className="w-6 h-6" /></button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-slate-50 p-8">
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    Contenido de la Recepción <span className="w-1.5 h-1.5 rounded-full bg-slate-300" /> {isLoadingSeries ? 'Cargando...' : `${selectedReceptionSeries.length} Unidades`}
                  </h4>
                  
                  <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
                    <table className="w-full text-left whitespace-nowrap">
                      <thead>
                        <tr className="bg-[#181c3a] text-white">
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Fecha / Hora</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">No. Guía</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Tecnología</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Marca</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Modelo</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">S-1</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">S-2</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">S-3</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">S-4</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Material</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Lote</th>
                          <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest">Estatus</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {isLoadingSeries ? (
                          <tr>
                            <td colSpan={12} className="px-4 py-8 text-center text-slate-400 text-xs font-bold">
                              Cargando series...
                            </td>
                          </tr>
                        ) : selectedReceptionSeries.length > 0 ? selectedReceptionSeries.map((item: any, i: number) => (
                          <tr key={i} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-4 py-3 text-[10px] font-bold text-slate-700">{new Date(item.created_at || new Date()).toLocaleString()}</td>
                            <td className="px-4 py-3 text-[10px] font-bold text-[#181c3a] font-mono">{selectedReception.guide_number}</td>
                            <td className="px-4 py-3 text-[10px] font-black text-[#2ec4f1] uppercase">{item.tecnologia || '---'}</td>
                            <td className="px-4 py-3 text-[10px] font-bold text-slate-700">{item.marca || '---'}</td>
                            <td className="px-4 py-3 text-[10px] font-bold text-slate-700">{item.modelo || '---'}</td>
                            <td className="px-4 py-3">
                              {item.s1 ? <span className="inline-block px-2 py-1 bg-slate-50 text-[10px] font-mono font-bold text-[#181c3a] rounded-md">{item.s1}</span> : <span className="text-slate-300">---</span>}
                            </td>
                            <td className="px-4 py-3">
                              {item.s2 ? <span className="inline-block px-2 py-1 bg-slate-50 text-[10px] font-mono font-bold text-[#181c3a] rounded-md">{item.s2}</span> : <span className="text-slate-300">---</span>}
                            </td>
                            <td className="px-4 py-3">
                              {item.s3 ? <span className="inline-block px-2 py-1 bg-slate-50 text-[10px] font-mono font-bold text-[#181c3a] rounded-md">{item.s3}</span> : <span className="text-slate-300">---</span>}
                            </td>
                            <td className="px-4 py-3">
                              {item.s4 ? <span className="inline-block px-2 py-1 bg-slate-50 text-[10px] font-mono font-bold text-[#181c3a] rounded-md">{item.s4}</span> : <span className="text-slate-300">---</span>}
                            </td>
                            <td className="px-4 py-3 text-[10px] font-bold text-slate-700">{item.material || '---'}</td>
                            <td className="px-4 py-3 text-[10px] font-bold text-slate-700">{item.lote || '---'}</td>
                            <td className="px-4 py-3">
                              <Badge className="bg-emerald-50 text-emerald-500 border-none font-black tracking-widest text-[9px] uppercase px-3 py-1">COMPLETADO</Badge>
                            </td>
                          </tr>
                        )) : (
                          <tr>
                            <td colSpan={12} className="px-4 py-8 text-center text-slate-400 text-xs font-bold">
                              No hay series registradas en esta caja.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL TRASLADO MASIVO A TALLER */}
      {showMassTransferModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#181c3a]/80 backdrop-blur-xl p-6">
          <Card className="w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border-none animate-rise-in p-0">
            <div className="bg-amber-500 p-7 text-white flex justify-between items-center">
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-white/60 mb-1">Diagnóstico</p>
                <h3 className="text-lg font-black uppercase tracking-tight">Traslado Masivo a Taller</h3>
              </div>
              <button onClick={() => setShowMassTransferModal(false)} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-all">
                <Plus size={18} className="rotate-45" />
              </button>
            </div>
            <div className="p-7 space-y-5">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Tecnología</label>
                <select
                  className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs text-[#181c3a] outline-none focus:border-amber-500 transition-all"
                  value={massTransferData.techId}
                  onChange={(e) => setMassTransferData(prev => ({ ...prev, techId: e.target.value, modelId: '' }))}
                >
                  <option value="">-- SELECCIONAR --</option>
                  {MASTER_TECNOLOGIAS.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Marca</label>
                <select
                  className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs text-[#181c3a] outline-none focus:border-amber-500 transition-all"
                  value={massTransferData.brandId}
                  onChange={(e) => setMassTransferData(prev => ({ ...prev, brandId: e.target.value, modelId: '' }))}
                >
                  <option value="">-- SELECCIONAR --</option>
                  {availableBrandsMassTransfer.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Modelo</label>
                <select
                  className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs text-[#181c3a] outline-none focus:border-amber-500 transition-all"
                  value={massTransferData.modelId}
                  onChange={(e) => setMassTransferData(prev => ({ ...prev, modelId: e.target.value }))}
                >
                  <option value="">-- SELECCIONAR --</option>
                  {MASTER_MODELOS
                    .filter(m => (!massTransferData.techId || m.tecnologiaId === massTransferData.techId) && (!massTransferData.brandId || m.marcaId === massTransferData.brandId))
                    .map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Cantidad a Trasladar</label>
                <input
                  type="number"
                  className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs text-[#181c3a] outline-none focus:border-amber-500 transition-all"
                  placeholder="Ej. 10"
                  value={massTransferData.quantity}
                  onChange={(e) => setMassTransferData(prev => ({ ...prev, quantity: e.target.value ? Number(e.target.value) : '' }))}
                />
              </div>
            </div>
            <div className="p-7 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <Button variant="outline" className="h-12 px-6 rounded-2xl text-xs font-black uppercase text-slate-400 hover:text-[#181c3a]" onClick={() => setShowMassTransferModal(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handlePrepareMassTransfer}
                className="h-12 px-8 rounded-2xl text-xs font-black uppercase bg-amber-500 text-white hover:bg-amber-600 shadow-xl shadow-amber-500/20"
              >
                Escanear Equipos
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* MODAL ESCANEO TRASLADO */}
      {isScanningForTransfer && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#181c3a]/80 backdrop-blur-xl p-6">
          <Card className="w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border-none animate-rise-in p-0">
            <div className="bg-amber-500 p-7 text-white flex justify-between items-center">
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-white/60 mb-1">Traslado a Taller</p>
                <h3 className="text-lg font-black uppercase tracking-tight">Escanear Series</h3>
              </div>
              <button onClick={() => setIsScanningForTransfer(false)} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-all">
                <Plus size={18} className="rotate-45" />
              </button>
            </div>
            
            <div className="p-7 space-y-6">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Progreso</p>
                  <p className="text-2xl font-black text-[#181c3a]">{scannedTransferSeries.length} <span className="text-sm text-slate-400">/ {massTransferData.quantity}</span></p>
                </div>
                <div className="w-full max-w-[200px] h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-amber-500 transition-all duration-300"
                    style={{ width: `${(scannedTransferSeries.length / Number(massTransferData.quantity)) * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-[#181c3a] block mb-2">Ingresar Serie (S/N)</label>
                <div className="relative">
                  <input
                    type="text"
                    autoFocus
                    disabled={scannedTransferSeries.length >= Number(massTransferData.quantity)}
                    placeholder={scannedTransferSeries.length >= Number(massTransferData.quantity) ? "Completado" : "Pistolea el código de barras..."}
                    value={currentScanInput}
                    onChange={e => setCurrentScanInput(e.target.value)}
                    onKeyDown={handleScanTransferSeries}
                    className="w-full h-14 pl-12 pr-4 bg-slate-50 border-2 border-slate-200 focus:border-amber-500 outline-none rounded-2xl font-mono text-sm text-[#181c3a] transition-all"
                  />
                  <Barcode className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                </div>
              </div>

              {scannedTransferSeries.length > 0 && (
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 max-h-[150px] overflow-y-auto">
                  <div className="flex flex-wrap gap-2">
                    {scannedTransferSeries.map((sn, i) => (
                      <span key={i} className="inline-block px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-mono font-bold text-[#181c3a]">
                        {sn}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-7 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <Button variant="outline" className="h-12 px-6 rounded-2xl text-xs font-black uppercase text-slate-400 hover:text-[#181c3a]" onClick={() => setIsScanningForTransfer(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmMassTransfer}
                disabled={scannedTransferSeries.length !== Number(massTransferData.quantity) || massTransferLoading}
                className={`h-12 px-8 rounded-2xl text-xs font-black uppercase shadow-xl ${
                  scannedTransferSeries.length === Number(massTransferData.quantity) 
                  ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-amber-500/20' 
                  : 'bg-slate-200 text-slate-400 shadow-none'
                }`}
              >
                {massTransferLoading ? "Procesando..." : "Confirmar Traslado"}
              </Button>
            </div>
          </Card>
        </div>
      )}

    </ModulePage>
  );
}
