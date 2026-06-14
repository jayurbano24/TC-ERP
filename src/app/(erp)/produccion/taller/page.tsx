"use client";

import React, { useState } from 'react';
import { ModulePage } from "@/components/module-page";
import { Card, Button, Badge } from "@/components/ui";
import { Wrench, Stethoscope, Search, Filter, Box, Plus, Activity, AlertCircle, ArrowRight, CheckCircle2, XCircle, Clock, ChevronLeft, ChevronRight, ChevronDown, User, CheckSquare, ServerCrash, RefreshCw, Zap, Trash2, Loader2, RotateCcw, History, ClipboardList, Package, Send, ScanLine, X, BarChart3, Layers, Edit2, Eye, Printer } from 'lucide-react';
import { getWorkshopTasks, saveDiagnostic } from '@/lib/database/workshop';
import { getTechnologies, getBrands, getModels, getDiagnostics, getRepairs, getReacondicionadoTests } from '@/lib/database/config';
import { getSeriesHistory } from '@/lib/database/audit';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { useEffect } from 'react';

type TabType = 'diagnostico' | 'reparacion' | 'reacondicionado' | 'qc' | 'l3' | 'scraps' | 'listo' | 'despacho';

export default function TallerPage() {
  const [activeTab, setActiveTab] = useState<TabType>('diagnostico');
  const [selectedForOperation, setSelectedForOperation] = useState<any | null>(null);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  // Selection State
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  // Search State
  const [searchTerm, setSearchTerm] = useState('');

  // CQRS Dashboard State (Strangler Fig)
  const [dashboardKpis, setDashboardKpis] = useState<any>(null);
  const [useNewDashboard, setUseNewDashboard] = useState(false);

  // Diagnostic Modal State
  const [isFunctionalChecklistOpen, setIsFunctionalChecklistOpen] = useState(false);
  const [isEvalResultOpen, setIsEvalResultOpen] = useState(false);
  const [isCosmeticOpen, setIsCosmeticOpen] = useState(false);
  const [isLabelOpen, setIsLabelOpen] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<string | null>(null);
  const [diagnosticNotes, setDiagnosticNotes] = useState<string>('');
  const [functionalChecks, setFunctionalChecks] = useState<Record<string, 'OPERATIVO' | 'NO_OPERATIVO'>>({});
  const [cosmeticClass, setCosmeticClass] = useState<string | null>(null);
  const [labelStatus, setLabelStatus] = useState<string | null>(null);
  const [historyModalOpen, setHistoryModalOpen] = useState<{isOpen: boolean, item: any}>({isOpen: false, item: null});
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedDiagnostics, setSelectedDiagnostics] = useState<string[]>([]);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [lockedCosmetic, setLockedCosmetic] = useState<string | null>(null);
  const [lockedDiagnostics, setLockedDiagnostics] = useState<string[]>([]);
  const [lockedRepairs, setLockedRepairs] = useState<string[]>([]);
  const [lockedDiagProfile, setLockedDiagProfile] = useState<string | null>(null);
  const [lockedRepProfile, setLockedRepProfile] = useState<string | null>(null);
  const [returnModalOpen, setReturnModalOpen] = useState<{isOpen: boolean, item: any | null}>({isOpen: false, item: null});
  const [returnTargetStage, setReturnTargetStage] = useState<string>('in_workshop');

  // SCRAP Dispatch Modal State
  const [scrapDispatchModal, setScrapDispatchModal] = useState<{isOpen: boolean, item: any | null}>({isOpen: false, item: null});
  const [scrapGuideNumber, setScrapGuideNumber] = useState('');
  const [scrapNotes, setScrapNotes] = useState('');
  const [scrapDispatching, setScrapDispatching] = useState(false);

  // Genera un número de conduce único: CS-SCRAP-YYYY-NNN
  const generateConduceNumber = () => {
    const now = new Date();
    const year = now.getFullYear();
    const seq = String(Math.floor(Math.random() * 900) + 100); // 100-999
    const ts  = String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0');
    return `CS-SCRAP-${year}-${ts}${seq.slice(-1)}`;
  };
  // Pistolero (scanner)
  const [scrapScanInput, setScrapScanInput] = useState('');
  const [scrapScanSN, setScrapScanSN] = useState('');
  const [scrapScanCasId, setScrapScanCasId] = useState('');
  const [scrapScannedItems, setScrapScannedItems] = useState<any[]>([]);
  const [scrapScanError, setScrapScanError] = useState('');
  const [scrapActiveView, setScrapActiveView] = useState<'resumen' | 'pistolero'>('resumen');
  // Caja creation step
  const [scrapBoxStep, setScrapBoxStep] = useState<'crear_caja' | 'despacho'>('crear_caja');
  const [scrapBoxMarca, setScrapBoxMarca] = useState('');
  const [scrapBoxModelo, setScrapBoxModelo] = useState('');
  const [scrapBoxTecnologia, setScrapBoxTecnologia] = useState('');
  const [scrapBoxCantidad, setScrapBoxCantidad] = useState<number | ''>('');

  // ── Despacho Taller ──────────────────────────────────────────────────────
  type DespachoMovement = {
    id: string;
    origen: string;
    destino: string;
    tecnologia: string;
    marca: string;
    modelo: string;
    cantidadEsperada: number;
    conduce: string;
    createdAt: Date;
  };
  type DespFase = 'dashboard' | 'pistolero';
  const DESP_ORIGENES = [
    { id: 'diagnostico', label: 'Diagnóstico',       etapa: 'PARA DIAGNOSTICAR', color: 'amber',   icon: Stethoscope },
    { id: 'reparacion',  label: 'Reparación',         etapa: 'REPARACION',        color: 'blue',    icon: Wrench      },
    { id: 'reacond',     label: 'Reacondicionado',    etapa: 'REACONDICIONADO',   color: 'emerald', icon: RefreshCw   },
    { id: 'qc',          label: 'Control de Calidad', etapa: 'CONTROL DE CALIDAD',color: 'purple',  icon: CheckSquare },
    { id: 'l3',          label: 'L3 Avanzado',        etapa: 'L3',                color: 'orange',  icon: Zap         },
    { id: 'scraps',      label: 'Scraps',             etapa: 'SCRAPS',            color: 'rose',    icon: Trash2      },
  ] as const;
  const DESP_DESTINOS = [
    { id: 'bodega',  label: 'Bodega Central', status: 'in_central_warehouse', color: 'teal',   icon: Package },
    { id: 'salida',  label: 'Salida',         status: 'dispatched',           color: 'indigo', icon: Send    },
  ] as const;
  const [despFase, setDespFase] = useState<DespFase>('dashboard');
  const [despActiveMovements, setDespActiveMovements] = useState<DespachoMovement[]>([]);
  const [despOrigen, setDespOrigen] = useState<string | null>(null);
  const [despDestino, setDespDestino] = useState<string | null>(null);
  const [despScanSN, setDespScanSN] = useState('');
  const [despScannedItems, setDespScannedItems] = useState<any[]>([]);
  const [despScanError, setDespScanError] = useState('');
  const [despGuideNumber, setDespGuideNumber] = useState('');
  const [despNotes, setDespNotes] = useState('');
  const [despDispatching, setDespDispatching] = useState(false);
  
  // Despacho Box Modal
  const [despBoxModalOpen, setDespBoxModalOpen] = useState(false);
  const [despBoxTecnologia, setDespBoxTecnologia] = useState('');
  const [despBoxMarca, setDespBoxMarca] = useState('');
  const [despBoxModelo, setDespBoxModelo] = useState('');
  const [despBoxCantidad, setDespBoxCantidad] = useState<number | ''>('');
  const [despEditingMovementId, setDespEditingMovementId] = useState<string | null>(null);
  const [despBoxNumber, setDespBoxNumber] = useState('');

  const generateDespConduce = (origenId: string, destinoId: string) => {
    const now = new Date();
    const yr = now.getFullYear();
    const hhmm = String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0');
    const orig = origenId.toUpperCase().slice(0,4);
    const dest = destinoId.toUpperCase().slice(0,4);
    return `CD-${orig}-${dest}-${yr}-${hhmm}`;
  };

  const despResetPistolero = () => {
    setDespOrigen(null);
    setDespDestino(null);
    setDespScanSN('');
    setDespScannedItems([]);
    setDespScanError('');
    setDespGuideNumber('');
    setDespNotes('');
    setDespBoxNumber('');
  };
  // ─────────────────────────────────────────────────────────────────────────

  // QC specific state
  const [qcEtiqueta, setQcEtiqueta] = useState<string | null>(null);
  const [qcSello, setQcSello] = useState<string | null>(null);
  const [qcChecklist, setQcChecklist] = useState<string | null>(null);
  const [qcLegible, setQcLegible] = useState<string | null>(null);

  // Reacondicionado specific state
  const [reacondTests, setReacondTests] = useState<string[]>([]);

  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showItemDetail, setShowItemDetail] = useState<any | null>(null);

  const [catMarcas, setCatMarcas] = useState<any[]>([]);
  const [catModelos, setCatModelos] = useState<any[]>([]);
  const [catTecnologias, setCatTecnologias] = useState<any[]>([]);
  const [catDiagnosticos, setCatDiagnosticos] = useState<any[]>([]);
  const [catReparaciones, setCatReparaciones] = useState<any[]>([]);
  const [catReacondicionadoTests, setCatReacondicionadoTests] = useState<any[]>([]);

  useEffect(() => {
    loadCatalogs();
    checkFeatureFlag();
  }, []);

  const checkFeatureFlag = async () => {
    try {
      const res = await fetch('/api/produccion/dashboard');
      if (res.ok) {
        const data = await res.json();
        setUseNewDashboard(true);
        setDashboardKpis(data.data.kpis);
      }
    } catch (e) {
      console.error('Feature Flag CQRS Dashboard no activo');
    }
  };

  const loadCatalogs = async () => {
    const [techs, brands, models, diag, reps, rTests] = await Promise.all([
      getTechnologies(), getBrands(), getModels(), getDiagnostics(), getRepairs(), getReacondicionadoTests()
    ]);
    setCatTecnologias(techs);
    setCatMarcas(brands);
    setCatModelos(models);
    setCatDiagnosticos(diag);
    setCatReparaciones(reps.map((r: any) => ({ id: r.id, nombre: r.name })));
    setCatReacondicionadoTests(rTests);
  };

  useEffect(() => {
    if (catMarcas.length > 0) {
      fetchTasks();
    }
  }, [activeTab, catMarcas]);

  useEffect(() => {
    const fetchHistory = async () => {
      if (historyModalOpen.isOpen && historyModalOpen.item) {
        setLoadingHistory(true);
        const data = await getSeriesHistory(historyModalOpen.item.dbId);
        setHistoryItems(data || []);
        setLoadingHistory(false);
      } else {
        setHistoryItems([]);
      }
    };
    fetchHistory();
  }, [historyModalOpen]);

  useEffect(() => {
    if (selectedForOperation && activeTab !== 'diagnostico') {
      const fetchHistoryForLockedCosmetic = async () => {
         const dbId = selectedForOperation.all_dbIds ? selectedForOperation.all_dbIds[0] : selectedForOperation.dbId;
         const data = await getSeriesHistory(dbId);
         
         const diagLog = data.find((l: any) => l.action === 'DIAGNÓSTICO INICIAL COMPLETADO');
         if (diagLog) {
            if (diagLog.profiles?.full_name) {
              setLockedDiagProfile(diagLog.profiles.full_name);
            }
            if (diagLog.payload) {
              if (diagLog.payload.notes) {
                const match = diagLog.payload.notes.match(/Clasificación Cosmética: (A|B|C|D)/);
                if (match) setLockedCosmetic(match[1]);
              }
              if (diagLog.payload.diagnostics) {
                setLockedDiagnostics(diagLog.payload.diagnostics);
              } else if (diagLog.payload.items) {
                setLockedDiagnostics(diagLog.payload.items);
              }
            }
         }

         const repLog = data.find((l: any) => l.action === 'REPARACIÓN COMPLETADA');
         if (repLog) {
            if (repLog.profiles?.full_name) {
              setLockedRepProfile(repLog.profiles.full_name);
            }
            if (repLog.payload) {
              if (repLog.payload.repairs) {
                setLockedRepairs(repLog.payload.repairs);
              } else if (repLog.payload.items) {
                setLockedRepairs(repLog.payload.items);
              }
            }
         }
      };
      fetchHistoryForLockedCosmetic();
    } else {
      setLockedCosmetic(null);
      setLockedDiagnostics([]);
      setLockedRepairs([]);
      setLockedDiagProfile(null);
      setLockedRepProfile(null);
    }
  }, [selectedForOperation, activeTab]);

  const fetchTasks = async () => {
    setLoading(true);
    const data = await getWorkshopTasks();
    
    // Agrupar por Orden de Servicio y Caja para mostrar 1 sola fila por equipo
    const groupedMap = new Map();
    data.forEach((t: any) => {
      const groupKey = `${t.service_orders?.os_label || 'S/OS'}-${t.boxes?.box_code || 'S/C'}`;
      if (!groupedMap.has(groupKey)) {
        groupedMap.set(groupKey, { ...t, all_dbIds: [t.id], all_sns: [t.serial_number] });
      } else {
        const existing = groupedMap.get(groupKey);
        if (!existing.all_dbIds.includes(t.id)) existing.all_dbIds.push(t.id);
        if (t.serial_number && !existing.all_sns.includes(t.serial_number)) existing.all_sns.push(t.serial_number);
      }
    });
    
    const groupedData = Array.from(groupedMap.values());

    const adapted = groupedData.map((t: any) => {
      const notes = t.receptions?.notes || '';
      
      let techId = t.technology_id || '';
      let brandId = t.brand_id || '';
      let modelId = t.model_id || '';
      let courierStr = t.receptions?.carrier || 'Desconocido';
      let sourceStr = t.receptions?.source?.toUpperCase() || 'CAC';
      let agenciaStr = 'N/A';

      if (notes) {
         try {
           const parsed = JSON.parse(notes);
           if (parsed.courier && courierStr === 'Desconocido') courierStr = parsed.courier;
           if (parsed.agencia) agenciaStr = parsed.agencia;
         } catch(e) {}

         const tMatch = notes.match(/Backoffice_Tech:\s*([^\s]+)/);
         if (tMatch && !techId) techId = tMatch[1];
         
         const bMatch = notes.match(/Backoffice_Brand:\s*([^\s]+)/);
         if (bMatch && !brandId) brandId = bMatch[1];
         
         const mMatch = notes.match(/Backoffice_Model:\s*([^\s]+)/);
         if (mMatch && !modelId) modelId = mMatch[1];
      }

      const tecnologiaName = catTecnologias.find(tech => tech.id === techId)?.name || techId || 'EQUIPO';
      const marcaName = catMarcas.find(b => b.id === brandId)?.name || brandId || 'Desconocida';
      const modeloName = catModelos.find(m => m.id === modelId)?.name || modelId || 'S/N';

        const stageRaw = t.current_status === 'in_workshop' ? 'PARA DIAGNOSTICAR' 
          : t.current_status === 'in_qc' ? 'REPARACION'
          : t.current_status === 'in_validation' ? 'CONTROL DE CALIDAD'
          : t.current_status === 'in_control_warehouse' ? 'L3'
          : t.current_status === 'ready_to_dispatch' ? 'REACONDICIONADO'
          : t.current_status === 'irreparable' || t.current_status === 'scrapped' ? 'SCRAPS'
          : t.current_status === 'in_central_warehouse' ? 'EQUIPO LISTO'
          : t.current_status.toUpperCase();
        let responsableName = 'ADMIN USER';
        if (notes) {
          const respMatch = notes.match(/Por:\s*([^\n]+)/i);
          if (respMatch) responsableName = respMatch[1].trim().toUpperCase();
        }

        return {
          id: t.service_orders?.os_label || `S/OS`,
          sn: t.all_sns[0] || 'S/N', // Only show primary SN
          all_sns: t.all_sns,
          total_series: t.all_sns.length,
          tecnologia: tecnologiaName,
          marca: marcaName,
          modelo: modeloName,
          boxCode: t.boxes?.box_code || 'S/C',
          updatedAt: t.updated_at ? new Date(t.updated_at).toLocaleString() : 'Desconocida',
          etapa: stageRaw,
          responsable: responsableName,
          dbId: t.id, // ID representativo para UI (checkboxes)
          all_dbIds: t.all_dbIds, // Todos los IDs reales en BD para actualizar
          courier: `${sourceStr} - ${courierStr}`,
          agencia: agenciaStr,
          guide: t.receptions?.guide_number || 'S/G',
          ingress_count: t.ingress_count || 1,
          current_diagnostics: t.current_diagnostics || []
        };
    });
    setTasks(adapted);
    setLoading(false);
  };

  const handleCompleteOperation = async () => {
    if (!selectedForOperation) return;
    if (!diagnosticResult) {
      alert("Por favor selecciona un resultado de evaluación antes de continuar.");
      return;
    }

    if (activeTab === 'reacondicionado' && diagnosticResult === 'reparacion') {
      const confirmed = window.confirm("¿Está seguro que desea enviar el equipo a Requiere Reparación (L1/L2)?");
      if (!confirmed) return;
    }

    setLoading(true);
    
    let finalNotes = `[Evaluación Taller - ${activeTab.toUpperCase()}]\n`;
    
    if (activeTab === 'diagnostico') {
      const funcNotes = Object.entries(functionalChecks).map(([k, v]) => `${k}: ${v === 'OPERATIVO' ? 'Operativo' : 'No Operativo'}`).join('\n');
      finalNotes += `Clasificación Cosmética: ${cosmeticClass || 'No especificada'}
Estado de Etiqueta: ${labelStatus || 'No especificado'}
Checklist Funcional:
${funcNotes || 'Ninguno evaluado'}

`;
    } else if (activeTab === 'qc') {
      finalNotes += `Controles de Calidad:
- Cambio de Etiqueta: ${qcEtiqueta || 'No evaluado'}
- Sello de Seguridad: ${qcSello || 'No evaluado'}
- Check List Funcional: ${qcChecklist || 'No evaluado'}
- Datos Legibles: ${qcLegible || 'No evaluado'}

`;
    } else if (activeTab === 'reacondicionado') {
      finalNotes += `Pruebas de Reacondicionado Realizadas:\n${reacondTests.length > 0 ? reacondTests.map(t => `- ${t}`).join('\n') : 'Ninguna'}\n\n`;
    }
    
    finalNotes += `Notas adicionales: ${diagnosticNotes || 'Sin notas adicionales'}`;

    const actionName = activeTab === 'diagnostico' ? 'DIAGNÓSTICO INICIAL COMPLETADO'
      : activeTab === 'reparacion' ? 'REPARACIÓN COMPLETADA'
      : activeTab === 'qc' ? 'CONTROL DE CALIDAD COMPLETADO'
      : activeTab === 'reacondicionado' ? 'REACONDICIONADO COMPLETADO'
      : 'OPERACIÓN COMPLETADA';
    
    try {
      if (Array.isArray(selectedForOperation)) {
        // Massive
        for (const item of selectedForOperation) {
          if (item.all_dbIds) {
            for (const realId of item.all_dbIds) {
              await saveDiagnostic(realId, diagnosticResult, finalNotes, selectedDiagnostics, actionName);
            }
          } else {
            await saveDiagnostic(item.dbId, diagnosticResult, finalNotes, selectedDiagnostics, actionName);
          }
        }
      } else {
        // Single
        if (selectedForOperation.all_dbIds) {
          for (const realId of selectedForOperation.all_dbIds) {
            await saveDiagnostic(realId, diagnosticResult, finalNotes, selectedDiagnostics, actionName);
          }
        } else {
          await saveDiagnostic(selectedForOperation.dbId, diagnosticResult, finalNotes, selectedDiagnostics, actionName);
        }
      }
      
      alert("Diagnóstico guardado exitosamente.");
      setSelectedForOperation(null);
      setDiagnosticResult(null);
      setDiagnosticNotes('');
      setFunctionalChecks({});
      setCosmeticClass(null);
      setLabelStatus(null);
      setSelectedDiagnostics([]);
      setQcEtiqueta(null);
      setQcSello(null);
      setQcChecklist(null);
      setQcLegible(null);
      setReacondTests([]);
      fetchTasks();
    } catch (error: any) {
      alert(`Error: ${error.message || 'Error guardando diagnóstico'}`);
    }
    
    setLoading(false);
  };

  const handleReturnToStage = async () => {
    const item = returnModalOpen.item;
    if (!item || !returnTargetStage) return;

    setLoading(true);
    try {
      const { updateSeriesStatus } = await import('@/lib/database/workshop');
      const { logAudit } = await import('@/lib/database/audit');
      const stageLabels: Record<string, string> = {
        'in_workshop': 'DIAGNÓSTICO',
        'in_repair': 'REPARACIÓN',
        'in_refurbish': 'REACONDICIONADO',
        'in_l3': 'L3',
        'scrap': 'SCRAPS'
      };
      const label = stageLabels[returnTargetStage] || 'OTRA ETAPA';
      
      if (item.all_dbIds) {
        for (const realId of item.all_dbIds) {
          await updateSeriesStatus(realId, returnTargetStage);
          await logAudit('series', realId, `TRASLADO A ${label}`, { reason: 'Movido manualmente desde Taller', status: returnTargetStage });
        }
      } else {
        await updateSeriesStatus(item.dbId, returnTargetStage);
        await logAudit('series', item.dbId, `TRASLADO A ${label}`, { reason: 'Movido manualmente desde Taller', status: returnTargetStage });
      }
      alert(`Equipo movido a ${label}`);
      setReturnModalOpen({isOpen: false, item: null});
      fetchTasks();
    } catch (error) {
      console.error(error);
      alert('Error moviendo equipo');
    }
    setLoading(false);
  };

  const tabs = [
    { id: 'diagnostico', label: 'Diagnóstico', icon: Stethoscope, color: 'text-amber-500', bg: 'bg-amber-50' },
    { id: 'reparacion', label: 'Reparación', icon: Wrench, color: 'text-blue-500', bg: 'bg-blue-50' },
    { id: 'reacondicionado', label: 'Reacondicionado', icon: RefreshCw, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { id: 'qc', label: 'Control de Calidad', icon: CheckSquare, color: 'text-purple-500', bg: 'bg-purple-50' },
    { id: 'l3', label: 'L3 (Avanzado)', icon: Zap, color: 'text-orange-500', bg: 'bg-orange-50' },
    { id: 'scraps', label: 'SCRAPS', icon: Trash2, color: 'text-rose-500', bg: 'bg-rose-50' },
    { id: 'listo', label: 'Equipo Listo', icon: CheckCircle2, color: 'text-teal-500', bg: 'bg-teal-50' },
    { id: 'despacho', label: 'Despacho Taller', icon: Send, color: 'text-indigo-500', bg: 'bg-indigo-50' },
  ];

  const filteredTasks = tasks.filter(t => {
    let matchesTab = false;
    if (activeTab === 'diagnostico') matchesTab = t.etapa === 'PARA DIAGNOSTICAR';
    else if (activeTab === 'reparacion') matchesTab = t.etapa === 'REPARACION';
    else if (activeTab === 'reacondicionado') matchesTab = t.etapa === 'REACONDICIONADO';
    else if (activeTab === 'qc') matchesTab = t.etapa === 'CONTROL DE CALIDAD';
    else if (activeTab === 'l3') matchesTab = t.etapa === 'L3';
    else if (activeTab === 'scraps') matchesTab = t.etapa === 'SCRAPS';
    else if (activeTab === 'listo') matchesTab = t.etapa === 'EQUIPO LISTO';
    
    if (!matchesTab) return false;
    
    if (searchTerm) {
      const searchTokens = searchTerm.toUpperCase().split(/[\s,]+/).filter(Boolean);
      if (searchTokens.length > 0) {
        const itemSN = (t.sn || '').toUpperCase();
        return searchTokens.some(token => itemSN.includes(token));
      }
    }
    
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / itemsPerPage));
  const tabCounts = tasks.reduce((acc: Record<string, number>, t: any) => {
    let key = '';
    if (t.etapa === 'PARA DIAGNOSTICAR') key = 'diagnostico';
    else if (t.etapa === 'REPARACION') key = 'reparacion';
    else if (t.etapa === 'REACONDICIONADO') key = 'reacondicionado';
    else if (t.etapa === 'CONTROL DE CALIDAD') key = 'qc';
    else if (t.etapa === 'L3') key = 'l3';
    else if (t.etapa === 'SCRAPS') key = 'scraps';
    else if (t.etapa === 'EQUIPO LISTO') key = 'listo';
    
    if (key) acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const currentTasks = filteredTasks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <ModulePage
      category="Producción"
      title="Taller & Operación Técnica"
      subtitle=""
      actions={
        <div className="flex gap-3">
          <Button variant="outline" leftIcon={<Activity className="w-4 h-4" />}>Reporte de Fallas</Button>
          <Button variant="primary" leftIcon={<ClipboardList className="w-4 h-4" />}>Mis Tareas</Button>
        </div>
      }
    >
      <div className="space-y-8">
        
        {/* NEW CQRS DASHBOARD (Strangler Fig) */}
        {useNewDashboard && dashboardKpis && (
          <div className="grid grid-cols-4 gap-4 animate-rise-in">
            <Card className="p-4 bg-[#181c3a] text-white border-2 border-[#2ec4f1] rounded-2xl">
              <h3 className="text-[10px] font-black uppercase tracking-widest opacity-80">Diagnósticos Pendientes</h3>
              <p className="text-3xl font-black text-[#2ec4f1] mt-2">{dashboardKpis.diagnosticosPendientes}</p>
            </Card>
            <Card className="p-4 bg-white border-2 border-slate-100 rounded-2xl">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Diag. En Proceso</h3>
              <p className="text-3xl font-black text-amber-500 mt-2">{dashboardKpis.diagnosticosEnProceso}</p>
            </Card>
            <Card className="p-4 bg-white border-2 border-slate-100 rounded-2xl">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reparaciones en Espera</h3>
              <p className="text-3xl font-black text-blue-500 mt-2">{dashboardKpis.reparacionesEnEspera}</p>
            </Card>
            <Card className="p-4 bg-white border-2 border-slate-100 rounded-2xl">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reparaciones Activas</h3>
              <p className="text-3xl font-black text-emerald-500 mt-2">{dashboardKpis.reparacionesActivas}</p>
            </Card>
          </div>
        )}

        {/* Navigation Tabs - High Contrast & Premium */}
        <div className="flex flex-wrap gap-2 p-2 bg-slate-100/50 rounded-3xl border border-slate-100">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-3 px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${
                  isActive 
                  ? 'bg-[#181c3a] text-white shadow-xl scale-105' 
                  : 'text-slate-400 hover:bg-white hover:text-slate-600'
                }`}
              >
                <Icon size={16} className={isActive ? 'text-[#2ec4f1]' : tab.color} />
                <span className="flex items-center gap-2">
                  {tab.label}
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                    isActive ? 'bg-[#2ec4f1]/20 text-[#2ec4f1]' : 'bg-slate-200 text-slate-500'
                  }`}>
                    {tabCounts[tab.id] || 0}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Dynamic Content Area */}
        <div className="animate-rise-in">
          {activeTab !== 'despacho' && (() => {
            const currentTab = tabs.find(t => t.id === activeTab) || tabs[0];
            const TabIcon = currentTab.icon;
            
            return (
              <div className="space-y-6">
                <div className="flex justify-between items-center bg-white p-8 rounded-3xl border-2 border-slate-100 shadow-sm">
                  {/* Left: Search */}
                  <div className="flex gap-4 items-center">
                    <div className="relative">
                      <Search className="absolute left-4 top-5 text-slate-400 w-4 h-4" />
                      <textarea
                        placeholder="BUSCAR (ACEPTA VARIAS SERIES)..."
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                          setCurrentPage(1);
                        }}
                        rows={2}
                        className="pl-12 pr-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] font-black uppercase outline-none focus:border-amber-400 w-64 min-w-[300px] transition-all resize-y custom-scrollbar"
                      />
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex gap-3 items-center">
                    {/* SCRAPS-specific: Create Dispatch Box button (always visible in SCRAPS) */}
                    {activeTab === 'scraps' && (
                      <Button
                        variant="primary"
                        className="bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20 font-black"
                        leftIcon={<Package className="w-4 h-4" />}
                        onClick={() => {
                          setScrapDispatchModal({ isOpen: true, item: null });
                          setScrapGuideNumber('');
                          setScrapNotes('');
                        }}
                      >
                        Crear Caja de Despacho SCRAP
                      </Button>
                    )}

                    {selectedRows.length > 0 ? (
                      <div className="flex gap-2 animate-rise-in">
                        {activeTab !== 'scraps' && (
                          <>
                            <Button 
                              variant="primary" 
                              className="bg-[#181c3a] hover:bg-slate-800 text-white shadow-lg" 
                              leftIcon={<Plus className="w-4 h-4" />}
                              onClick={() => {
                                setTasks(tasks.map(t => selectedRows.includes(t.dbId) ? { ...t, responsable: 'ASIGNADO' } : t));
                                setSelectedRows([]);
                              }}
                            >
                              Asignar a Mí ({selectedRows.length})
                            </Button>
                            <Button 
                              variant="primary" 
                              className="bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20" 
                              leftIcon={<Activity className="w-4 h-4" />}
                              onClick={() => setSelectedForOperation(tasks.filter(t => selectedRows.includes(t.dbId)))}
                            >
                              {activeTab === 'diagnostico' ? 'Diagnóstico Masivo' : 'Operar Selección'}
                            </Button>
                          </>
                        )}
                        {activeTab === 'scraps' && (
                          <Button
                            variant="primary"
                            className="bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-500/20 font-black"
                            leftIcon={<Send className="w-4 h-4" />}
                            onClick={() => {
                              const selectedItems = filteredTasks.filter(t => selectedRows.includes(t.dbId));
                              const combined = {
                                id: selectedItems.map(i => i.id).join(', '),
                                sn: selectedItems[0]?.sn,
                                marca: selectedItems[0]?.marca,
                                modelo: selectedItems[0]?.modelo,
                                tecnologia: selectedItems[0]?.tecnologia,
                                all_sns: selectedItems.flatMap(i => i.all_sns),
                                all_dbIds: selectedItems.flatMap(i => i.all_dbIds || [i.dbId]),
                              };
                              setScrapDispatchModal({ isOpen: true, item: combined });
                              setScrapGuideNumber('');
                              setScrapNotes('');
                            }}
                          >
                            Despachar Selección ({selectedRows.length})
                          </Button>
                        )}
                      </div>
                    ) : activeTab !== 'scraps' ? (
                      <Button variant="outline" className="border-slate-200 text-slate-400 hover:bg-slate-50 opacity-50 cursor-not-allowed">
                        Selecciona equipos para acciones masivas
                      </Button>
                    ) : null}

                  </div>
                </div>

                <Card padding="none" className="overflow-x-auto custom-scrollbar border-2 border-slate-100 shadow-sm rounded-3xl">
                  <table className="w-full text-left">
                    <thead className={`${
                      activeTab === 'diagnostico' ? 'bg-amber-500 border-b border-amber-600' :
                      activeTab === 'reparacion' ? 'bg-blue-500 border-b border-blue-600' :
                      activeTab === 'reacondicionado' ? 'bg-emerald-500 border-b border-emerald-600' :
                      activeTab === 'qc' ? 'bg-purple-500 border-b border-purple-600' :
                      activeTab === 'l3' ? 'bg-orange-500 border-b border-orange-600' :
                      activeTab === 'scraps' ? 'bg-rose-500 border-b border-rose-600' :
                      activeTab === 'listo' ? 'bg-teal-500 border-b border-teal-600' :
                      'bg-amber-500 border-b border-amber-600'
                    }`}>
                      <tr>
                        <th className="px-6 py-5 w-12 text-center">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 rounded text-blue-500 focus:ring-blue-500 border-slate-300"
                            checked={tasks.length > 0 && selectedRows.length === tasks.length}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedRows(tasks.map(t => t.dbId));
                              else setSelectedRows([]);
                            }}
                          />
                        </th>
                        <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-white/90">Orden Servicio</th>
                        <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-white/90">Serie</th>
                        <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-white/90">Tecnología</th>
                        <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-white/90">Modelo</th>
                        {activeTab === 'diagnostico' && <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-white/90">Caja</th>}
                        <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-white/90">Ingreso</th>
                        <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-white/90">Etapa</th>
                        <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-white/90 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {loading && (
                        <tr>
                          <td colSpan={10} className="py-20 text-center">
                            <Loader2 className="w-8 h-8 text-[#2ec4f1] animate-spin mx-auto" />
                            <p className="text-[10px] font-black text-slate-400 uppercase mt-4 tracking-widest">Sincronizando con Servidor...</p>
                          </td>
                        </tr>
                      )}
                      {!loading && currentTasks.map((item) => (
                        <tr key={item.dbId} className={`hover:bg-slate-50/50 transition-colors group ${selectedRows.includes(item.dbId) ? 'bg-blue-50/30' : ''}`}>
                          <td className="px-6 py-4 text-center">
                            <input 
                              type="checkbox" 
                              className="w-4 h-4 rounded text-blue-500 focus:ring-blue-500 border-slate-300"
                              checked={selectedRows.includes(item.dbId)}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedRows([...selectedRows, item.dbId]);
                                else setSelectedRows(selectedRows.filter(id => id !== item.dbId));
                              }}
                            />
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-[10px] font-black text-[#181c3a] bg-slate-100 px-2 py-1 rounded-md">{item.id}</span>
                          </td>
                          <td className="px-6 py-4">
                            <button 
                              onClick={() => setShowItemDetail(item)}
                              className="text-[11px] font-mono font-bold text-[#2ec4f1] uppercase hover:underline text-left focus:outline-none"
                            >
                              {item.sn}
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-[10px] font-bold text-slate-500 uppercase">{item.tecnologia}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-[11px] font-black text-[#181c3a] uppercase">{item.marca} {item.modelo}</span>
                          </td>
                          {activeTab === 'diagnostico' && (
                            <td className="px-6 py-4">
                              <span className="text-[11px] font-black text-[#181c3a] uppercase">{item.boxCode}</span>
                            </td>
                          )}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-bold text-slate-400">{item.updatedAt}</span>
                              <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-md ${item.ingress_count > 1 ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-500'}`}>
                                {item.ingress_count === 1 ? '1er Ingreso' : item.ingress_count === 2 ? '2do Ingreso' : `${item.ingress_count}° Ingreso`}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant="purple" className="bg-purple-50 text-purple-600 border-none font-black text-[8px] tracking-tighter">{item.etapa}</Badge>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {activeTab !== 'diagnostico' && activeTab !== 'scraps' && (
                                <button 
                                  onClick={() => { setReturnModalOpen({isOpen: true, item}); setReturnTargetStage('in_workshop'); }}
                                  className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-amber-500 hover:border-amber-200 hover:bg-amber-50 transition-colors"
                                  title="Mover a otra etapa"
                                >
                                  <RotateCcw size={14} />
                                </button>
                              )}
                              <button 
                                onClick={() => setHistoryModalOpen({isOpen: true, item})}
                                className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-blue-500 hover:border-blue-200 hover:bg-blue-50 transition-colors"
                                title="Ver Historial"
                              >
                                <History size={14} />
                              </button>
                              {activeTab === 'scraps' ? (
                                <Button 
                                  variant="primary" 
                                  className="bg-rose-500 hover:bg-rose-600 text-white rounded-xl shadow-lg shadow-rose-500/20 px-4 h-9 text-[9px] font-black uppercase tracking-widest"
                                  rightIcon={<Send className="w-3 h-3" />}
                                  onClick={() => {
                                    setScrapDispatchModal({isOpen: true, item});
                                    setScrapGuideNumber('');
                                    setScrapNotes('');
                                  }}
                                >
                                  DESPACHAR
                                </Button>
                              ) : (
                                <Button 
                                  variant="primary" 
                                  className="bg-[#2ec4f1] hover:bg-[#2ec4f1]/80 text-[#181c3a] rounded-xl shadow-lg px-4 h-9 text-[9px] font-black uppercase tracking-widest"
                                  rightIcon={<ArrowRight className="w-3 h-3" />}
                                  onClick={() => setSelectedForOperation(item)}
                                >
                                  EVALUAR
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="p-4 border-t border-slate-50 flex items-center justify-between bg-slate-50/50">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      MOSTRANDO {currentTasks.length} DE {filteredTasks.length} EQUIPOS EN COLA
                    </span>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors text-slate-400 disabled:opacity-30"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      {Array.from({length: totalPages}, (_, i) => i + 1).map((page) => (
                        <button 
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`h-8 w-8 flex items-center justify-center rounded-lg text-xs font-black transition-all ${
                            currentPage === page 
                              ? 'bg-[#181c3a] text-white shadow-md' 
                              : 'text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                      <button
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors text-slate-400 disabled:opacity-30"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </Card>
              </div>
            );
          })()}

          {/* ════════════ TAB: DESPACHO TALLER ════════════ */}
          {activeTab === 'despacho' && (() => {
            const origenDef = DESP_ORIGENES.find(o => o.id === despOrigen);
            const destinoDef = DESP_DESTINOS.find(d => d.id === despDestino);
            const despTasks = origenDef ? tasks.filter(t => t.etapa === origenDef.etapa) : [];
            const colorMap: Record<string, string> = {
              amber: 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-400',
              blue: 'border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-400',
              emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400',
              purple: 'border-purple-200 bg-purple-50 text-purple-700 hover:border-purple-400',
              orange: 'border-orange-200 bg-orange-50 text-orange-700 hover:border-orange-400',
              rose: 'border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-400',
              teal: 'border-teal-200 bg-teal-50 text-teal-700 hover:border-teal-400',
              indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-400',
            };
            const activeColorMap: Record<string, string> = {
              amber: 'border-amber-500 bg-amber-500 text-white shadow-lg shadow-amber-500/30',
              blue: 'border-blue-500 bg-blue-500 text-white shadow-lg shadow-blue-500/30',
              emerald: 'border-emerald-500 bg-emerald-500 text-white shadow-lg shadow-emerald-500/30',
              purple: 'border-purple-500 bg-purple-500 text-white shadow-lg shadow-purple-500/30',
              orange: 'border-orange-500 bg-orange-500 text-white shadow-lg shadow-orange-500/30',
              rose: 'border-rose-500 bg-rose-500 text-white shadow-lg shadow-rose-500/30',
              teal: 'border-teal-500 bg-teal-500 text-white shadow-lg shadow-teal-500/30',
              indigo: 'border-indigo-500 bg-indigo-500 text-white shadow-lg shadow-indigo-500/30',
            };
            return (
              <div className="space-y-0">

                {/* FASE: Dashboard */}
                {despFase === 'dashboard' && (
                  <div className="bg-white rounded-3xl border-2 border-slate-100 shadow-sm overflow-hidden">
                    <div className="bg-gradient-to-r from-[#181c3a] to-indigo-900 p-8 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div className="flex items-center gap-4">
                        <div className="bg-white/15 p-3 rounded-2xl backdrop-blur-sm">
                          <Send className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/60 mb-1">Taller · Producción</p>
                          <h2 className="text-2xl font-black">Despacho Taller</h2>
                          <p className="text-[11px] text-white/70 mt-0.5">Gestión de Movimientos y Cajas</p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setDespBoxModalOpen(true);
                          setDespEditingMovementId(null);
                          setDespOrigen(null);
                          setDespDestino(null);
                          setDespBoxTecnologia('');
                          setDespBoxMarca('');
                          setDespBoxModelo('');
                          setDespBoxCantidad('');
                        }}
                        className="bg-black hover:bg-slate-900 text-white font-black shadow-lg shadow-black/20 gap-2 flex items-center px-4 py-2.5 rounded-xl transition-all"
                      >
                        <Plus className="w-5 h-5" />
                        Crear Movimiento
                      </button>
                    </div>
                    
                    <div className="p-8">
                      {despActiveMovements.length === 0 ? (
                        <div className="text-center py-16 px-4 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                            <Package className="w-8 h-8 text-slate-300" />
                          </div>
                          <h3 className="text-lg font-black text-slate-800 mb-1">No hay movimientos activos</h3>
                          <p className="text-sm font-bold text-slate-500">Haz clic en "Crear Movimiento" para iniciar un nuevo despacho.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {despActiveMovements.map(mov => {
                            const origenInfo = DESP_ORIGENES.find(o => o.id === mov.origen);
                            const destinoInfo = DESP_DESTINOS.find(d => d.id === mov.destino);
                            const DestIcon = destinoInfo?.icon || Package;
                            return (
                              <div
                                key={mov.id}
                                className="group text-left bg-white border-2 border-slate-100 rounded-3xl p-6 hover:border-indigo-400 hover:shadow-xl hover:shadow-indigo-500/10 transition-all flex flex-col relative"
                              >
                                <div className="flex justify-between items-start mb-4">
                                  <div className={`p-3 rounded-2xl ${destinoInfo?.id === 'salida' ? 'bg-indigo-50 text-indigo-600' : 'bg-teal-50 text-teal-600'} transition-colors`}>
                                    <DestIcon className="w-6 h-6" />
                                  </div>
                                  <div className="flex flex-col items-end gap-2">
                                    <Badge variant="slate" className="bg-slate-100 text-slate-600 font-black text-[9px] uppercase">
                                      {mov.conduce}
                                    </Badge>
                                    <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
                                      <button onClick={(e) => {
                                        e.stopPropagation();
                                        alert('Visualizar detalle - Próximamente');
                                      }} className="flex items-center gap-1.5 px-2 py-1.5 text-black hover:bg-slate-100 rounded-lg transition-colors text-[10px] font-bold" title="Visualizar">
                                        <Eye className="w-4 h-4" /> Ver
                                      </button>
                                      <button onClick={(e) => {
                                        e.stopPropagation();
                                        alert('Imprimir conduce - Próximamente');
                                      }} className="flex items-center gap-1.5 px-2 py-1.5 text-black hover:bg-slate-100 rounded-lg transition-colors text-[10px] font-bold" title="Imprimir Conduce">
                                        <Printer className="w-4 h-4" /> Imprimir
                                      </button>
                                      <button onClick={(e) => {
                                        e.stopPropagation();
                                        setDespEditingMovementId(mov.id);
                                        setDespOrigen(mov.origen);
                                        setDespDestino(mov.destino);
                                        setDespBoxTecnologia(mov.tecnologia);
                                        setDespBoxMarca(mov.marca);
                                        setDespBoxModelo(mov.modelo);
                                        setDespBoxCantidad(mov.cantidadEsperada);
                                        setDespBoxModalOpen(true);
                                      }} className="flex items-center gap-1.5 px-2 py-1.5 text-black hover:bg-slate-100 rounded-lg transition-colors text-[10px] font-bold" title="Editar / Actualizar">
                                        <Edit2 className="w-4 h-4" /> Editar / Actualizar
                                      </button>
                                      <button onClick={(e) => {
                                        e.stopPropagation();
                                        if(confirm('¿Eliminar este movimiento?')) {
                                          setDespActiveMovements(prev => prev.filter(m => m.id !== mov.id));
                                        }
                                      }} className="flex items-center gap-1.5 px-2 py-1.5 text-white bg-black hover:bg-rose-600 rounded-lg transition-colors text-[10px] font-bold ml-auto" title="Eliminar">
                                        <Trash2 className="w-4 h-4" /> Eliminar
                                      </button>
                                    </div>
                                  </div>
                                </div>
                                <h3 className="text-lg font-black text-slate-800 mb-1 truncate pr-8" title={mov.id}>{mov.id}</h3>
                                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-4">
                                  {origenInfo?.label} → {destinoInfo?.label}
                                </p>
                                <div className="mt-auto pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
                                  <div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Modelo</p>
                                    <p className="text-xs font-bold text-slate-700 truncate">{mov.marca} {mov.modelo}</p>
                                  </div>
                                  <div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Cantidad</p>
                                    <p className="text-xs font-bold text-slate-700">{mov.cantidadEsperada} uds</p>
                                  </div>
                                </div>
                                <button
                                  onClick={() => {
                                    setDespOrigen(mov.origen);
                                    setDespDestino(mov.destino);
                                    setDespBoxNumber(mov.id);
                                    setDespGuideNumber(mov.conduce);
                                    setDespFase('pistolero');
                                  }}
                                  className="w-full py-3 bg-[#181c3a] text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-600 transition-colors flex items-center justify-center gap-2"
                                >
                                  <ScanLine className="w-4 h-4" /> Abrir Escáner
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* MODAL CAJA DE SALIDA / BODEGA */}
                {despBoxModalOpen && (
                  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#181c3a]/40 backdrop-blur-sm p-4 overflow-y-auto">
                    <Card className="max-w-xl w-full shadow-2xl animate-rise-in p-0 overflow-hidden my-8">
                      <div className="p-6 bg-indigo-600 text-white flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <Package className="w-5 h-5 text-indigo-200" />
                          <div>
                            <h3 className="font-black text-lg">Nuevo Movimiento</h3>
                            <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest mt-0.5">Define los detalles del despacho</p>
                          </div>
                        </div>
                        <button onClick={() => setDespBoxModalOpen(false)} className="text-white/60 hover:text-white transition-colors">
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="p-6 space-y-6 bg-slate-50">
                        {/* Origen y Destino in Modal */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Origen <span className="text-rose-500">*</span></label>
                            <select value={despOrigen || ''} onChange={e => setDespOrigen(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-indigo-400 transition-all">
                              <option value="">Seleccionar Origen</option>
                              {DESP_ORIGENES.map(o => (
                                <option key={o.id} value={o.id}>{o.label} ({tasks.filter(t => t.etapa === o.etapa).length})</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Destino <span className="text-rose-500">*</span></label>
                            <select value={despDestino || ''} onChange={e => setDespDestino(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-indigo-400 transition-all">
                              <option value="">Seleccionar Destino</option>
                              {DESP_DESTINOS.map(d => (
                                <option key={d.id} value={d.id}>{d.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        
                        <div className="border-t border-slate-200 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Tecnología <span className="text-rose-500">*</span></label>
                            <select value={despBoxTecnologia} onChange={e => setDespBoxTecnologia(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all">
                              <option value="">Seleccionar Tecnología</option>
                              {catTecnologias.map(t => (
                                <option key={t.id} value={t.name}>{t.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Marca <span className="text-rose-500">*</span></label>
                            <select value={despBoxMarca} onChange={e => { setDespBoxMarca(e.target.value); setDespBoxModelo(''); }} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-indigo-400 transition-all">
                              <option value="">Seleccionar Marca</option>
                              {catMarcas.map(m => (
                                <option key={m.id} value={m.name}>{m.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Modelo <span className="text-rose-500">*</span></label>
                            <select value={despBoxModelo} onChange={e => setDespBoxModelo(e.target.value)} disabled={!despBoxMarca} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-indigo-400 transition-all disabled:opacity-50 disabled:bg-slate-100">
                              <option value="">{despBoxMarca ? 'Seleccionar Modelo' : 'Selecciona una marca primero'}</option>
                              {catModelos
                                .filter(m => !despBoxMarca || m.brand_id === catMarcas.find(b => b.name === despBoxMarca)?.id)
                                .map(m => (
                                  <option key={m.id} value={m.name}>{m.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Cantidad Esperada <span className="text-rose-500">*</span></label>
                            <input type="number" min="1" value={despBoxCantidad} onChange={e => setDespBoxCantidad(e.target.value ? parseInt(e.target.value) : '')} placeholder="Cantidad de equipos" className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-indigo-400 transition-all" />
                          </div>
                        </div>
                        <Button
                          variant="primary"
                          disabled={!despOrigen || !despDestino || !despBoxTecnologia || !despBoxMarca || !despBoxModelo || !despBoxCantidad}
                          className="w-full bg-[#181c3a] hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500 text-white shadow-lg py-4 font-black mt-2 disabled:shadow-none"
                          onClick={async () => {
                            if (!despOrigen || !despDestino || !despBoxTecnologia || !despBoxMarca || !despBoxModelo || !despBoxCantidad) {
                              alert('Completa todos los campos para crear el lote.');
                              return;
                            }
                            let boxId = despEditingMovementId;
                            if (!boxId) {
                              if (despDestino === 'bodega') {
                                boxId = `PENDIENTE-BOD-${Date.now().toString().slice(-4)}`;
                              } else {
                                boxId = `SALIDA-${Date.now().toString().slice(-4)} OUT`;
                              }
                            }
                              
                            const newMovement: DespachoMovement = {
                              id: boxId,
                              origen: despOrigen,
                              destino: despDestino,
                              tecnologia: despBoxTecnologia,
                              marca: despBoxMarca,
                              modelo: despBoxModelo,
                              cantidadEsperada: typeof despBoxCantidad === 'number' ? despBoxCantidad : 0,
                              conduce: despEditingMovementId ? despActiveMovements.find(m => m.id === despEditingMovementId)?.conduce || generateDespConduce(despOrigen, despDestino) : generateDespConduce(despOrigen, despDestino),
                              createdAt: despEditingMovementId ? despActiveMovements.find(m => m.id === despEditingMovementId)?.createdAt || new Date() : new Date()
                            };
                            
                            // Because getSupabaseBrowserClient is async if we wait for it, we make the onClick async
                            if (despEditingMovementId) {
                              setDespActiveMovements(prev => prev.map(m => m.id === despEditingMovementId ? newMovement : m));
                            } else {
                              setDespActiveMovements([...despActiveMovements, newMovement as any]); // using any to bypass type issues
                            }
                            
                            setDespBoxModalOpen(false);
                            setDespEditingMovementId(null);
                            // Limpiamos los inputs
                            setDespOrigen(null);
                            setDespDestino(null);
                          }}
                        >
                          Crear Movimiento
                        </Button>
                      </div>
                    </Card>
                  </div>
                )}

                {/* FASE 2+3: Pistolero + Conduce */}
                {despFase === 'pistolero' && origenDef && destinoDef && (
                  <div className="bg-white rounded-3xl border-2 border-slate-100 shadow-sm overflow-hidden flex flex-col">
                    {/* Header */}
                    <div className="p-6 text-white flex items-center justify-between shrink-0 bg-gradient-to-r from-indigo-600 to-indigo-800">
                      <div className="flex items-center gap-4">
                        <div className="bg-white/15 p-2.5 rounded-xl">
                          <Send className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/60">Despacho Taller</p>
                          <h2 className="text-xl font-black">{origenDef.label}<span className="mx-2 text-white/40">→</span>{destinoDef.label}</h2>
                          <div className="flex items-center gap-3 mt-1">
                            <p className="text-[10px] text-white/70">{despTasks.length} disponibles · {despScannedItems.length} seleccionado(s)</p>
                            {despBoxNumber && (
                              <Badge variant="slate" className="bg-white/20 text-white border-none font-black text-[9px] uppercase backdrop-blur-md">
                                Caja: {despBoxNumber}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <button onClick={() => { setDespFase('dashboard'); despResetPistolero(); }}
                        className="flex items-center gap-2 text-[10px] font-black text-white uppercase tracking-widest transition-colors bg-[#181c3a] hover:bg-black px-4 py-2.5 rounded-xl shadow-lg shadow-black/20"
                      >
                        <ChevronLeft className="w-4 h-4" /> Regresar
                      </button>
                    </div>

                    {/* Body 2 cols */}
                    <div className="p-6 grid grid-cols-2 gap-6">
                      {/* LEFT */}
                      <div className="space-y-5">
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                          <h3 className="text-sm font-black text-[#181c3a]">Escáner de Series</h3>
                          <div>
                            <div className="flex justify-between mb-1">
                              <label className="text-xs font-black text-slate-700">SN <span className="text-rose-500">*</span></label>
                              <span className="text-[10px] font-bold text-slate-400">Max: 15</span>
                            </div>
                            <input
                              id="desp-sn-input" autoFocus type="text" maxLength={15}
                              value={despScanSN}
                              onChange={e => { setDespScanSN(e.target.value.toUpperCase()); setDespScanError(''); }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  const snVal = despScanSN.trim().toUpperCase();
                                  if (!snVal) { setDespScanError('El SN es obligatorio'); return; }
                                  if (despScannedItems.find(i => i.sn === snVal)) { setDespScanError(`"${snVal}" ya fue registrado`); setDespScanSN(''); return; }
                                  const found = despTasks.find(t => (t.all_sns || [t.sn]).map((s: string) => s.toUpperCase()).includes(snVal));
                                  if (!found) { setDespScanError(`"${snVal}" no está en ${origenDef.label} — verifica su estatus`); return; }
                                  const idx = despScannedItems.length;
                                  setDespScannedItems(prev => [...prev, { num: idx+1, sn: snVal, os: found.id, marca: found.marca, modelo: found.modelo, dbId: found.dbId, all_dbIds: found.all_dbIds }]);
                                  setDespScanSN(''); setDespScanError('');
                                  document.getElementById('desp-sn-input')?.focus();
                                }
                              }}
                              placeholder={`Escanear SN en ${origenDef.label}...`}
                              className={`w-full px-4 py-3 border rounded-xl text-sm font-mono font-bold outline-none transition-colors ${despScanError ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-white focus:border-indigo-400'}`}
                            />
                            <div className="flex justify-end mt-1">
                              <span className="text-[10px] font-bold text-slate-400">{despScanSN.length} / 15</span>
                            </div>
                          </div>
                          {despScanError && (
                            <p className="text-[10px] font-black text-rose-500 flex items-center gap-1.5">
                              <AlertCircle className="w-3.5 h-3.5" />{despScanError}
                            </p>
                          )}
                          <button
                            onClick={() => {
                              const snVal = despScanSN.trim().toUpperCase();
                              if (!snVal) { setDespScanError('El SN es obligatorio'); return; }
                              if (despScannedItems.find(i => i.sn === snVal)) { setDespScanError(`"${snVal}" ya fue registrado`); setDespScanSN(''); return; }
                              const found = despTasks.find(t => (t.all_sns || [t.sn]).map((s: string) => s.toUpperCase()).includes(snVal));
                              if (!found) { setDespScanError(`"${snVal}" no está en ${origenDef.label}`); return; }
                              const idx = despScannedItems.length;
                              setDespScannedItems(prev => [...prev, { num: idx+1, sn: snVal, os: found.id, marca: found.marca, modelo: found.modelo, dbId: found.dbId, all_dbIds: found.all_dbIds }]);
                              setDespScanSN(''); setDespScanError('');
                              document.getElementById('desp-sn-input')?.focus();
                            }}
                            className="w-full py-3.5 bg-[#181c3a] hover:bg-[#232848] text-white font-black text-sm rounded-xl transition-all active:scale-[0.99] tracking-wider"
                          >Registrar Equipo (Enter)</button>
                        </div>
                        {/* Progreso */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                          <h3 className="text-sm font-black text-slate-500 mb-3">Progreso</h3>
                          <div className="flex items-end gap-2 mb-3">
                            <span className="text-4xl font-black text-[#181c3a]">{despScannedItems.length}</span>
                            <span className="text-sm font-bold text-slate-400 mb-1">/ {despTasks.length} disponibles</span>
                          </div>
                          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500"
                              style={{ width: despTasks.length > 0 ? `${Math.min(100,(despScannedItems.length/despTasks.length)*100)}%` : '0%', background: 'linear-gradient(90deg,#6366f1,#818cf8)' }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* RIGHT: Tabla */}
                      <div className="flex flex-col">
                        <h3 className="text-sm font-black text-[#181c3a] mb-3">Contenido del Despacho</h3>
                        <div className="flex-1 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                          {despScannedItems.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-52 text-center">
                              <ScanLine className="w-10 h-10 text-indigo-200 mb-3" />
                              <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Registra equipos con el escáner</p>
                            </div>
                          ) : (
                            <div className="overflow-x-auto overflow-y-auto max-h-[380px] custom-scrollbar">
                              <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-white border-b border-slate-100 z-10">
                                  <tr>
                                    <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">#</th>
                                    <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">OS</th>
                                    <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">SN</th>
                                    <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">Modelo</th>
                                    <th className="w-8" />
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                  {[...despScannedItems].reverse().map((sc, i) => (
                                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                                      <td className="px-3 py-3"><span className="text-[10px] font-black text-slate-400">{despScannedItems.length - i}</span></td>
                                      <td className="px-3 py-3"><span className="text-[10px] font-black text-[#181c3a] bg-slate-100 px-1.5 py-0.5 rounded">{sc.os}</span></td>
                                      <td className="px-3 py-3"><span className="text-xs font-black text-indigo-600 font-mono">{sc.sn}</span></td>
                                      <td className="px-3 py-3"><span className="text-[10px] text-slate-500">{sc.marca} {sc.modelo}</span></td>
                                      <td className="px-3 py-3">
                                        <button onClick={() => setDespScannedItems(prev => prev.filter((_, idx) => idx !== (despScannedItems.length - 1 - i)))}
                                          className="text-slate-300 hover:text-rose-400 transition-colors p-1 rounded-lg hover:bg-rose-50">
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* FASE 3: Conduce + Confirmación */}
                    <div className="px-6 pb-6 space-y-3 border-t border-slate-100 pt-5">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                              Conduce de Despacho <span className="text-rose-500">*</span>
                            </label>
                            <button onClick={() => setDespGuideNumber(generateDespConduce(despOrigen!, despDestino!))}
                              className="text-[9px] font-black text-indigo-500 hover:text-indigo-700 uppercase tracking-widest flex items-center gap-1 transition-colors">
                              <RotateCcw className="w-3 h-3" /> Regenerar
                            </button>
                          </div>
                          <div className="relative">
                            <input type="text" value={despGuideNumber} onChange={e => setDespGuideNumber(e.target.value)}
                              placeholder="CD-ORIG-DEST-2026-0000"
                              className="w-full pl-4 pr-24 py-3 bg-indigo-50 border-2 border-indigo-200 rounded-xl text-sm font-black text-indigo-700 outline-none focus:border-indigo-400 transition-colors font-mono tracking-wider"
                            />
                            {despGuideNumber && (
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[9px] font-black text-indigo-400">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Generado
                              </span>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Notas</label>
                          <textarea value={despNotes} onChange={e => setDespNotes(e.target.value)}
                            placeholder="Observaciones del despacho..." rows={2}
                            className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm text-[#181c3a] outline-none focus:border-indigo-400 transition-colors resize-none"
                          />
                        </div>
                      </div>
                      <Button
                        variant="primary"
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20 font-black py-4"
                        rightIcon={despDispatching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        onClick={async () => {
                          if (despScannedItems.length === 0) { alert('Registra al menos un equipo antes de confirmar.'); return; }
                          if (!despGuideNumber.trim()) { alert('El conduce es obligatorio.'); return; }
                          try {
                            setDespDispatching(true);
                            
                            // Aquí actualizamos las series en la base de datos
                            const { logAdvancedAudit } = await import('@/lib/database/audit');
                            const { updateSeriesStatus } = await import('@/lib/database/workshop');
                            const groups = despScannedItems.reduce((acc: any, curr: any) => {
                              const id = curr.dbId;
                              if (!acc[id]) acc[id] = [];
                              acc[id].push(curr);
                              return acc;
                            }, {});

                            let finalBoxNumber = despBoxNumber;
                            if (destinoDef.id === 'bodega') {
                              const supabase = getSupabaseBrowserClient();
                              if (supabase) {
                                const { data, error } = await supabase.rpc('next_box_code');
                                if (!error && data) {
                                  finalBoxNumber = data;
                                } else {
                                  finalBoxNumber = `CAJA-BOD-${Date.now().toString().slice(-4)}`;
                                }
                              }
                            }

                            for (const id in groups) {
                              const items = groups[id];
                              await updateSeriesStatus(id, destinoDef.status);
                              await logAdvancedAudit({ module: 'Taller', tableName: 'series', recordId: id, action: 'DESPACHO TALLER', severity: 'INFO',
                                newValues: { conduce: despGuideNumber, origen: origenDef.label, destino: destinoDef.label, notes: despNotes, serial: items[0].sn, os: items[0].os, caja: finalBoxNumber || undefined }
                              });
                            }

                            if (destinoDef.id === 'bodega' && finalBoxNumber) {
                              const { createBoxWithSeries } = await import('@/lib/database/warehouse');
                              
                              // Obtenemos los nombres legibles de las marcas y modelos del estado del dashboard
                              const targetMovement = despActiveMovements.find(m => m.id === despBoxNumber);
                              const selectedMarcaId = catMarcas.find(m => m.name === targetMovement?.marca)?.id || targetMovement?.marca || '';
                              const selectedModeloId = catModelos.find(m => m.name === targetMovement?.modelo)?.id || targetMovement?.modelo || '';

                              const boxData = {
                                box_code: finalBoxNumber,
                                rack_location: 'SIN ASIGNAR', // Será asignado luego en Bodega
                                brand_id: selectedMarcaId,
                                model_id: selectedModeloId,
                                capacity: targetMovement?.cantidadEsperada || despScannedItems.length,
                                status: despScannedItems.length >= (targetMovement?.cantidadEsperada || despScannedItems.length) ? 'Full' : 'Partial'
                              };

                              // Obtenemos todos los serial numbers (S-1, S-2, S-3, etc) relacionados a las ordenes de servicio despachadas
                              // Cada curr tiene all_sns
                              const snsToUpdate = new Set<string>();
                              despScannedItems.forEach(curr => {
                                const found = tasks.find(t => t.dbId === curr.dbId);
                                if (found && found.all_sns) {
                                  found.all_sns.forEach((s: string) => snsToUpdate.add(s));
                                } else {
                                  snsToUpdate.add(curr.sn);
                                }
                              });
                              
                              const result = await createBoxWithSeries(boxData, Array.from(snsToUpdate));
                              if (result.error) {
                                console.error('Error al crear la caja en Bodega Central:', result.error);
                              }
                            }
                            
                            // Eliminar el movimiento de la lista local
                            setDespActiveMovements(prev => prev.filter(m => m.id !== despBoxNumber));

                            alert(`Despacho completado con éxito. Se movieron ${despScannedItems.length} equipos a ${destinoDef.label}.`);
                            setDespFase('dashboard');
                            despResetPistolero();
                            fetchTasks();
                          } catch (err: any) { alert(`Error: ${err.message}`); }
                          setDespDispatching(false);
                        }}
                      >
                        {despDispatching ? 'Despachando...' : `Confirmar Despacho (${despScannedItems.length} equipo${despScannedItems.length !== 1 ? 's' : ''})`}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
      {selectedForOperation && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-[#181c3a]/40 backdrop-blur-sm p-6 overflow-y-auto">
          <Card className="max-w-4xl w-full my-auto shadow-2xl animate-rise-in p-0 flex flex-col">
            <div className={`p-8 text-white flex justify-between items-center shrink-0 ${
              activeTab === 'diagnostico' ? 'bg-amber-500' :
              activeTab === 'reparacion' ? 'bg-blue-500' :
              activeTab === 'reacondicionado' ? 'bg-emerald-500' :
              activeTab === 'qc' ? 'bg-purple-500' :
              activeTab === 'l3' ? 'bg-orange-500' :
              activeTab === 'scraps' ? 'bg-rose-500' :
              activeTab === 'listo' ? 'bg-teal-500' :
              'bg-[#181c3a]'
            }`}>
              <div className="flex items-center gap-4">
                <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-sm">
                  <Stethoscope className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Badge variant="blue" className="bg-white/20 text-white font-black text-[9px] uppercase border-none backdrop-blur-sm">
                      {Array.isArray(selectedForOperation) ? `OPERACIÓN MASIVA (${selectedForOperation.length})` : selectedForOperation.id}
                    </Badge>
                    <span className="text-[10px] font-bold text-white/90 uppercase tracking-[0.2em]">
                      Ejecución de {activeTab === 'diagnostico' ? 'Diagnóstico' : activeTab === 'reparacion' ? 'Reparación' : activeTab === 'qc' ? 'Control de Calidad' : activeTab === 'reacondicionado' ? 'Reacondicionado' : 'Operación'}
                    </span>
                    
                    {!Array.isArray(selectedForOperation) && (
                      <div className="flex gap-2 ml-auto md:ml-4">
                        <Badge variant="slate" className={`border-none font-black text-[9px] uppercase ${selectedForOperation.ingress_count > 1 ? 'bg-amber-500 text-white shadow-lg shadow-black/10' : 'bg-black/40 text-white backdrop-blur-md shadow-lg shadow-black/10'}`}>
                          {selectedForOperation.ingress_count === 1 ? '1er Ingreso' : selectedForOperation.ingress_count === 2 ? '2do Ingreso' : `${selectedForOperation.ingress_count}° Ingreso`}
                        </Badge>
                        <Badge variant="slate" className="bg-black/40 text-white backdrop-blur-md shadow-lg shadow-black/10 border-none font-black text-[9px] uppercase tracking-widest">
                          {selectedForOperation.etapa}
                        </Badge>
                      </div>
                    )}
                  </div>
                  <h3 className="text-2xl font-black mt-1">
                    {Array.isArray(selectedForOperation) ? 'Múltiples Equipos Seleccionados' : selectedForOperation.modelo} 
                    <span className="text-white/90 font-mono text-sm ml-2">
                      {Array.isArray(selectedForOperation) ? 'Varios S/N' : selectedForOperation.sn}
                    </span>
                  </h3>
                </div>
              </div>
              <button 
                onClick={() => {
                  setSelectedForOperation(null);
                  setDiagnosticResult(null);
                  setDiagnosticNotes('');
                  setFunctionalChecks({});
                  setCosmeticClass(null);
                  setLabelStatus(null);
                  setQcEtiqueta(null);
                  setQcSello(null);
                  setQcChecklist(null);
                  setQcLegible(null);
                  setReacondTests([]);
                }}  
                className="text-white/80 hover:text-white p-2 hover:bg-white/20 rounded-xl transition-all"
              >✕</button>
            </div>

            <div className="p-10 bg-slate-50/50 space-y-8">


              {/* 2. CLASIFICACIÓN COSMÉTICA */}
              {activeTab === 'diagnostico' ? (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 transition-all">
                  <button 
                    onClick={() => setIsCosmeticOpen(!isCosmeticOpen)}
                    className="w-full flex items-center justify-between group outline-none"
                  >
                    <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-500 flex items-center gap-2">
                      <Box className="w-4 h-4 group-hover:scale-110 transition-transform" />
                      2. Clasificación Cosmética
                    </h4>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isCosmeticOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isCosmeticOpen && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-slate-100 pt-6 mt-6 animate-in slide-in-from-top-2 fade-in duration-200">
                    {[
                      { val: 'A', label: 'Excelente' },
                      { val: 'B', label: 'Bueno' },
                      { val: 'C', label: 'Regular' },
                      { val: 'D', label: 'Dañado' },
                    ].map((item) => (
                      <button 
                        key={item.val}
                        onClick={() => setCosmeticClass(item.val)}
                        className={`p-4 rounded-xl border-2 text-center transition-all flex flex-col items-center justify-center gap-1 ${cosmeticClass === item.val ? 'border-amber-500 bg-amber-50 shadow-md scale-[1.02]' : 'border-slate-200 bg-transparent hover:border-amber-400'}`}
                      >
                        <span className={`text-xl font-black ${cosmeticClass === item.val ? 'text-amber-500' : 'text-slate-600'}`}>{item.val}</span>
                        <span className={`text-[10px] font-bold ${cosmeticClass === item.val ? 'text-amber-500' : 'text-slate-400'}`}>{item.label}</span>
                      </button>
                    ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-slate-50 p-6 rounded-2xl shadow-sm border border-slate-200">
                  <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2 mb-4">
                    <Box className="w-4 h-4" />
                    Clasificación Cosmética Inicial (Bloqueada)
                  </h4>
                  <div className="flex items-center gap-4">
                    {lockedCosmetic ? (
                      <div className="px-6 py-3 bg-white border border-slate-200 rounded-xl shadow-sm flex items-center gap-3">
                        <span className="text-xl font-black text-slate-600">{lockedCosmetic}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {lockedCosmetic === 'A' ? 'Excelente' : lockedCosmetic === 'B' ? 'Bueno' : lockedCosmetic === 'C' ? 'Regular' : 'Dañado'}
                        </span>
                      </div>
                    ) : (
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">NO HAY CLASIFICACIÓN REGISTRADA</p>
                    )}
                  </div>
                </div>
              )}



              {/* 3. ESTADO DE LA ETIQUETA DE DATOS */}
              {activeTab === 'diagnostico' && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 transition-all">
                <button 
                  onClick={() => setIsLabelOpen(!isLabelOpen)}
                  className="w-full flex items-center justify-between group outline-none"
                >
                  <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-500 flex items-center gap-2">
                    <Badge className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    3. Estado de la Etiqueta de Datos
                  </h4>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isLabelOpen ? 'rotate-180' : ''}`} />
                </button>

                {isLabelOpen && (
                  <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-6 mt-6 animate-in slide-in-from-top-2 fade-in duration-200">
                  <button 
                    onClick={() => setLabelStatus('OK')}
                    className={`p-4 rounded-xl border-2 text-center transition-all flex items-center justify-center ${labelStatus === 'OK' ? 'border-emerald-500 bg-emerald-50 shadow-sm scale-[1.02]' : 'border-slate-200 bg-transparent hover:border-amber-400'}`}
                  >
                    <span className={`text-xs font-black uppercase ${labelStatus === 'OK' ? 'text-emerald-600' : 'text-slate-500'}`}>ETIQUETA OK (BIEN)</span>
                  </button>
                  <button 
                    onClick={() => setLabelStatus('MAL')}
                    className={`p-4 rounded-xl border-2 text-center transition-all flex items-center justify-center ${labelStatus === 'MAL' ? 'border-rose-400 bg-rose-50 shadow-sm scale-[1.02]' : 'border-slate-200 bg-transparent hover:border-amber-400'}`}
                  >
                    <span className={`text-xs font-black uppercase ${labelStatus === 'MAL' ? 'text-rose-600' : 'text-slate-500'}`}>ETIQUETA MAL (CON FALLA)</span>
                  </button>
                  </div>
                )}
              </div>
              )}

              {/* DIAGNÓSTICO PREVIO (SOLO EN REPARACIÓN/OTROS) */}
              {activeTab !== 'diagnostico' && (
                <div className="bg-slate-50 p-6 rounded-2xl shadow-sm border border-slate-200">
                  <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 mb-4 flex flex-wrap items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Diagnóstico Inicial (Bloqueado)
                    {lockedDiagProfile && <span className="ml-auto text-[9px] font-black text-slate-100 bg-slate-800 px-3 py-1 rounded-full shadow-sm tracking-widest border border-slate-900">POR: {lockedDiagProfile.toUpperCase()}</span>}
                  </h4>
                  <div className="flex flex-col gap-2">
                    {lockedDiagnostics && lockedDiagnostics.length > 0 ? (
                      lockedDiagnostics.map((id: string) => {
                        const diag = catDiagnosticos.find(d => d.id === id);
                        return (
                          <div key={id} className="bg-white border border-slate-200 text-slate-600 px-4 py-3 rounded-xl shadow-sm flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                            <span className="text-[11px] font-black uppercase tracking-widest">{diag ? diag.nombre : id}</span>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">NO HAY DIAGNÓSTICOS REGISTRADOS</p>
                    )}
                  </div>
                </div>
              )}

              {/* REPARACIONES PREVIAS (SOLO EN QC O POSTERIOR) */}
              {activeTab !== 'diagnostico' && activeTab !== 'reparacion' && (
                <div className="bg-slate-50 p-6 rounded-2xl shadow-sm border border-slate-200 mt-4">
                  <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-500 mb-4 flex flex-wrap items-center gap-2">
                    <Wrench className="w-4 h-4" />
                    Reparaciones Aplicadas (Bloqueado)
                    {lockedRepProfile && <span className="ml-auto text-[9px] font-black text-slate-100 bg-slate-800 px-3 py-1 rounded-full shadow-sm tracking-widest border border-slate-900">POR: {lockedRepProfile.toUpperCase()}</span>}
                  </h4>
                  <div className="flex flex-col gap-2">
                    {activeTab === 'reacondicionado' ? (
                      <div className="bg-white border border-blue-200 text-blue-700 px-4 py-3 rounded-xl shadow-sm flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                        <span className="text-[11px] font-black uppercase tracking-widest">MASTER RESET</span>
                      </div>
                    ) : lockedRepairs && lockedRepairs.length > 0 ? (
                      lockedRepairs.map((id: string) => {
                        const rep = catReparaciones.find(r => r.id === id);
                        return (
                          <div key={id} className="bg-white border border-blue-200 text-blue-700 px-4 py-3 rounded-xl shadow-sm flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                            <span className="text-[11px] font-black uppercase tracking-widest">{rep ? rep.nombre : id}</span>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">NO HAY REPARACIONES REGISTRADAS</p>
                    )}
                  </div>
                </div>
              )}

              {/* 4. FALLAS O REPARACIONES */}
              {(activeTab === 'diagnostico' || activeTab === 'reparacion') && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 transition-all">
                <button 
                  onClick={() => setIsDiagnosticsOpen(!isDiagnosticsOpen)}
                  className="w-full flex items-center justify-between group outline-none"
                >
                  <h4 className={`text-[11px] font-black uppercase tracking-[0.2em] flex items-center gap-2 ${activeTab === 'diagnostico' ? 'text-amber-500' : 'text-blue-500'}`}>
                    {activeTab === 'diagnostico' ? <AlertCircle className="w-4 h-4 group-hover:scale-110 transition-transform" /> : <Wrench className="w-4 h-4 group-hover:scale-110 transition-transform" />}
                    {activeTab === 'diagnostico' ? '4. Fallas Encontradas (Catálogo)' : '4. Reparaciones Aplicadas (Catálogo)'}
                  </h4>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isDiagnosticsOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {isDiagnosticsOpen && (() => {
                  const availableRepairs = (() => {
                    if (activeTab === 'diagnostico') return [];
                    if (!lockedDiagnostics || lockedDiagnostics.length === 0) return catReparaciones;
                    
                    const matchingDiags = catDiagnosticos.filter(d => lockedDiagnostics.includes(d.id));
                    const allowedRepairIds = new Set(matchingDiags.flatMap(d => d.reparacionesIds || []));
                    
                    if (allowedRepairIds.size > 0) {
                      return catReparaciones.filter(r => allowedRepairIds.has(r.id));
                    }
                    return catReparaciones;
                  })();
                  
                  const optionsList = activeTab === 'diagnostico' ? catDiagnosticos : availableRepairs;

                  return (
                  <div className="mt-6 border-t border-slate-100 pt-6 animate-in slide-in-from-top-2 fade-in duration-200">
                    <p className="text-[10px] font-bold text-slate-400 mb-4 uppercase tracking-widest">
                      {activeTab === 'diagnostico' ? 'Seleccione hasta 3 diagnósticos' : 'Seleccione hasta 3 reparaciones'}
                    </p>
                    
                    <div className="flex flex-col gap-4">
                      <select
                        className={`w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-black uppercase text-slate-700 outline-none shadow-sm ${activeTab === 'diagnostico' ? 'focus:border-amber-400' : 'focus:border-blue-400'}`}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val && !selectedDiagnostics.includes(val)) {
                            if (selectedDiagnostics.length < 3) {
                              setSelectedDiagnostics([...selectedDiagnostics, val]);
                            } else {
                              alert(`Solo puedes agregar un máximo de 3 ${activeTab === 'diagnostico' ? 'diagnósticos' : 'reparaciones'}.`);
                            }
                          }
                          e.target.value = ''; // reset
                        }}
                        defaultValue=""
                      >
                        <option value="" disabled>
                          {activeTab === 'diagnostico' ? 'SELECCIONAR FALLA DE LA LISTA...' : 'SELECCIONAR REPARACIÓN DE LA LISTA...'}
                        </option>
                        {optionsList.map(item => (
                          <option key={item.id} value={item.id} disabled={selectedDiagnostics.includes(item.id)}>
                            {item.nombre}
                          </option>
                        ))}
                      </select>

                      {optionsList.length === 0 && (
                         <span className="text-xs font-bold text-slate-400">
                           No hay {activeTab === 'diagnostico' ? 'diagnósticos' : 'reparaciones vinculadas'} configurados en el catálogo.
                         </span>
                      )}

                      <div className="flex flex-col gap-2">
                        {selectedDiagnostics.map(id => {
                          const item = optionsList.find(d => d.id === id);
                          if (!item) return null;
                          return (
                            <div key={id} className={`flex items-center justify-between border px-4 py-3 rounded-xl shadow-sm ${
                              activeTab === 'diagnostico' 
                                ? 'bg-amber-50 border-amber-200 text-amber-700' 
                                : 'bg-blue-50 border-blue-200 text-blue-700'
                            }`}>
                              <span className="text-[11px] font-black uppercase tracking-widest">{item.nombre}</span>
                              <button 
                                onClick={() => setSelectedDiagnostics(selectedDiagnostics.filter(sid => sid !== id))} 
                                className={`transition-colors ${activeTab === 'diagnostico' ? 'text-amber-500 hover:text-rose-500' : 'text-blue-500 hover:text-rose-500'}`}
                              >
                                <XCircle className="w-5 h-5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  );
                })()}
              </div>
              )}

              {/* FORMULARIO DE CONTROL DE CALIDAD */}
              {activeTab === 'qc' && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-purple-600 flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Detalle de Control de Calidad
                  </h4>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setQcEtiqueta('SI');
                      setQcSello('SI');
                      setQcChecklist('SI');
                      setQcLegible('SI');
                    }}
                    className="text-[10px] font-black uppercase tracking-wider text-purple-600 bg-purple-50 hover:bg-purple-100 px-4 py-2 rounded-xl transition-all border border-purple-200 shadow-sm hover:shadow active:scale-95 flex-shrink-0"
                  >
                    Marcar Todos SÍ
                  </button>
                </div>
                  
                  <div className="grid grid-cols-1 gap-4">
                    {/* Cambio de Etiqueta */}
                    <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 shadow-sm transition-colors hover:border-purple-200">
                      <span className="text-sm font-bold text-slate-700">Cambio de Etiqueta</span>
                      <div className="flex gap-2">
                        <button type="button" onClick={(e) => { e.preventDefault(); setQcEtiqueta('SI'); }} className={`w-16 py-2 rounded-xl text-xs font-black transition-all ${qcEtiqueta === 'SI' ? 'bg-purple-600 text-white shadow-md scale-105' : 'bg-slate-50 border border-slate-200 text-slate-400 hover:border-purple-300 hover:bg-white'}`}>SÍ</button>
                        <button type="button" onClick={(e) => { e.preventDefault(); setQcEtiqueta('NO'); }} className={`w-16 py-2 rounded-xl text-xs font-black transition-all ${qcEtiqueta === 'NO' ? 'bg-purple-600 text-white shadow-md scale-105' : 'bg-slate-50 border border-slate-200 text-slate-400 hover:border-purple-300 hover:bg-white'}`}>NO</button>
                      </div>
                    </div>
                    {/* Sello de Seguridad */}
                    <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 shadow-sm transition-colors hover:border-purple-200">
                      <span className="text-sm font-bold text-slate-700">Sello de Seguridad</span>
                      <div className="flex gap-2">
                        <button type="button" onClick={(e) => { e.preventDefault(); setQcSello('SI'); }} className={`w-16 py-2 rounded-xl text-xs font-black transition-all ${qcSello === 'SI' ? 'bg-purple-600 text-white shadow-md scale-105' : 'bg-slate-50 border border-slate-200 text-slate-400 hover:border-purple-300 hover:bg-white'}`}>SÍ</button>
                        <button type="button" onClick={(e) => { e.preventDefault(); setQcSello('NO'); }} className={`w-16 py-2 rounded-xl text-xs font-black transition-all ${qcSello === 'NO' ? 'bg-purple-600 text-white shadow-md scale-105' : 'bg-slate-50 border border-slate-200 text-slate-400 hover:border-purple-300 hover:bg-white'}`}>NO</button>
                      </div>
                    </div>
                    {/* Check List Funcional */}
                    <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 shadow-sm transition-colors hover:border-purple-200">
                      <span className="text-sm font-bold text-slate-700">Check List</span>
                      <div className="flex gap-2">
                        <button type="button" onClick={(e) => { e.preventDefault(); setQcChecklist('SI'); }} className={`w-16 py-2 rounded-xl text-xs font-black transition-all ${qcChecklist === 'SI' ? 'bg-purple-600 text-white shadow-md scale-105' : 'bg-slate-50 border border-slate-200 text-slate-400 hover:border-purple-300 hover:bg-white'}`}>SÍ</button>
                        <button type="button" onClick={(e) => { e.preventDefault(); setQcChecklist('NO'); }} className={`w-16 py-2 rounded-xl text-xs font-black transition-all ${qcChecklist === 'NO' ? 'bg-purple-600 text-white shadow-md scale-105' : 'bg-slate-50 border border-slate-200 text-slate-400 hover:border-purple-300 hover:bg-white'}`}>NO</button>
                      </div>
                    </div>
                    {/* Datos Legibles */}
                    <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 shadow-sm transition-colors hover:border-purple-200">
                      <span className="text-sm font-bold text-slate-700">Datos Legibles</span>
                      <div className="flex gap-2">
                        <button type="button" onClick={(e) => { e.preventDefault(); setQcLegible('SI'); }} className={`w-16 py-2 rounded-xl text-xs font-black transition-all ${qcLegible === 'SI' ? 'bg-purple-600 text-white shadow-md scale-105' : 'bg-slate-50 border border-slate-200 text-slate-400 hover:border-purple-300 hover:bg-white'}`}>SÍ</button>
                        <button type="button" onClick={(e) => { e.preventDefault(); setQcLegible('NO'); }} className={`w-16 py-2 rounded-xl text-xs font-black transition-all ${qcLegible === 'NO' ? 'bg-purple-600 text-white shadow-md scale-105' : 'bg-slate-50 border border-slate-200 text-slate-400 hover:border-purple-300 hover:bg-white'}`}>NO</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* FORMULARIO DE REACONDICIONADO */}
              {activeTab === 'reacondicionado' && (() => {
                const currentTechName = selectedForOperation?.tecnologia;
                const currentModelName = selectedForOperation?.modelo;

                const currentTech = catTecnologias.find(t => t.name === currentTechName);
                const currentModel = catModelos.find(m => m.name === currentModelName);

                const REACOND_OPTIONS = catReacondicionadoTests
                  .filter(rt => {
                     if (rt.technology_ids?.length > 0 && currentTech && !rt.technology_ids.includes(currentTech.id)) return false;
                     if (rt.model_ids?.length > 0 && currentModel && !rt.model_ids.includes(currentModel.id)) return false;
                     return true;
                  })
                  .map(rt => rt.name);

                return (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
                  <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-600 flex items-center gap-2 mb-6">
                    <RefreshCw className="w-4 h-4" />
                    Pruebas de Reacondicionado
                  </h4>
                  
                  <div className="flex flex-col gap-4">
                    <div className="flex gap-2">
                      <select
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-black uppercase text-slate-700 outline-none shadow-sm focus:border-emerald-400"
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val && !reacondTests.includes(val)) {
                            setReacondTests([...reacondTests, val]);
                          }
                          e.target.value = ''; // reset
                        }}
                        defaultValue=""
                      >
                        <option value="" disabled>SELECCIONAR PRUEBA REALIZADA...</option>
                        {REACOND_OPTIONS.map(item => (
                          <option key={item} value={item} disabled={reacondTests.includes(item)}>
                            {item}
                          </option>
                        ))}
                      </select>
                      <button 
                        onClick={() => setReacondTests(REACOND_OPTIONS)}
                        className="shrink-0 bg-emerald-500 text-white hover:bg-emerald-600 font-black uppercase tracking-widest text-[10px] px-6 rounded-xl transition-all shadow-sm shadow-emerald-500/20 flex items-center justify-center"
                      >
                        Cargar Todas
                      </button>
                    </div>

                    <div className="flex flex-col gap-2">
                      {reacondTests.map(test => (
                        <div key={test} className="flex items-center justify-between border px-4 py-3 rounded-xl shadow-sm bg-emerald-50 border-emerald-200 text-emerald-700">
                          <span className="text-[11px] font-black uppercase tracking-widest">{test}</span>
                          <button 
                            onClick={() => setReacondTests(reacondTests.filter(t => t !== test))} 
                            className="transition-colors text-emerald-500 hover:text-rose-500"
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                      {reacondTests.length === 0 && (
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">No se han seleccionado pruebas.</p>
                      )}
                    </div>
                  </div>
                </div>
              )})()}

              {/* Observaciones Técnicas */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                <label className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-500 flex items-center gap-2">Observaciones Técnicas</label>
                <textarea 
                  value={diagnosticNotes}
                  onChange={(e) => setDiagnosticNotes(e.target.value)}
                  className="w-full h-32 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-medium text-slate-700 outline-none focus:border-amber-400 shadow-sm resize-none"
                  placeholder="Detalle hallazgos, componentes a cambiar o anomalías detectadas..."
                />
              </div>
            </div>

            <div className="p-8 border-t border-slate-100 bg-white shrink-0 space-y-8">
              {/* 1. RESULTADO DE EVALUACIÓN AL FINAL */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h4 className={`text-[11px] font-black uppercase tracking-[0.2em] mb-6 flex items-center gap-2 ${activeTab === 'qc' ? 'text-purple-600' : 'text-amber-500'}`}>
                  <Activity className="w-4 h-4" />
                  1. Resultado de Evaluación
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {(activeTab === 'qc' ? [
                    { label: 'ACEPTADO (ENVIADO A EQUIPO LISTO)', value: 'listo', variant: 'text-emerald-600 border-emerald-500/30 hover:border-emerald-500 hover:bg-emerald-50 col-span-2' },
                    { label: 'EQUIPO RECHAZADO (DEVOLVER AL TÉCNICO)', value: 'rechazado_qc', variant: 'text-rose-600 border-rose-500/30 hover:border-rose-500 hover:bg-rose-50 col-span-2' },
                  ] : activeTab === 'reparacion' ? [
                    { label: 'Control de Calidad', value: 'control_calidad', variant: 'text-purple-600 border-purple-500/30 hover:border-purple-500 hover:bg-purple-50' },
                    { label: 'Reacondicionado', value: 'reacondicionado', variant: 'text-emerald-600 border-emerald-500/30 hover:border-emerald-500 hover:bg-emerald-50' },
                    { label: 'L3 Avanzado', value: 'l3', variant: 'text-orange-600 border-orange-500/30 hover:border-orange-500 hover:bg-orange-50' },
                    { label: 'Scraps', value: 'scraps', variant: 'text-rose-600 border-rose-500/30 hover:border-rose-500 hover:bg-rose-50' }
                  ] : activeTab === 'reacondicionado' ? [
                    { label: 'Equipo Listo', value: 'listo', variant: 'text-emerald-600 border-emerald-500/30 hover:border-emerald-500 hover:bg-emerald-50' },
                    { label: 'Control de Calidad QC', value: 'control_calidad', variant: 'text-purple-600 border-purple-500/30 hover:border-purple-500 hover:bg-purple-50' },
                    { label: 'Reparación (L1/L2)', value: 'reparacion', variant: 'text-blue-600 border-blue-500/30 hover:border-blue-500 hover:bg-blue-50' },
                    { label: 'Reparación L3', value: 'l3', variant: 'text-orange-600 border-orange-500/30 hover:border-orange-500 hover:bg-orange-50' },
                    { label: 'Scraps', value: 'scraps', variant: 'text-rose-600 border-rose-500/30 hover:border-rose-500 hover:bg-rose-50' }
                  ] : [
                    { label: 'Reacondicionar', value: 'reacondicionado', variant: 'text-emerald-600 border-emerald-500/30 hover:border-emerald-500 hover:bg-emerald-50' },
                    { label: 'Reparación L1/L2', value: 'reparacion', variant: 'text-blue-600 border-blue-500/30 hover:border-blue-500 hover:bg-blue-50' },
                    { label: 'Nivel 3', value: 'l3', variant: 'text-orange-600 border-orange-500/30 hover:border-orange-500 hover:bg-orange-50' },
                    { label: 'SCRAPS', value: 'scraps', variant: 'text-rose-600 border-rose-500/30 hover:border-rose-500 hover:bg-rose-50' },
                  ]).map((res) => (
                    <button 
                      key={res.value} 
                      onClick={() => setDiagnosticResult(res.value)}
                      className={`p-4 rounded-xl border-2 text-center transition-all ${res.variant} ${diagnosticResult === res.value ? 'bg-current/10 border-current shadow-md scale-[1.02]' : 'bg-transparent'}`}
                    >
                      <p className="text-[10px] font-black uppercase leading-tight">{res.label}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-4">
              <Button 
                variant="outline" 
                className="flex-1 h-14 font-black uppercase tracking-widest text-[10px]" 
                onClick={() => {
                  setSelectedForOperation(null);
                  setDiagnosticResult(null);
                  setDiagnosticNotes('');
                  setFunctionalChecks({});
                  setCosmeticClass(null);
                  setLabelStatus(null);
                  setSelectedDiagnostics([]);
                }}
              >
                Cancelar
              </Button>
              <Button 
                variant="primary" 
                className="flex-2 h-14 font-black uppercase tracking-widest text-[10px] bg-[#181c3a] shadow-xl shadow-[#181c3a]/20" 
                disabled={
                  loading || 
                  !diagnosticResult || 
                  (activeTab === 'diagnostico' && (!cosmeticClass || !labelStatus || selectedDiagnostics.length === 0))
                }
                onClick={handleCompleteOperation}
              >
                {loading ? <Loader2 className="animate-spin" /> : `Guardar ${activeTab === 'diagnostico' ? 'Diagnóstico' : activeTab === 'reparacion' ? 'Reparación' : 'Operación'} y Finalizar`}
              </Button>
            </div>
            </div>
          </Card>
        </div>
      )}
      {/* Modal de Historial */}
      {historyModalOpen.isOpen && historyModalOpen.item && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#181c3a]/40 backdrop-blur-sm p-6">
          <Card className="max-w-2xl w-full shadow-2xl animate-rise-in p-0 overflow-hidden flex flex-col">
            <div className={`p-8 text-white flex justify-between items-center shrink-0 ${
              activeTab === 'diagnostico' ? 'bg-amber-500' :
              activeTab === 'reparacion' ? 'bg-blue-500' :
              activeTab === 'reacondicionado' ? 'bg-emerald-500' :
              activeTab === 'qc' ? 'bg-purple-500' :
              activeTab === 'l3' ? 'bg-orange-500' :
              activeTab === 'scraps' ? 'bg-rose-500' :
              activeTab === 'listo' ? 'bg-teal-500' :
              'bg-[#181c3a]'
            }`}>
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-white/20 backdrop-blur-sm">
                  <History className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="blue" className="font-black text-[9px] uppercase border-none text-white bg-white/20 backdrop-blur-sm">
                      {historyModalOpen.item.id}
                    </Badge>
                  </div>
                  <h3 className="text-2xl font-black">Historial de Operaciones</h3>
                  <span className="text-white/90 font-mono text-sm">{historyModalOpen.item.sn}</span>
                </div>
              </div>
              <button onClick={() => setHistoryModalOpen({isOpen: false, item: null})} className="text-white/80 hover:text-white transition-colors">
                <XCircle size={32} strokeWidth={1.5} />
              </button>
            </div>
            
            <div className="p-8 space-y-6 overflow-y-auto max-h-[60vh]">
              <div className="relative pl-6 border-l-2 border-slate-100 space-y-8">
                {loadingHistory ? (
                  <div className="py-10 text-center">
                    <Loader2 className="w-8 h-8 text-[#2ec4f1] animate-spin mx-auto" />
                    <p className="text-[10px] font-black text-slate-400 uppercase mt-4 tracking-widest">Cargando historial...</p>
                  </div>
                ) : historyItems.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No hay historial registrado.</p>
                  </div>
                ) : (
                  historyItems.map((record: any) => {
                    const isDiagnostic = record.action === 'DIAGNÓSTICO INICIAL COMPLETADO';
                    const payload = record.payload || {};
                    return (
                      <div className="relative" key={record.id}>
                        <div className={`absolute -left-[33px] top-1 bg-white border-2 rounded-full p-1 ${isDiagnostic ? 'border-amber-500' : 'border-blue-500'}`}>
                          {isDiagnostic ? (
                            <Stethoscope className={`w-3 h-3 text-amber-500`} />
                          ) : (
                            <Activity className={`w-3 h-3 text-blue-500`} />
                          )}
                        </div>
                        <div>
                          <h4 className="text-sm font-black text-[#181c3a] uppercase">{record.action}</h4>
                          <p className="text-[10px] font-bold text-slate-400 mt-1">
                            {new Date(record.changed_at).toLocaleString()} • POR {record.profiles?.full_name?.toUpperCase() || 'SISTEMA'}
                          </p>
                          <div className="mt-3 bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs text-slate-600">
                            {isDiagnostic || record.action.includes('COMPLETAD') ? (
                              <>
                                {payload.result && (
                                  <p><strong>Resultado:</strong> {
                                    payload.result === 'reparacion' ? 'Reparación (L1/L2)' :
                                    payload.result === 'reacondicionado' ? 'Reacondicionado' :
                                    payload.result === 'l3' ? 'Falla Mayor (L3)' :
                                    payload.result === 'scraps' ? 'Scrap / Desecho' :
                                    payload.result === 'control_calidad' ? 'Control de Calidad QC' :
                                    payload.result === 'listo' ? 'Aceptado / Listo' :
                                    payload.result === 'rechazado_qc' ? 'Rechazado en QC' :
                                    payload.result
                                  }</p>
                                )}
                                {payload.notes && <p className="mt-1 whitespace-pre-wrap"><strong>Notas:</strong> {payload.notes}</p>}
                                {(payload.items?.length > 0 || payload.repairs?.length > 0) && (
                                  <div className="mt-2">
                                    <p><strong>{record.action.includes('REPARACIÓN') ? 'Reparaciones' : 'Fallas / Items'} reportadas:</strong></p>
                                    <ul className="list-disc ml-5 mt-1">
                                      {(payload.items || payload.repairs).map((id: string) => {
                                        const c = catDiagnosticos.find(d => d.id === id) || catReparaciones.find(r => r.id === id);
                                        return <li key={id}>{c ? c.nombre : id}</li>;
                                      })}
                                    </ul>
                                  </div>
                                )}
                                {payload.nextStatus && (
                                  <div className="mt-4">
                                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#181c3a] text-white text-[11px] font-black tracking-widest shadow-md">
                                      <span className="text-white/60">DERIVADO A:</span>
                                      {
                                        payload.nextStatus === 'in_workshop' ? 'DIAGNÓSTICO' :
                                        payload.nextStatus === 'in_qc' ? 'REPARACIÓN' :
                                        payload.nextStatus === 'in_validation' ? 'CONTROL DE CALIDAD' :
                                        payload.nextStatus === 'in_control_warehouse' ? 'L3' :
                                        payload.nextStatus === 'ready_to_dispatch' ? 'REACONDICIONADO' :
                                        payload.nextStatus === 'scrapped' || payload.nextStatus === 'irreparable' ? 'SCRAPS' :
                                        payload.nextStatus === 'in_central_warehouse' ? 'EQUIPO LISTO' :
                                        payload.nextStatus
                                      }
                                    </span>
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="space-y-3">
                                {payload.reason && <p className="text-sm"><strong>Motivo/Razón:</strong> {payload.reason}</p>}
                                {payload.status && (
                                  <div>
                                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#181c3a] text-white text-[11px] font-black tracking-widest shadow-md">
                                      <span className="text-white/60">NUEVO ESTADO:</span>
                                      {
                                        payload.status === 'in_workshop' ? 'DIAGNÓSTICO' :
                                        payload.status === 'in_qc' ? 'REPARACIÓN' :
                                        payload.status === 'in_validation' ? 'CONTROL DE CALIDAD' :
                                        payload.status === 'in_control_warehouse' ? 'L3' :
                                        payload.status === 'ready_to_dispatch' ? 'REACONDICIONADO' :
                                        payload.status === 'scrapped' || payload.status === 'irreparable' ? 'SCRAPS' :
                                        payload.status === 'in_central_warehouse' ? 'EQUIPO LISTO' :
                                        payload.status.toUpperCase()
                                      }
                                    </span>
                                  </div>
                                )}
                                {Object.keys(payload).filter(k => k !== 'reason' && k !== 'status').map(k => (
                                  <p key={k}><strong>{k}:</strong> {String(payload[k])}</p>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* MODAL DE DETALLE DE SERIE */}
      {showItemDetail && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#181c3a]/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl border-none overflow-hidden animate-rise-in p-0">
            <div className={`p-8 border-b border-white/10 flex justify-between items-center text-white ${
              activeTab === 'diagnostico' ? 'bg-amber-500' :
              activeTab === 'reparacion' ? 'bg-blue-500' :
              activeTab === 'reacondicionado' ? 'bg-emerald-500' :
              activeTab === 'qc' ? 'bg-purple-500' :
              activeTab === 'l3' ? 'bg-orange-500' :
              activeTab === 'scraps' ? 'bg-rose-500' :
              activeTab === 'listo' ? 'bg-teal-500' :
              'bg-[#181c3a]'
            }`}>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white bg-white/20 backdrop-blur-sm">
                  <Box size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="blue" className="font-black text-[9px] uppercase border-none text-white bg-white/20 backdrop-blur-sm">
                      {showItemDetail.id}
                    </Badge>
                  </div>
                  <h3 className="text-2xl font-black text-white">Detalle de Equipo</h3>
                </div>
              </div>
              <button onClick={() => setShowItemDetail(null)} className="text-white/80 hover:text-white transition-colors">
                <XCircle size={32} strokeWidth={1.5} />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">SN Principal</p>
                  <p className="text-sm font-mono font-bold text-[#181c3a]">{showItemDetail.sn}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Marca / Modelo</p>
                  <p className="text-sm font-black text-[#181c3a] uppercase">{showItemDetail.marca} {showItemDetail.modelo}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tecnología</p>
                  <p className="text-sm font-black text-[#181c3a] uppercase">{showItemDetail.tecnologia}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total de Series</p>
                  <p className="text-sm font-black text-[#181c3a]">{showItemDetail.total_series}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Canal de Ingreso</p>
                  <p className="text-sm font-black text-[#181c3a] uppercase">{showItemDetail.courier}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Sucursal / Agencia</p>
                  <p className="text-sm font-black text-[#181c3a] uppercase">{showItemDetail.agencia}</p>
                </div>
                <div className="col-span-2 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Guía de Ingreso</p>
                  <p className="text-sm font-black text-[#181c3a] uppercase">{showItemDetail.guide}</p>
                </div>
              </div>

              {showItemDetail.all_sns && showItemDetail.all_sns.length > 1 && (
                <div>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Todas las Series Registradas</h4>
                  <div className="flex flex-wrap gap-2">
                    {showItemDetail.all_sns.map((s: string, i: number) => (
                      <span key={i} className="px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-lg text-xs font-mono font-bold">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ===== MODAL DESPACHO SCRAPS (FULL FEATURED) ===== */}
      {scrapDispatchModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#181c3a]/60 backdrop-blur-sm p-4">
          <div className="max-w-4xl w-full bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-rise-in">

            {/* ── Header ── */}
            <div className="bg-gradient-to-r from-rose-600 to-rose-400 p-6 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className="bg-white/20 p-3 rounded-2xl">
                  <Package className="w-7 h-7 text-white" />
                </div>
                <div>
                  <p className="text-[9px] font-black text-white/60 uppercase tracking-[0.25em]">Taller · Producción</p>
                  <h2 className="text-2xl font-black text-white">Despacho SCRAP</h2>
                  <p className="text-[11px] text-white/70 mt-0.5">
                    {filteredTasks.length} equipo(s) en cola SCRAP · {scrapScannedItems.length} seleccionado(s) para despacho
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setScrapDispatchModal({isOpen: false, item: null});
                  setScrapScannedItems([]);
                  setScrapScanInput('');
                  setScrapScanError('');
                  setScrapBoxStep('crear_caja');
                  setScrapBoxMarca('');
                  setScrapBoxModelo('');
                  setScrapBoxTecnologia('');
                  setScrapBoxCantidad('');
                  setScrapGuideNumber('');
                }}
                className="text-white/70 hover:text-white p-2 hover:bg-white/20 rounded-xl transition-all"
              ><X className="w-5 h-5" /></button>
            </div>

            {/* ── Sub-nav (solo visible en paso despacho) ── */}
            {scrapBoxStep === 'despacho' && (
              <div className="flex gap-1 px-6 pt-4 pb-0 bg-slate-50 border-b border-slate-100 shrink-0">
                {([['resumen', BarChart3, 'Resumen SCRAP'], ['pistolero', ScanLine, 'Pistolero / Scanner']] as const).map(([view, Icon, label]) => (
                  <button
                    key={view}
                    onClick={() => setScrapActiveView(view)}
                    className={`flex items-center gap-2 px-5 py-3 text-[10px] font-black uppercase tracking-widest rounded-t-xl transition-all ${
                      scrapActiveView === view
                        ? 'bg-white border-2 border-b-white border-slate-100 text-rose-600 -mb-px z-10'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <Icon className="w-4 h-4" />{label}
                    {view === 'pistolero' && scrapScannedItems.length > 0 && (
                      <span className="ml-1 px-2 py-0.5 bg-rose-500 text-white rounded-full text-[9px] font-black">{scrapScannedItems.length}</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto">

              {/* ── PASO 1: CREAR CAJA ── */}
              {scrapBoxStep === 'crear_caja' && (
                <div className="p-8 space-y-6">
                  {/* Título paso */}
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center text-sm font-black">1</div>
                    <div>
                      <h3 className="text-sm font-black text-[#181c3a] uppercase tracking-wider">Detalle de la Caja</h3>
                      <p className="text-[10px] text-slate-400 font-medium">Ingresa los datos del lote a despachar antes de escanear</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Marca */}
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">
                        Marca <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={scrapBoxMarca}
                        onChange={e => { setScrapBoxMarca(e.target.value); setScrapBoxModelo(''); }}
                        className="w-full px-4 py-3.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-rose-400 transition-colors appearance-none cursor-pointer"
                      >
                        <option value="">Seleccionar marca...</option>
                        {catMarcas.map((m: any) => (
                          <option key={m.id} value={m.name}>{m.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Modelo */}
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">
                        Modelo <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={scrapBoxModelo}
                        onChange={e => setScrapBoxModelo(e.target.value)}
                        className="w-full px-4 py-3.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-rose-400 transition-colors appearance-none cursor-pointer disabled:opacity-50"
                        disabled={!scrapBoxMarca}
                      >
                        <option value="">{scrapBoxMarca ? 'Seleccionar modelo...' : 'Primero selecciona una marca'}</option>
                        {catModelos
                          .filter((m: any) => {
                            if (!scrapBoxMarca) return true;
                            const marca = catMarcas.find((b: any) => b.name === scrapBoxMarca);
                            return marca ? m.brand_id === marca.id : true;
                          })
                          .map((m: any) => (
                            <option key={m.id} value={m.name}>{m.name}</option>
                          ))
                        }
                      </select>
                    </div>

                    {/* Tecnología */}
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">
                        Tecnología <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={scrapBoxTecnologia}
                        onChange={e => setScrapBoxTecnologia(e.target.value)}
                        className="w-full px-4 py-3.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-rose-400 transition-colors appearance-none cursor-pointer"
                      >
                        <option value="">Seleccionar tecnología...</option>
                        {catTecnologias.map((t: any) => (
                          <option key={t.id} value={t.name}>{t.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Cantidad */}
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">
                        Cantidad <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={scrapBoxCantidad}
                        onChange={e => setScrapBoxCantidad(e.target.value === '' ? '' : parseInt(e.target.value))}
                        placeholder="Ej: 10"
                        className="w-full px-4 py-3.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-rose-400 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Resumen visual */}
                  {(scrapBoxMarca || scrapBoxModelo || scrapBoxTecnologia || scrapBoxCantidad) && (
                    <div className="bg-rose-50 border-2 border-rose-100 rounded-2xl p-5 flex flex-wrap gap-4">
                      {scrapBoxMarca && (
                        <div>
                          <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest">Marca</p>
                          <p className="text-sm font-black text-[#181c3a]">{scrapBoxMarca}</p>
                        </div>
                      )}
                      {scrapBoxModelo && (
                        <div>
                          <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest">Modelo</p>
                          <p className="text-sm font-black text-[#181c3a]">{scrapBoxModelo}</p>
                        </div>
                      )}
                      {scrapBoxTecnologia && (
                        <div>
                          <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest">Tecnología</p>
                          <p className="text-sm font-black text-[#181c3a]">{scrapBoxTecnologia}</p>
                        </div>
                      )}
                      {scrapBoxCantidad !== '' && (
                        <div>
                          <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest">Cantidad</p>
                          <p className="text-sm font-black text-[#181c3a]">{scrapBoxCantidad} unidades</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Botón continuar */}
                  <button
                    onClick={() => {
                      if (!scrapBoxMarca || !scrapBoxModelo || !scrapBoxTecnologia || scrapBoxCantidad === '') {
                        alert('Por favor completa todos los campos: Marca, Modelo, Tecnología y Cantidad.');
                        return;
                      }
                      // Autogenerar conduce al crear la caja
                      setScrapGuideNumber(generateConduceNumber());
                      setScrapBoxStep('despacho');
                      setScrapActiveView('pistolero');
                    }}
                    className="w-full py-4 rounded-2xl bg-rose-500 hover:bg-rose-600 text-white font-black text-sm uppercase tracking-widest transition-all shadow-lg shadow-rose-500/25 flex items-center justify-center gap-3 active:scale-[0.99]"
                  >
                    <Layers className="w-5 h-5" />
                    Crear Caja y Continuar
                  </button>
                </div>
              )}

              {/* VIEW: RESUMEN */}
              {scrapBoxStep === 'despacho' && scrapActiveView === 'resumen' && (() => {
                // Group filteredTasks by marca+modelo+tecnologia
                const groups: Record<string, {marca: string, modelo: string, tecnologia: string, cantidad: number, items: any[]}> = {};
                filteredTasks.forEach(t => {
                  const key = `${t.marca}||${t.modelo}||${t.tecnologia}`;
                  if (!groups[key]) groups[key] = { marca: t.marca, modelo: t.modelo, tecnologia: t.tecnologia, cantidad: 0, items: [] };
                  groups[key].cantidad += (t.all_sns?.length || 1);
                  groups[key].items.push(t);
                });
                const groupList = Object.values(groups);
                return (
                  <div className="p-6 space-y-5">
                    {filteredTasks.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Trash2 className="w-12 h-12 text-rose-200 mb-4" />
                        <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Sin equipos en SCRAP</p>
                        <p className="text-xs text-slate-300 mt-1">Los equipos marcados como irreparables aparecerán aquí</p>
                      </div>
                    ) : (
                      <>
                        {/* Tabla agrupada */}
                        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                          <table className="w-full">
                            <thead className="bg-rose-500">
                              <tr>
                                {['Marca', 'Modelo', 'Tecnología', 'Cantidad', 'Series'].map(h => (
                                  <th key={h} className="px-5 py-4 text-left text-[9px] font-black uppercase tracking-widest text-white">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {groupList.map((g, i) => (
                                <tr key={i} className="hover:bg-rose-50/30 transition-colors">
                                  <td className="px-5 py-4">
                                    <span className="text-xs font-black text-[#181c3a] uppercase">{g.marca}</span>
                                  </td>
                                  <td className="px-5 py-4">
                                    <span className="text-xs font-bold text-slate-600 uppercase">{g.modelo}</span>
                                  </td>
                                  <td className="px-5 py-4">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">{g.tecnologia}</span>
                                  </td>
                                  <td className="px-5 py-4">
                                    <span className="inline-flex items-center justify-center w-8 h-8 bg-rose-100 text-rose-700 rounded-xl text-sm font-black">{g.cantidad}</span>
                                  </td>
                                  <td className="px-5 py-4">
                                    <div className="flex flex-wrap gap-1">
                                      {g.items.flatMap(it => it.all_sns || [it.sn]).slice(0,3).map((sn: string, si: number) => (
                                        <span key={si} className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-mono">{sn}</span>
                                      ))}
                                      {g.cantidad > 3 && <span className="px-2 py-0.5 bg-rose-100 text-rose-500 rounded text-[9px] font-bold">+{g.cantidad - 3}</span>}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-slate-50 border-t border-slate-100">
                              <tr>
                                <td colSpan={3} className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">TOTAL</td>
                                <td className="px-5 py-3">
                                  <span className="inline-flex items-center justify-center w-8 h-8 bg-rose-500 text-white rounded-xl text-sm font-black">
                                    {filteredTasks.reduce((a, t) => a + (t.all_sns?.length || 1), 0)}
                                  </span>
                                </td>
                                <td />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold text-center">Usa el tab <span className="text-rose-500">Pistolero / Scanner</span> para seleccionar y despachar</p>
                      </>
                    )}
                  </div>
                );
              })()}

              {/* VIEW: PISTOLERO */}
              {scrapBoxStep === 'despacho' && scrapActiveView === 'pistolero' && (
                <div className="p-6 grid grid-cols-2 gap-5 h-full">

                  {/* LEFT: Escáner de Series + Progreso */}
                  <div className="space-y-5">

                    {/* Escáner card */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                      <h3 className="text-sm font-black text-[#181c3a]">Escáner de Series</h3>

                      {/* Campo SN único */}
                      <div>
                        <div className="flex justify-between mb-1">
                          <label className="text-xs font-black text-slate-700">SN <span className="text-rose-500">*</span></label>
                          <span className="text-[10px] font-bold text-slate-400">Max: 15</span>
                        </div>
                        <input
                          id="scrap-sn-input"
                          autoFocus
                          type="text"
                          maxLength={15}
                          value={scrapScanSN}
                          onChange={e => { setScrapScanSN(e.target.value.toUpperCase()); setScrapScanError(''); }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              const snVal = scrapScanSN.trim().toUpperCase();
                              if (!snVal) { setScrapScanError('El SN es obligatorio'); return; }
                              if (scrapScannedItems.find(i => i.sn === snVal)) { setScrapScanError(`"${snVal}" ya fue registrado en esta caja`); setScrapScanSN(''); return; }
                              // Validar que el SN esté en cola SCRAP
                              const found = filteredTasks.find(t =>
                                (t.all_sns || [t.sn]).map((s: string) => s.toUpperCase()).includes(snVal)
                              );
                              if (!found) {
                                setScrapScanError(`"${snVal}" no está en estatus SCRAP — solo se pueden despachar equipos en cola SCRAP`);
                                return;
                              }
                              const idx = scrapScannedItems.length;
                              setScrapScannedItems(prev => [...prev, {
                                num: idx + 1,
                                sn: snVal,
                                os: found.id,
                                marca: found.marca,
                                modelo: found.modelo,
                                dbId: found.dbId,
                                all_dbIds: found.all_dbIds,
                                usuario: 'Actual'
                              }]);
                              setScrapScanSN('');
                              setScrapScanError('');
                              document.getElementById('scrap-sn-input')?.focus();
                            }
                          }}
                          placeholder="Escanear SN (15 dig)..."
                          className={`w-full px-4 py-3 border rounded-xl text-sm font-mono font-bold outline-none transition-colors ${
                            scrapScanError ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-white focus:border-rose-400'
                          }`}
                        />
                        <div className="flex justify-end mt-1">
                          <span className="text-[10px] font-bold text-slate-400">{scrapScanSN.length} / 15</span>
                        </div>
                      </div>

                      {/* Error */}
                      {scrapScanError && (
                        <p className="text-[10px] font-black text-rose-500 flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5" />{scrapScanError}
                        </p>
                      )}

                      {/* Botón registrar */}
                      <button
                        onClick={() => {
                          const snVal = scrapScanSN.trim().toUpperCase();
                          if (!snVal) { setScrapScanError('El SN es obligatorio'); return; }
                          if (scrapScannedItems.find(i => i.sn === snVal)) { setScrapScanError(`"${snVal}" ya fue registrado en esta caja`); setScrapScanSN(''); return; }
                          // Validar que el SN esté en cola SCRAP
                          const found = filteredTasks.find(t =>
                            (t.all_sns || [t.sn]).map((s: string) => s.toUpperCase()).includes(snVal)
                          );
                          if (!found) {
                            setScrapScanError(`"${snVal}" no está en estatus SCRAP — solo se pueden despachar equipos en cola SCRAP`);
                            return;
                          }
                          const idx = scrapScannedItems.length;
                          setScrapScannedItems(prev => [...prev, {
                            num: idx + 1,
                            sn: snVal,
                            os: found.id,
                            marca: found.marca,
                            modelo: found.modelo,
                            dbId: found.dbId,
                            all_dbIds: found.all_dbIds,
                            usuario: 'Actual'
                          }]);
                          setScrapScanSN('');
                          setScrapScanError('');
                          document.getElementById('scrap-sn-input')?.focus();
                        }}
                        className="w-full py-3.5 bg-[#181c3a] hover:bg-[#232848] text-white font-black text-sm rounded-xl transition-all active:scale-[0.99] tracking-wider"
                      >
                        Registrar Equipo (Enter)
                      </button>
                    </div>

                    {/* Progreso de la Caja */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-black text-slate-500">Progreso de la Caja</h3>
                      </div>
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-3xl font-black text-[#181c3a]">{scrapScannedItems.length}</span>
                        <span className="text-sm font-bold text-slate-400">/ {scrapBoxCantidad || '—'} equipos</span>
                      </div>
                      {/* Barra de progreso */}
                      <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: scrapBoxCantidad
                              ? `${Math.min(100, (scrapScannedItems.length / (scrapBoxCantidad as number)) * 100)}%`
                              : '0%',
                            background: scrapScannedItems.length >= (scrapBoxCantidad as number)
                              ? 'linear-gradient(90deg,#10b981,#34d399)'
                              : 'linear-gradient(90deg,#f43f5e,#fb7185)'
                          }}
                        />
                      </div>
                      {typeof scrapBoxCantidad === 'number' && scrapScannedItems.length >= scrapBoxCantidad && scrapBoxCantidad > 0 && (
                        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mt-2 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Caja completa
                        </p>
                      )}
                    </div>
                  </div>

                  {/* RIGHT: Tabla Contenido de la Caja */}
                  <div className="flex flex-col h-full">
                    <h3 className="text-sm font-black text-[#181c3a] mb-3">Contenido de la Caja</h3>

                    {/* Tabla */}
                    <div className="flex-1 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                      {scrapScannedItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-center">
                          <ScanLine className="w-10 h-10 text-rose-200 mb-3" />
                          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Registra equipos con el escáner</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto overflow-y-auto max-h-[420px] custom-scrollbar">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-white border-b border-slate-100 z-10">
                              <tr>
                                <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">#</th>
                                <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">SAP</th>
                                <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">SN</th>
                                <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">Usuario</th>
                                <th className="w-8" />
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {[...scrapScannedItems].reverse().map((sc, i) => (
                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-3 py-3">
                                    <span className="text-[10px] font-black text-slate-400">{scrapScannedItems.length - i}</span>
                                  </td>
                                  <td className="px-3 py-3">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-black">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                                      OK (SN)
                                    </span>
                                  </td>
                                  <td className="px-3 py-3">
                                    <span className="text-xs font-black text-emerald-600 font-mono">{sc.sn}</span>
                                  </td>
                                  <td className="px-3 py-3">
                                    <span className="text-[10px] font-bold text-slate-500">{sc.usuario || 'Actual'}</span>
                                  </td>
                                  <td className="px-3 py-3">
                                    <button
                                      onClick={() => setScrapScannedItems(prev => prev.filter((_, idx) => idx !== (scrapScannedItems.length - 1 - i)))}
                                      className="text-slate-300 hover:text-rose-400 transition-colors p-1 rounded-lg hover:bg-rose-50"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              )}

              {/* Conduce + Notas + Botón — visible en paso despacho debajo del pistolero */}
              {scrapBoxStep === 'despacho' && (
                <div className="px-6 pb-6 space-y-3">
                  {/* Conduce de Salida de Scraps */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                        Conduce de Salida de Scraps <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setScrapGuideNumber(generateConduceNumber())}
                        className="text-[9px] font-black text-rose-500 hover:text-rose-700 uppercase tracking-widest flex items-center gap-1 transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Regenerar
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={scrapGuideNumber}
                        onChange={e => setScrapGuideNumber(e.target.value)}
                        placeholder="CS-SCRAP-2026-001"
                        className="w-full pl-4 pr-28 py-3 bg-rose-50 border-2 border-rose-200 rounded-xl text-sm font-black text-rose-700 outline-none focus:border-rose-400 transition-colors font-mono tracking-wider"
                      />
                      {scrapGuideNumber && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[9px] font-black text-rose-400 uppercase tracking-widest">
                          <CheckCircle2 className="w-3.5 h-3.5 text-rose-400" />
                          Generado
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Notas */}
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Notas</label>
                    <textarea
                      value={scrapNotes}
                      onChange={e => setScrapNotes(e.target.value)}
                      placeholder="Destino, proveedor de reciclaje..."
                      rows={2}
                      className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-rose-400 transition-colors resize-none"
                    />
                  </div>

                  {/* Botón confirmar */}
                  <Button
                    variant="primary"
                    className="w-full bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20 font-black py-4"
                    rightIcon={scrapDispatching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    onClick={async () => {
                      if (scrapScannedItems.length === 0) { alert('Escanea al menos un equipo antes de despachar.'); return; }
                      if (!scrapGuideNumber.trim()) { alert('Ingresa o genera el número de conduce.'); return; }
                      setScrapDispatching(true);
                      try {
                        const { logAdvancedAudit } = await import('@/lib/database/audit');
                        const { updateSeriesStatus } = await import('@/lib/database/workshop');
                        for (const sc of scrapScannedItems) {
                          const ids = sc.all_dbIds || [sc.dbId];
                          for (const id of ids) {
                            await updateSeriesStatus(id, 'dispatched');
                            await logAdvancedAudit({
                              module: 'Taller',
                              tableName: 'series',
                              recordId: id,
                              action: 'SCRAP DESPACHADO',
                              severity: 'WARNING',
                              newValues: { conduce: scrapGuideNumber, notes: scrapNotes, serial: sc.sn, os: sc.os, modelo: sc.modelo }
                            });
                          }
                        }
                        alert(`✅ ${scrapScannedItems.length} equipo(s) despachados con guía: ${scrapGuideNumber}`);
                        setScrapDispatchModal({isOpen: false, item: null});
                        setScrapScannedItems([]);
                        setScrapGuideNumber('');
                        setScrapNotes('');
                        fetchTasks();
                      } catch (err: any) {
                        alert(`Error: ${err.message}`);
                      }
                      setScrapDispatching(false);
                    }}
                  >
                    {scrapDispatching ? 'Despachando...' : `Confirmar Despacho (${scrapScannedItems.length})`}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL RETURN TO STAGE */}
      {returnModalOpen.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#181c3a]/40 backdrop-blur-sm p-4">
          <Card className="max-w-md w-full shadow-2xl animate-rise-in p-0 overflow-hidden">
            <div className="p-6 bg-amber-500 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <RotateCcw className="w-5 h-5 text-amber-100" />
                <div>
                  <h3 className="font-black text-lg">Mover Equipo de Etapa</h3>
                  <p className="text-[10px] font-bold text-amber-100 uppercase tracking-widest mt-0.5">Selecciona el nuevo destino</p>
                </div>
              </div>
              <button onClick={() => setReturnModalOpen({isOpen: false, item: null})} className="text-white/60 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6 bg-slate-50">
              <p className="text-xs font-bold text-slate-600">
                Selecciona a qué etapa deseas mover el equipo <span className="font-black text-[#181c3a]">{returnModalOpen.item?.sn}</span>:
              </p>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Etapa de Destino <span className="text-rose-500">*</span></label>
                <select value={returnTargetStage} onChange={e => setReturnTargetStage(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all">
                  <option value="in_workshop">Diagnóstico</option>
                  <option value="in_refurbish">Reacondicionado</option>
                  <option value="in_repair">Reparación</option>
                  <option value="in_l3">L3 (Avanzado)</option>
                  <option value="scrap">SCRAPS</option>
                </select>
              </div>
              <Button
                variant="primary"
                disabled={!returnTargetStage || loading}
                className="w-full bg-[#181c3a] hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500 text-white shadow-lg py-4 font-black mt-2 disabled:shadow-none"
                onClick={handleReturnToStage}
              >
                {loading ? 'Moviendo...' : 'Confirmar Movimiento'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </ModulePage>
  );
}

