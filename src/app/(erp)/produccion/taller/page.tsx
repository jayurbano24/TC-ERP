"use client";

import React, { useState, useMemo } from 'react';
import { ModulePage } from "@/components/module-page";
import { Card, Button, Badge, notify, confirmDialog, DataTable, type DataTableColumn } from "@/components/ui";
import { Wrench, Stethoscope, Search, Filter, Box, Plus, Activity, AlertCircle, ArrowRight, CheckCircle2, XCircle, Clock, ChevronLeft, ChevronRight, ChevronDown, User, CheckSquare, ServerCrash, RefreshCw, Zap, Trash2, Loader2, RotateCcw, History, ClipboardList, Package, Send, ScanLine, X, BarChart3, Layers, Edit2, Eye, Printer, Download } from 'lucide-react';
import { type WorkshopTabId } from '@/modules/workshop/client/workshop';
import { fetchWorkshopTasksPageViaApi, locateWorkshopEquipmentViaApi, type WorkshopLocateResult } from '@/lib/api/workshopTasks';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';
import { parseWorkshopSearchTokens } from '@/modules/workshop/shared/workshopSearch';
import {
  operateWorkshopInBatches,
  countSeriesInSelection,
  countEquipmentsInSelection,
  validateWorkshopOperateSelection,
  formatWorkshopSelectionLabel,
} from '@/lib/api/workshopOperate';
import {
  returnWorkshopInBatches,
} from '@/lib/api/workshopReturn';
import { exportWorkshopTabToExcel } from '@/lib/api/workshopExport';
import {
  validateWorkshopPrerequisitesViaApi,
  actionNameForTab,
} from '@/lib/api/workshopPrerequisites';
import { fetchWorkshopOperationCatalogsViaApi } from '@/lib/api/referenceCatalogs';
import { useReferenceCatalogs } from '@/hooks/useReferenceCatalogs';
import { getSeriesHistory } from '@/modules/platform/client/audit';
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkshopTabCounts } from '@/hooks/useWorkshopTabCounts';
import { isHexagonalProductionOrderEnabled } from '@/modules/production-order';
import { apiFetch } from '@/lib/http/apiFetch';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { ProductionOrderPanel } from '@/modules/production-order/components/ProductionOrderPanel';
import { ItemDetailModal } from './components/ItemDetailModal';
import { ReturnStageModal } from './components/ReturnStageModal';
import { ScrapDispatchModal } from './components/ScrapDispatchModal';
import { DespachoView } from './components/DespachoView';
import { OperationDrawer } from './components/OperationDrawer';

type TabType = 'diagnostico' | 'reparacion' | 'reacondicionado' | 'qc' | 'l3' | 'scraps' | 'listo' | 'despacho' | 'po';

export default function TallerPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('diagnostico');
  const useProductionOrderHex = isHexagonalProductionOrderEnabled();
  const [selectedForOperation, setSelectedForOperation] = useState<any | null>(null);
  
  // Selection State
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  // Search State
  const [searchTerm, setSearchTerm] = useState('');
  // C5: el filtrado se hace contra el término debounced (no recalcula la cola en
  // cada tecla). El input sigue ligado a searchTerm para que se sienta fluido.
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);

  // CQRS Dashboard State (Strangler Fig)
  // C6: KPIs del dashboard CQRS vía TanStack Query (dedupe entre remontajes).
  const dashboardQuery = useQuery({
    queryKey: ['produccion-dashboard'],
    queryFn: async () => {
      const res = await apiFetch('/api/produccion/dashboard');
      if (!res.ok) throw new Error('Dashboard CQRS no disponible');
      const data = await res.json();
      return data.data.kpis;
    },
    retry: false,
  });
  const dashboardKpis = dashboardQuery.data ?? null;
  const useNewDashboard = dashboardQuery.isSuccess;

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
  const [loadingMore, setLoadingMore] = useState(false);
  const [tasksCursor, setTasksCursor] = useState<string | null>(null);
  const [tasksHasMore, setTasksHasMore] = useState(false);
  const [tasksTotalOs, setTasksTotalOs] = useState<number | null>(null);
  const [locateHint, setLocateHint] = useState<WorkshopLocateResult | null>(null);
  const [operateProgress, setOperateProgress] = useState<{
    processedSeries: number;
    totalSeries: number;
    equipmentCount: number;
  } | null>(null);
  const [exportingReport, setExportingReport] = useState(false);
  const [showItemDetail, setShowItemDetail] = useState<any | null>(null);
  const [hideTechCol, setHideTechCol] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1400px)');
    const update = () => setHideTechCol(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const tabCountsQuery = useWorkshopTabCounts();
  const tabCounts = tabCountsQuery.data ?? {};

  const {
    technologies: catTecnologias,
    brands: catMarcas,
    models: catModelos,
    techName,
    brandName,
    modelName,
  } = useReferenceCatalogs();
  const [catDiagnosticos, setCatDiagnosticos] = useState<any[]>([]);
  const [catReparaciones, setCatReparaciones] = useState<any[]>([]);
  const [catReacondicionadoTests, setCatReacondicionadoTests] = useState<any[]>([]);

  const workshopCatalogsQuery = useQuery({
    queryKey: ['workshop-operation-catalogs', 'v1'],
    queryFn: fetchWorkshopOperationCatalogsViaApi,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!workshopCatalogsQuery.data) return;
    setCatDiagnosticos(workshopCatalogsQuery.data.diagnostics);
    setCatReparaciones(workshopCatalogsQuery.data.repairs);
    setCatReacondicionadoTests(workshopCatalogsQuery.data.reacondicionadoTests);
  }, [workshopCatalogsQuery.data]);

  useEffect(() => {
    if (activeTab !== 'po' && activeTab !== 'despacho') {
      void fetchTasks(false, debouncedSearchTerm);
    }
    setSelectedRows([]);
  }, [activeTab, debouncedSearchTerm]);

  const WORKSHOP_SERIES_SLOTS = 4;

  const seriesAt = (item: { all_sns?: string[]; sn?: string }, index: number): string | null => {
    const sns = item.all_sns?.length ? item.all_sns : item.sn ? [item.sn] : [];
    return sns[index] ?? null;
  };

  const ingressLabel = (count: number) => {
    if (count === 1) return 'Primer ingreso';
    if (count === 2) return '2° ingreso';
    return `${count}° ingreso`;
  };

  const adaptWorkshopRow = (t: any) => {
    const notes = (t.receptions?.notes || '').replace(/\\n/g, '\n');

    const modelRow = catModelos.find((m: any) => m.id === t.model_id);
    let techId =
      t.models?.technology_id ||
      modelRow?.technology_id ||
      '';

    let brandId = t.brand_id || '';
    let modelId = t.model_id || '';
    let courierStr = t.receptions?.carrier || 'Desconocido';
    let sourceStr = t.receptions?.source?.toUpperCase() || 'CAC';
    let agenciaStr = 'N/A';

    const receptionGuide = (t.receptions?.reception_guides || []).find(
      (rg: any) => rg.guide_number === t.receptions?.guide_number
    );
    const soGuide = t.service_orders?.reception_guides;
    const sapAgency = t.service_orders?.sap_transfer_documents?.agency;

    if (notes) {
      try {
        const parsed = JSON.parse(notes);
        if (parsed.courier && courierStr === 'Desconocido') courierStr = parsed.courier;
        if (parsed.agencia) agenciaStr = parsed.agencia;
      } catch {
        /* not JSON */
      }

      const techFromNotes = notes.split('Backoffice_Tech: ')[1]?.split('\n')[0]?.trim() || '';
      if (!techId && techFromNotes && !/^cajas:/i.test(techFromNotes)) {
        techId = techFromNotes;
      }

      const brandFromNotes = notes.split('Backoffice_Brand: ')[1]?.split('\n')[0]?.trim() || '';
      if (!brandId && brandFromNotes) brandId = brandFromNotes;

      const modelFromNotes = notes.split('Backoffice_Model: ')[1]?.split('\n')[0]?.trim() || '';
      if (!modelId && modelFromNotes) modelId = modelFromNotes;

      const agenciaFromNotes =
        notes.split('Agencia: ')[1]?.split('\n')[0]?.trim() ||
        notes.split('Backoffice_Agency: ')[1]?.split('\n')[0]?.trim() ||
        notes.split('Proveedor PX: ')[1]?.split('\n')[0]?.trim() ||
        '';
      if (agenciaFromNotes) agenciaStr = agenciaFromNotes;
    }

    if (agenciaStr === 'N/A') {
      agenciaStr =
        receptionGuide?.agency ||
        soGuide?.agency ||
        sapAgency ||
        (sourceStr === 'PX' ? courierStr : 'N/A');
    }

    const tecnologiaName =
      t.models?.technologies?.name ||
      techName(techId) ||
      (techId && !/^cajas:/i.test(techId) ? techId : null) ||
      'EQUIPO';
    const marcaName =
      t.brands?.name ||
      brandName(brandId) ||
      brandId ||
      'Desconocida';
    const modeloName =
      t.models?.name ||
      modelName(modelId) ||
      modelId ||
      'S/N';

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
      groupId: t.service_order_id || t.id,
      sn: t.all_sns?.[0] || t.serial_number || 'S/N',
      all_sns: t.all_sns?.length ? t.all_sns : [t.serial_number].filter(Boolean),
      total_series: t.all_sns?.length || 1,
      tecnologia: tecnologiaName,
      marca: marcaName,
      modelo: modeloName,
      boxCode: t.source_box_code || t.boxes?.box_code || '—',
      updatedAt: t.updated_at ? new Date(t.updated_at).toLocaleString() : 'Desconocida',
      fecha: t.updated_at
        ? new Date(t.updated_at).toLocaleDateString('es-GT', { day: 'numeric', month: 'numeric', year: 'numeric' })
        : '—',
      hora: t.updated_at
        ? new Date(t.updated_at).toLocaleTimeString('es-GT', { hour: 'numeric', minute: '2-digit' })
        : '',
      etapa: stageRaw,
      responsable: responsableName,
      dbId: t.service_order_id || t.id,
      all_dbIds: t.all_dbIds?.length ? t.all_dbIds : [t.id],
      courier: `${sourceStr} - ${courierStr}`,
      agencia: agenciaStr,
      guide: t.receptions?.guide_number || 'S/G',
      ingress_count: t.ingress_count || 1,
      current_diagnostics: t.current_diagnostics || []
    };
  };

  const collectSeriesIdsFromSelection = (selection: any | any[]): string[] => {
    const items = Array.isArray(selection) ? selection : [selection];
    const ids: string[] = [];
    for (const item of items) {
      if (item.all_dbIds?.length) ids.push(...item.all_dbIds);
      else if (item.dbId) ids.push(item.dbId);
    }
    return [...new Set(ids)];
  };

  const validateStagePrerequisites = async (selection: any | any[], tab: TabType) => {
    if (tab === 'diagnostico') return true;

    const actionName = actionNameForTab(tab);
    const seriesIds = collectSeriesIdsFromSelection(selection);
    if (seriesIds.length === 0) {
      notify.warning('No hay series en la selección.');
      return false;
    }
    try {
      const prereq = await validateWorkshopPrerequisitesViaApi(seriesIds, actionName);
      if (!prereq.ok) {
        notify.warning(prereq.message);
        return false;
      }
      return true;
    } catch (err: any) {
      notify.error('No se pudo validar requisitos de etapa', { description: err?.message });
      return false;
    }
  };

  const openOperationForSelection = async (selection: any | any[]) => {
    const items = Array.isArray(selection) ? selection : [selection];
    const equipmentCount = countEquipmentsInSelection(items);
    const seriesCount = countSeriesInSelection(items);
    const check = validateWorkshopOperateSelection(equipmentCount, seriesCount);
    if (!check.ok) {
      notify.warning(check.message);
      return;
    }
    const canProceed = await validateStagePrerequisites(selection, activeTab);
    if (!canProceed) return;
    setSelectedForOperation(selection);
  };

  const openMassOperation = () => {
    const selectedItems = tasks.filter((t) => selectedRows.includes(t.dbId));
    void openOperationForSelection(selectedItems);
  };

  const seriesIdsForHistory = (item: any): string[] => {
    if (item.all_dbIds?.length) return [...new Set(item.all_dbIds)];
    if (item.dbId) return [item.dbId];
    return [];
  };

  useEffect(() => {
    const fetchHistory = async () => {
      if (historyModalOpen.isOpen && historyModalOpen.item) {
        setLoadingHistory(true);
        try {
          const ids = seriesIdsForHistory(historyModalOpen.item);
          const data = ids.length > 0 ? await getSeriesHistory(ids) : [];
          setHistoryItems(data || []);
        } catch {
          setHistoryItems([]);
        } finally {
          setLoadingHistory(false);
        }
      } else {
        setHistoryItems([]);
      }
    };
    void fetchHistory();
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

  const fetchTasks = async (append = false, searchOverride?: string) => {
    if (activeTab === 'po' || activeTab === 'despacho') return;

    const search = (searchOverride ?? debouncedSearchTerm).trim();
    if (append && search) return;

    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const workshopTab = activeTab as WorkshopTabId;
      const cursor = append ? tasksCursor : null;
      const rawSearch = append ? '' : search;
      const parsedSearch = rawSearch ? parseWorkshopSearchTokens(rawSearch) : null;

      if (!append && parsedSearch?.truncated) {
        notify.warning(
          `Solo se buscan las primeras ${BATCH_LIMITS.WORKSHOP_SEARCH_MAX_SERIALS} series`,
          { description: `Pegaste ${parsedSearch.total}; el resto se omite.` }
        );
      }

      const page = await fetchWorkshopTasksPageViaApi(
        workshopTab,
        cursor,
        append ? undefined : search || undefined
      );
      const adapted = page.items.map(adaptWorkshopRow);

      setTasks((prev) => (append ? [...prev, ...adapted] : adapted));
      setTasksCursor(page.nextCursor);
      setTasksHasMore(Boolean(page.nextCursor) && !search);
      setTasksTotalOs(page.totalOs);

      // Hint de otra pestaña solo con 1 serie (pegado masivo no aplica)
      const singleToken =
        parsedSearch && parsedSearch.tokens.length === 1 ? parsedSearch.tokens[0] : null;
      if (!append && singleToken && adapted.length === 0) {
        try {
          const loc = await locateWorkshopEquipmentViaApi(singleToken);
          setLocateHint(
            loc.found && loc.tab && loc.tab !== workshopTab ? loc : null
          );
        } catch {
          setLocateHint(null);
        }
      } else if (!append) {
        setLocateHint(null);
      }
    } catch (err) {
      console.error('Error loading workshop tasks:', err);
      notify.error('No se pudo cargar la cola de taller', {
        description: err instanceof Error ? err.message : undefined,
      });
      if (!append) {
        setTasks([]);
        setLocateHint(null);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleExportTabReport = async () => {
    if (activeTab === 'po' || activeTab === 'despacho' || activeTab === 'listo') {
      notify.warning('Exportación disponible en pestañas operativas de Taller.');
      return;
    }
    setExportingReport(true);
    try {
      await exportWorkshopTabToExcel(activeTab as WorkshopTabId, (raw) => {
        const a = adaptWorkshopRow(raw);
        return {
          os: a.id,
          serie_principal: a.sn,
          s1: seriesAt(a, 0) ?? '',
          s2: seriesAt(a, 1) ?? '',
          s3: seriesAt(a, 2) ?? '',
          s4: seriesAt(a, 3) ?? '',
          series: (a.all_sns || []).join(', '),
          cantidad_series: a.total_series,
          tecnologia: a.tecnologia,
          marca: a.marca,
          modelo: a.modelo,
          caja: a.boxCode,
          fecha: a.fecha,
          hora: a.hora,
          ingresos: ingressLabel(a.ingress_count),
          ingreso: a.updatedAt,
          etapa: a.etapa,
          responsable: a.responsable,
          guia: a.guide,
          agencia: a.agencia,
          courier: a.courier,
        };
      });
      notify.success('Reporte exportado');
    } catch (err: any) {
      notify.error('No se pudo exportar', { description: err?.message });
    } finally {
      setExportingReport(false);
    }
  };

  const handleCompleteOperation = async () => {
    if (!selectedForOperation) return;
    if (!diagnosticResult) {
      notify.warning("Por favor selecciona un resultado de evaluación antes de continuar.");
      return;
    }

    if (activeTab === 'reacondicionado' && diagnosticResult === 'reparacion') {
      const confirmed = await confirmDialog({ title: 'Enviar a reparación', message: '¿Está seguro que desea enviar el equipo a Requiere Reparación (L1/L2)?', confirmText: 'Enviar' });
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
      const seriesIds = collectSeriesIdsFromSelection(selectedForOperation);
      const equipmentCount = Array.isArray(selectedForOperation)
        ? selectedForOperation.length
        : 1;
      const check = validateWorkshopOperateSelection(equipmentCount, seriesIds.length);
      if (!check.ok) {
        notify.warning(check.message);
        return;
      }

      if (activeTab !== 'diagnostico') {
        const prereq = await validateWorkshopPrerequisitesViaApi(seriesIds, actionName);
        if (!prereq.ok) {
          notify.warning(prereq.message);
          return;
        }
      }

      setOperateProgress({
        processedSeries: 0,
        totalSeries: seriesIds.length,
        equipmentCount,
      });

      await operateWorkshopInBatches(
        {
          seriesIds,
          equipmentCount,
          result: diagnosticResult,
          notes: finalNotes,
          selectedDiagnostics,
          actionName,
        },
        (p) =>
          setOperateProgress({
            processedSeries: p.processedSeries,
            totalSeries: p.totalSeries,
            equipmentCount: p.equipmentCount,
          })
      );

      notify.success(
        Array.isArray(selectedForOperation)
          ? `${equipmentCount} equipo${equipmentCount !== 1 ? 's' : ''} trasladados (${seriesIds.length} series).`
          : `Equipo trasladado (${seriesIds.length} serie${seriesIds.length !== 1 ? 's' : ''}).`
      );
      setSelectedForOperation(null);
      setSelectedRows([]);
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
      await queryClient.invalidateQueries({ queryKey: ['workshop-tab-counts'] });
      await fetchTasks(false);
    } catch (error: any) {
      notify.error('Error guardando operación', { description: error.message });
    } finally {
      setOperateProgress(null);
      setLoading(false);
    }
  };

  const handleReturnToStage = async () => {
    const item = returnModalOpen.item;
    if (!item || !returnTargetStage) return;

    setLoading(true);
    try {
      const seriesIds = item.all_dbIds?.length ? item.all_dbIds : [item.dbId];
      await returnWorkshopInBatches(seriesIds, {
        targetStatus: returnTargetStage,
        reason: 'Movido manualmente desde Taller',
      });
      const stageLabels: Record<string, string> = {
        in_workshop: 'DIAGNÓSTICO',
        in_qc: 'REPARACIÓN',
        in_refurbish: 'REACONDICIONADO',
        in_l3: 'L3',
        scrap: 'SCRAPS',
        irreparable: 'SCRAPS',
      };
      const label = stageLabels[returnTargetStage] || 'OTRA ETAPA';
      notify.success(`Equipo movido a ${label}`);
      setReturnModalOpen({ isOpen: false, item: null });
      await queryClient.invalidateQueries({ queryKey: ['workshop-tab-counts'] });
      await fetchTasks(false);
    } catch (error: unknown) {
      console.error(error);
      notify.error('Error moviendo equipo', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    ...(useProductionOrderHex
      ? [{ id: 'po', label: 'PO Taller', icon: ClipboardList, color: 'text-cyan-600', bg: 'bg-cyan-50' }]
      : []),
    { id: 'diagnostico', label: 'Diagnóstico', icon: Stethoscope, color: 'text-amber-500', bg: 'bg-amber-50' },
    { id: 'reparacion', label: 'Reparación', icon: Wrench, color: 'text-blue-500', bg: 'bg-blue-50' },
    { id: 'reacondicionado', label: 'Reacondicionado', icon: RefreshCw, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { id: 'qc', label: 'Control de Calidad', icon: CheckSquare, color: 'text-purple-500', bg: 'bg-purple-50' },
    { id: 'l3', label: 'L3 (Avanzado)', icon: Zap, color: 'text-orange-500', bg: 'bg-orange-50' },
    { id: 'scraps', label: 'SCRAPS', icon: Trash2, color: 'text-rose-500', bg: 'bg-rose-50' },
    { id: 'listo', label: 'Equipo Listo', icon: CheckCircle2, color: 'text-teal-500', bg: 'bg-teal-50' },
    { id: 'despacho', label: 'Despacho Taller', icon: Send, color: 'text-indigo-500', bg: 'bg-indigo-50' },
  ];

  const filteredTasks = useMemo(() => tasks.filter(t => {
    let matchesTab = false;
    if (activeTab === 'diagnostico') matchesTab = t.etapa === 'PARA DIAGNOSTICAR';
    else if (activeTab === 'reparacion') matchesTab = t.etapa === 'REPARACION';
    else if (activeTab === 'reacondicionado') matchesTab = t.etapa === 'REACONDICIONADO';
    else if (activeTab === 'qc') matchesTab = t.etapa === 'CONTROL DE CALIDAD';
    else if (activeTab === 'l3') matchesTab = t.etapa === 'L3';
    else if (activeTab === 'scraps') matchesTab = t.etapa === 'SCRAPS';
    else if (activeTab === 'listo') matchesTab = t.etapa === 'EQUIPO LISTO';

    if (!matchesTab) return false;

    // Con término de búsqueda la API ya filtró por serie/OS en toda la cola.
    if (debouncedSearchTerm.trim()) return true;

    return true;
  }), [tasks, activeTab, debouncedSearchTerm]);

  return (
    <ModulePage
      category="Producción"
      title="Taller & Operación Técnica"
      subtitle=""
      actions={
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <Button variant="outline" leftIcon={<Activity className="w-4 h-4" />}>Reporte de Fallas</Button>
          <Button variant="primary" leftIcon={<ClipboardList className="w-4 h-4" />}>Mis Tareas</Button>
        </div>
      }
    >
      <div className="space-y-6 sm:space-y-8 min-w-0">
        
        {/* NEW CQRS DASHBOARD (Strangler Fig) */}
        {useNewDashboard && dashboardKpis && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 animate-rise-in">
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

        {/* Navigation Tabs - scroll horizontal en pantallas medianas */}
        <div className="overflow-x-auto custom-scrollbar -mx-1 px-1 pb-1">
          <div className="flex flex-wrap gap-2 p-2 bg-slate-100/50 rounded-3xl border border-slate-100 min-w-0 w-full">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 sm:gap-3 px-3 sm:px-4 lg:px-5 py-3 sm:py-3.5 rounded-2xl font-black uppercase tracking-widest text-[9px] sm:text-[10px] transition-all shrink-0 ${
                  isActive 
                  ? 'bg-[#181c3a] text-white shadow-xl lg:scale-105' 
                  : 'text-slate-400 hover:bg-white hover:text-slate-600'
                }`}
              >
                <Icon size={16} className={isActive ? 'text-[#2ec4f1]' : tab.color} />
                <span className="flex items-center gap-1.5 sm:gap-2 whitespace-nowrap">
                  {tab.label}
                  <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-black ${
                    isActive ? 'bg-[#2ec4f1]/20 text-[#2ec4f1]' : 'bg-slate-200 text-slate-500'
                  }`}>
                    {tabCounts[tab.id] || 0}
                  </span>
                </span>
              </button>
            );
          })}
          </div>
        </div>

        {/* Dynamic Content Area */}
        <div className="animate-rise-in">
          {activeTab === 'po' && useProductionOrderHex ? (
            <ProductionOrderPanel />
          ) : activeTab !== 'despacho' && activeTab !== 'po' && (() => {
            const currentTab = tabs.find(t => t.id === activeTab) || tabs[0];
            const TabIcon = currentTab.icon;

            // C3: color de cabecera por pestaña (se conserva el look original).
            const headerBg =
              activeTab === 'diagnostico' ? 'bg-amber-500' :
              activeTab === 'reparacion' ? 'bg-blue-500' :
              activeTab === 'reacondicionado' ? 'bg-emerald-500' :
              activeTab === 'qc' ? 'bg-purple-500' :
              activeTab === 'l3' ? 'bg-orange-500' :
              activeTab === 'scraps' ? 'bg-rose-500' :
              activeTab === 'listo' ? 'bg-teal-500' :
              'bg-amber-500';

            const tallerColumns: DataTableColumn<any>[] = [
              {
                id: 'select',
                width: '28px',
                align: 'center',
                header: (
                  <input
                    type="checkbox"
                    className="w-3.5 h-3.5 rounded text-blue-500 focus:ring-blue-500 border-slate-300"
                    checked={tasks.length > 0 && selectedRows.length === tasks.length}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedRows(tasks.map((t: any) => t.dbId));
                      else setSelectedRows([]);
                    }}
                  />
                ),
                cell: (item: any) => (
                  <input
                    type="checkbox"
                    className="w-3.5 h-3.5 rounded text-blue-500 focus:ring-blue-500 border-slate-300"
                    checked={selectedRows.includes(item.dbId)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedRows([...selectedRows, item.dbId]);
                      else setSelectedRows(selectedRows.filter((id: string) => id !== item.dbId));
                    }}
                  />
                ),
              },
              {
                id: 'orden',
                header: 'OS',
                width: 'minmax(0,0.7fr)',
                cell: (item: any) => (
                  <span className="text-[9px] font-medium text-[var(--foreground)] bg-[var(--surface-hover)] px-1 py-0.5 rounded truncate block">{item.id}</span>
                ),
              },
              ...Array.from({ length: WORKSHOP_SERIES_SLOTS }, (_, i) => ({
                id: `s${i + 1}`,
                header: `S${i + 1}`,
                width: 'minmax(90px, 0.85fr)',
                cellClassName: 'text-[9px] font-medium text-[var(--foreground)] truncate',
                cell: (item: any) => {
                  const serial = seriesAt(item, i);
                  if (!serial) {
                    return <span className="text-[var(--muted)]">—</span>;
                  }
                  return (
                    <button
                      type="button"
                      onClick={() => setShowItemDetail(item)}
                      title={serial}
                      className="text-[9px] font-medium text-[var(--foreground)] truncate hover:underline text-left w-full min-w-0 leading-tight"
                    >
                      {serial}
                    </button>
                  );
                },
              } as DataTableColumn<any>)),
              ...(!hideTechCol
                ? [{
                    id: 'tecnologia',
                    header: 'Tec.',
                    width: 'minmax(0,0.5fr)',
                    cellClassName: 'text-[9px] font-medium text-[var(--foreground)] uppercase truncate',
                    cell: (item: any) => item.tecnologia,
                  } as DataTableColumn<any>]
                : []),
              {
                id: 'modelo',
                header: 'Modelo',
                width: 'minmax(0,0.8fr)',
                cellClassName: 'text-[9px] font-medium text-[var(--foreground)] uppercase truncate',
                cell: (item: any) => `${item.marca} ${item.modelo}`,
              },
              {
                id: 'caja',
                header: 'Caja',
                width: 'minmax(0,0.45fr)',
                cellClassName: 'text-[9px] font-medium text-[var(--foreground)] uppercase truncate',
                cell: (item: any) => item.boxCode,
              },
              {
                id: 'fecha',
                header: 'Fecha',
                width: 'minmax(0,0.65fr)',
                cell: (item: any) => (
                  <div className="flex flex-col gap-0 min-w-0 leading-tight" title={item.updatedAt}>
                    <span className="text-[9px] font-medium text-[var(--foreground)] truncate">{item.fecha}</span>
                    {item.hora ? (
                      <span className="text-[9px] font-medium text-[var(--muted)] truncate">{item.hora}</span>
                    ) : null}
                  </div>
                ),
              },
              {
                id: 'ingresos',
                header: 'Ingresos',
                width: 'minmax(0,0.7fr)',
                align: 'center',
                cell: (item: any) => (
                  <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded w-fit mx-auto block whitespace-nowrap ${item.ingress_count > 1 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300' : 'bg-[#2ec4f1]/15 text-[#0ea5c9] dark:text-[#2ec4f1]'}`}>
                    {ingressLabel(item.ingress_count)}
                  </span>
                ),
              },
              {
                id: 'accion',
                header: 'Acc.',
                width: activeTab === 'diagnostico' ? '40px' : activeTab === 'scraps' ? '68px' : '84px',
                sticky: 'end',
                align: 'right',
                headerClassName: `justify-end ${headerBg}`,
                cell: (item: any) => (
                  <div className="flex items-center justify-end gap-0.5">
                    {activeTab !== 'diagnostico' && activeTab !== 'scraps' && (
                      <button
                        type="button"
                        onClick={() => { setReturnModalOpen({ isOpen: true, item }); setReturnTargetStage('in_workshop'); }}
                        className="h-6 w-6 flex items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted)] hover:text-amber-500 hover:border-amber-300 hover:bg-amber-500/10 transition-colors shrink-0"
                        title="Regresar a otra etapa"
                        aria-label="Regresar a otra etapa"
                      >
                        <RotateCcw size={11} />
                      </button>
                    )}
                    {activeTab !== 'diagnostico' && (
                      <button
                        type="button"
                        onClick={() => setHistoryModalOpen({ isOpen: true, item })}
                        className="h-6 w-6 flex items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted)] hover:text-blue-500 hover:border-blue-300 hover:bg-blue-500/10 transition-colors shrink-0"
                        title="Ver historial"
                        aria-label="Ver historial"
                      >
                        <History size={11} />
                      </button>
                    )}
                    {activeTab === 'scraps' ? (
                      <button
                        type="button"
                        title="Despachar"
                        aria-label="Despachar"
                        className="h-6 w-6 flex items-center justify-center rounded-md bg-rose-500 text-white hover:bg-rose-600 shadow-sm shrink-0"
                        onClick={() => { setScrapDispatchModal({ isOpen: true, item }); setScrapGuideNumber(''); setScrapNotes(''); }}
                      >
                        <Send size={11} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        title="Evaluar"
                        aria-label="Evaluar"
                        className="h-6 w-6 flex items-center justify-center rounded-md bg-[#2ec4f1] text-[#181c3a] hover:bg-[#2ec4f1]/80 shadow-sm shrink-0"
                        onClick={() => void openOperationForSelection(item)}
                      >
                        <ArrowRight size={11} />
                      </button>
                    )}
                  </div>
                ),
              },
            ];

            return (
              <div className="space-y-6">
                {locateHint?.found && locateHint.tab && locateHint.tabLabel && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-6 py-4">
                    <p className="text-sm font-bold text-amber-900">
                      {locateHint.osLabel || locateHint.serial} está en{' '}
                      <span className="text-amber-700">{locateHint.tabLabel}</span>
                      {locateHint.tab !== activeTab && (
                        <>
                          , no en {tabs.find((t) => t.id === activeTab)?.label || 'esta pestaña'}.
                          {' '}La cola de Taller es compartida — todos los operadores ven los mismos equipos.
                        </>
                      )}
                    </p>
                    {locateHint.tab !== activeTab && (
                      <Button
                        variant="outline"
                        className="border-amber-300 text-amber-800 font-black uppercase text-[10px] shrink-0"
                        onClick={() => setActiveTab(locateHint.tab as TabType)}
                      >
                        Ir a {locateHint.tabLabel}
                      </Button>
                    )}
                  </div>
                )}
                <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4 sm:gap-6 bg-white p-4 sm:p-6 lg:p-8 rounded-3xl border-2 border-slate-100 shadow-sm min-w-0">
                  {/* Búsqueda */}
                  <div className="flex gap-4 items-stretch w-full xl:flex-1 xl:max-w-md min-w-0">
                    <div className="relative flex-1 min-w-0">
                      <Search className="absolute left-4 top-4 text-slate-400 w-4 h-4 pointer-events-none" />
                      <textarea
                        placeholder={`BUSCAR SERIE U OS… (pegar hasta ${BATCH_LIMITS.WORKSHOP_SEARCH_MAX_SERIALS} series)`}
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                        }}
                        rows={2}
                        className="w-full min-w-0 pl-12 pr-4 py-3 sm:py-4 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] font-black uppercase outline-none focus:border-amber-400 transition-all resize-y custom-scrollbar"
                      />
                    </div>
                  </div>

                  {/* Acciones — envuelven en varias filas si no caben */}
                  <div className="flex flex-wrap gap-2 sm:gap-3 items-center justify-start xl:justify-end w-full xl:w-auto min-w-0">
                    <Button
                      variant="outline"
                      className="border-slate-200 text-slate-600 font-black uppercase text-[10px] tracking-widest"
                      leftIcon={exportingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      disabled={exportingReport}
                      onClick={() => void handleExportTabReport()}
                    >
                      {exportingReport ? 'Exportando…' : 'Exportar Reporte'}
                    </Button>

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
                      <div className="flex flex-wrap gap-2 animate-rise-in w-full xl:w-auto">
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
                              Asignar a Mí ({selectedRows.length} eq.)
                            </Button>
                            <Button 
                              variant="primary" 
                              className="bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20" 
                              leftIcon={<Activity className="w-4 h-4" />}
                              onClick={openMassOperation}
                            >
                              {activeTab === 'diagnostico' ? 'Diagnóstico Masivo' : 'Operar Selección'}
                              {' '}
                              ({formatWorkshopSelectionLabel(tasks.filter((t) => selectedRows.includes(t.dbId)))})
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
                      <div className="w-full xl:w-auto xl:text-right">
                        <Button variant="outline" className="border-slate-200 text-slate-400 hover:bg-slate-50 opacity-50 cursor-not-allowed w-full sm:w-auto whitespace-normal text-center">
                          Selecciona equipos para acciones masivas
                        </Button>
                        <p className="text-[9px] font-black text-slate-300 mt-1">
                          Máx. {BATCH_LIMITS.WORKSHOP_OPERATE_MAX_EQUIPMENTS} equipos / {BATCH_LIMITS.WORKSHOP_OPERATE_MAX_SERIES} series
                        </p>
                      </div>
                    ) : null}

                  </div>
                </div>

                <Card padding="none" className="border-2 border-slate-100 shadow-sm rounded-2xl p-0 min-w-0 w-full overflow-hidden">
                  {operateProgress ? (
                    <div className="py-16 px-8 text-center space-y-4">
                      <Loader2 className="w-8 h-8 text-amber-500 animate-spin mx-auto" />
                      <p className="text-[11px] font-black text-slate-600 uppercase tracking-widest">
                        Traspasando {operateProgress.equipmentCount} equipo
                        {operateProgress.equipmentCount !== 1 ? 's' : ''}…{' '}
                        {operateProgress.processedSeries}/{operateProgress.totalSeries} series
                      </p>
                      <div className="max-w-md mx-auto h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 transition-all duration-300"
                          style={{
                            width: `${Math.min(100, Math.round((operateProgress.processedSeries / operateProgress.totalSeries) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  ) : loading ? (
                    <div className="py-20 text-center">
                      <Loader2 className="w-8 h-8 text-[#2ec4f1] animate-spin mx-auto" />
                      <p className="text-[10px] font-black text-slate-400 uppercase mt-4 tracking-widest">Sincronizando con Servidor...</p>
                    </div>
                  ) : (
                    <>
                      <DataTable
                        columns={tallerColumns}
                        data={filteredTasks}
                        getRowId={(item: any) => item.groupId || item.dbId}
                        rowHeight={34}
                        maxBodyHeight={680}
                        compact
                        headerClassName={headerBg}
                        headerTextClassName="text-white/90"
                        emptyMessage="No hay equipos en cola"
                        rowClassName={(item: any) => (selectedRows.includes(item.dbId) ? 'bg-blue-50/30' : '')}
                      />
                      <div className="px-3 py-2 border-t border-slate-50 flex items-center justify-between bg-slate-50/50 rounded-b-2xl">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          {tasksTotalOs != null
                            ? `${filteredTasks.length} de ${tasksTotalOs} equipos en cola`
                            : `${filteredTasks.length} equipos en cola`}
                          {tabCounts[activeTab] != null && tasksTotalOs != null && tabCounts[activeTab] !== tasksTotalOs && (
                            <span className="text-slate-300"> · badge {tabCounts[activeTab]}</span>
                          )}
                        </span>
                        {tasksHasMore && !debouncedSearchTerm && (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={loadingMore}
                            leftIcon={loadingMore ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronDown className="w-3 h-3" />}
                            onClick={() => void fetchTasks(true)}
                          >
                            {loadingMore ? 'Cargando…' : 'Cargar más equipos'}
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </Card>
              </div>
            );
          })()}

          {/* ════════════ TAB: DESPACHO TALLER ════════════ */}
          {activeTab === 'despacho' && (
            <DespachoView
              tasks={tasks}
              catMarcas={catMarcas}
              catModelos={catModelos}
              catTecnologias={catTecnologias}
              DESP_ORIGENES={DESP_ORIGENES}
              DESP_DESTINOS={DESP_DESTINOS}
              generateDespConduce={generateDespConduce}
              despResetPistolero={despResetPistolero}
              fetchTasks={fetchTasks}
              despFase={despFase}
              setDespFase={setDespFase}
              despActiveMovements={despActiveMovements}
              setDespActiveMovements={setDespActiveMovements}
              despOrigen={despOrigen}
              setDespOrigen={setDespOrigen}
              despDestino={despDestino}
              setDespDestino={setDespDestino}
              despScanSN={despScanSN}
              setDespScanSN={setDespScanSN}
              despScannedItems={despScannedItems}
              setDespScannedItems={setDespScannedItems}
              despScanError={despScanError}
              setDespScanError={setDespScanError}
              despGuideNumber={despGuideNumber}
              setDespGuideNumber={setDespGuideNumber}
              despNotes={despNotes}
              setDespNotes={setDespNotes}
              despDispatching={despDispatching}
              setDespDispatching={setDespDispatching}
              despBoxModalOpen={despBoxModalOpen}
              setDespBoxModalOpen={setDespBoxModalOpen}
              despBoxTecnologia={despBoxTecnologia}
              setDespBoxTecnologia={setDespBoxTecnologia}
              despBoxMarca={despBoxMarca}
              setDespBoxMarca={setDespBoxMarca}
              despBoxModelo={despBoxModelo}
              setDespBoxModelo={setDespBoxModelo}
              despBoxCantidad={despBoxCantidad}
              setDespBoxCantidad={setDespBoxCantidad}
              despEditingMovementId={despEditingMovementId}
              setDespEditingMovementId={setDespEditingMovementId}
              despBoxNumber={despBoxNumber}
              setDespBoxNumber={setDespBoxNumber}
            />
          )}
        </div>
      </div>
      {selectedForOperation && (
        <OperationDrawer
          activeTab={activeTab}
          selectedForOperation={selectedForOperation}
          setSelectedForOperation={setSelectedForOperation}
          diagnosticResult={diagnosticResult}
          setDiagnosticResult={setDiagnosticResult}
          diagnosticNotes={diagnosticNotes}
          setDiagnosticNotes={setDiagnosticNotes}
          setFunctionalChecks={setFunctionalChecks}
          cosmeticClass={cosmeticClass}
          setCosmeticClass={setCosmeticClass}
          labelStatus={labelStatus}
          setLabelStatus={setLabelStatus}
          qcEtiqueta={qcEtiqueta}
          setQcEtiqueta={setQcEtiqueta}
          qcSello={qcSello}
          setQcSello={setQcSello}
          qcChecklist={qcChecklist}
          setQcChecklist={setQcChecklist}
          qcLegible={qcLegible}
          setQcLegible={setQcLegible}
          reacondTests={reacondTests}
          setReacondTests={setReacondTests}
          selectedDiagnostics={selectedDiagnostics}
          setSelectedDiagnostics={setSelectedDiagnostics}
          isCosmeticOpen={isCosmeticOpen}
          setIsCosmeticOpen={setIsCosmeticOpen}
          isLabelOpen={isLabelOpen}
          setIsLabelOpen={setIsLabelOpen}
          isDiagnosticsOpen={isDiagnosticsOpen}
          setIsDiagnosticsOpen={setIsDiagnosticsOpen}
          lockedCosmetic={lockedCosmetic}
          lockedDiagProfile={lockedDiagProfile}
          lockedDiagnostics={lockedDiagnostics}
          lockedRepProfile={lockedRepProfile}
          lockedRepairs={lockedRepairs}
          loading={loading}
          catDiagnosticos={catDiagnosticos}
          catReparaciones={catReparaciones}
          catTecnologias={catTecnologias}
          catModelos={catModelos}
          catReacondicionadoTests={catReacondicionadoTests}
          handleCompleteOperation={handleCompleteOperation}
        />
      )}
      {/* Modal de Historial */}
      {historyModalOpen.isOpen && historyModalOpen.item && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#181c3a]/40 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto">
          <Card className="max-w-lg w-full shadow-2xl animate-rise-in p-0 overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[85vh] rounded-t-[1.75rem] sm:rounded-3xl my-0 sm:my-4">
            <div className={`px-4 py-3 text-white flex justify-between items-center shrink-0 ${
              activeTab === 'diagnostico' ? 'bg-amber-500' :
              activeTab === 'reparacion' ? 'bg-blue-500' :
              activeTab === 'reacondicionado' ? 'bg-emerald-500' :
              activeTab === 'qc' ? 'bg-purple-500' :
              activeTab === 'l3' ? 'bg-orange-500' :
              activeTab === 'scraps' ? 'bg-rose-500' :
              activeTab === 'listo' ? 'bg-teal-500' :
              'bg-[#181c3a]'
            }`}>
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-1.5 rounded-lg bg-white/20 backdrop-blur-sm shrink-0">
                  <History className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="blue" className="font-black text-[8px] uppercase border-none text-white bg-white/20 backdrop-blur-sm">
                      {historyModalOpen.item.id}
                    </Badge>
                    <span className="text-white/80 font-mono text-[10px] truncate">{historyModalOpen.item.sn}</span>
                  </div>
                  <h3 className="text-sm font-black truncate">Historial de Operaciones</h3>
                </div>
              </div>
              <button onClick={() => setHistoryModalOpen({isOpen: false, item: null})} className="text-white/80 hover:text-white transition-colors shrink-0 ml-2">
                <XCircle size={22} strokeWidth={1.5} />
              </button>
            </div>
            
            <div className="p-4 space-y-3 overflow-y-auto flex-1 min-h-0">
              <div className="relative pl-4 border-l-2 border-slate-100 space-y-4">
                {loadingHistory ? (
                  <div className="py-6 text-center">
                    <Loader2 className="w-6 h-6 text-[#2ec4f1] animate-spin mx-auto" />
                    <p className="text-[9px] font-black text-slate-400 uppercase mt-2 tracking-widest">Cargando historial...</p>
                  </div>
                ) : historyItems.length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">No hay historial registrado.</p>
                  </div>
                ) : (
                  historyItems.map((record: any) => {
                    const isDiagnostic = record.action === 'DIAGNÓSTICO INICIAL COMPLETADO';
                    const payload = record.payload || {};
                    return (
                      <div className="relative" key={record.id}>
                        <div className={`absolute -left-[21px] top-0.5 bg-white border-2 rounded-full p-0.5 ${isDiagnostic ? 'border-amber-500' : 'border-blue-500'}`}>
                          {isDiagnostic ? (
                            <Stethoscope className="w-2.5 h-2.5 text-amber-500" />
                          ) : (
                            <Activity className="w-2.5 h-2.5 text-blue-500" />
                          )}
                        </div>
                        <div>
                          <h4 className="text-[11px] font-black text-[#181c3a] uppercase leading-tight">{record.action}</h4>
                          <p className="text-[9px] font-bold text-slate-400 mt-0.5">
                            {new Date(record.changed_at).toLocaleString()} • {record.profiles?.full_name?.toUpperCase() || 'SISTEMA'}
                          </p>
                          <div className="mt-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-[10px] text-slate-600 leading-snug">
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
                                  <div className="mt-2">
                                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#181c3a] text-white text-[9px] font-black tracking-wide">
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
                              <div className="space-y-2">
                                {payload.reason && <p className="text-[10px]"><strong>Motivo:</strong> {payload.reason}</p>}
                                {payload.status && (
                                  <div>
                                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#181c3a] text-white text-[9px] font-black tracking-wide">
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
        <ItemDetailModal
          item={showItemDetail}
          activeTab={activeTab}
          onClose={() => setShowItemDetail(null)}
        />
      )}

      {/* ===== MODAL DESPACHO SCRAPS (FULL FEATURED) ===== */}
      {scrapDispatchModal.isOpen && (
        <ScrapDispatchModal
          filteredTasks={filteredTasks}
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
          fetchTasks={fetchTasks}
          onClose={() => {
            setScrapDispatchModal({ isOpen: false, item: null });
            setScrapScannedItems([]);
            setScrapScanInput('');
            setScrapScanError('');
            setScrapBoxStep('crear_caja');
            setScrapBoxMarca('');
            setScrapBoxModelo('');
            setScrapBoxTecnologia('');
            setScrapBoxCantidad('');
            setScrapGuideNumber('');
            setScrapNotes('');
          }}
        />
      )}
      {/* MODAL RETURN TO STAGE */}
      {returnModalOpen.isOpen && (
        <ReturnStageModal
          item={returnModalOpen.item}
          returnTargetStage={returnTargetStage}
          setReturnTargetStage={setReturnTargetStage}
          loading={loading}
          onClose={() => setReturnModalOpen({ isOpen: false, item: null })}
          onConfirm={handleReturnToStage}
        />
      )}
    </ModulePage>
  );
}

