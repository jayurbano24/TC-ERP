"use client";

import React, { useState, useMemo, useRef } from 'react';
import { ModulePage } from "@/components/module-page";
import { Card, Button, Badge, notify, confirmDialog, DataTable, type DataTableColumn } from "@/components/ui";
import { Wrench, Stethoscope, Search, Filter, Box, Plus, Activity, AlertCircle, ArrowRight, XCircle, Clock, ChevronLeft, ChevronRight, ChevronDown, User, CheckSquare, ServerCrash, RefreshCw, Zap, Trash2, Loader2, RotateCcw, History, ClipboardList, Package, Send, ScanLine, X, BarChart3, Layers, Edit2, Eye, Printer, Download, MessageSquare, PackagePlus, Hourglass } from 'lucide-react';
import { type WorkshopTabId } from '@/modules/workshop/client/workshop';
import { fetchWorkshopTasksPageViaApi, locateWorkshopEquipmentViaApi, addWorkshopCommentViaApi, type WorkshopLocateResult } from '@/lib/api/workshopTasks';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';
import { parseWorkshopSearchTokens } from '@/modules/workshop/shared/workshopSearch';
import {
  entrySourceLabel,
  normalizeEntrySource,
  resolveEntrySource,
} from '@/modules/workshop/shared/entrySource';
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
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { ProductionOrderPanel } from '@/modules/production-order/components/ProductionOrderPanel';
import {
  catalogLabelKey,
  normalizeCatalogLabel,
} from '@/shared/catalogs/normalizeCatalogName';
import { ItemDetailModal } from './components/ItemDetailModal';
import { ReturnStageModal } from './components/ReturnStageModal';
import { ScrapDispatchModal } from './components/ScrapDispatchModal';
import { ScrapCommentModal } from './components/ScrapCommentModal';
import { DespachoView } from './components/DespachoView';
import { OperationDrawer } from './components/OperationDrawer';
import { RequestPartModal } from './components/RequestPartModal';
import { fetchOsPartStatus } from '@/lib/api/parts';

type TabType = 'diagnostico' | 'reparacion' | 'esperando_partes' | 'reacondicionado' | 'qc' | 'l3' | 'scraps' | 'listo' | 'despacho' | 'po';

const TALLER_TABLE_HEADER = 'bg-[var(--primary)]';
const TALLER_TABLE_HEADER_TEXT = 'text-[var(--primary-foreground)]';

/** Celda plana ERP: sin chips/cards; colores vía tokens de tema. */
function plainCell(value: string, muted = false) {
  return (
    <span
      className={`block truncate whitespace-nowrap text-xs font-medium ${
        muted ? 'text-[var(--muted)]' : 'text-[var(--foreground)]'
      }`}
      title={value}
    >
      {value}
    </span>
  );
}

export default function TallerPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('diagnostico');
  const useProductionOrderHex = isHexagonalProductionOrderEnabled();
  const [selectedForOperation, setSelectedForOperation] = useState<any | null>(null);
  const [showRequestPart, setShowRequestPart] = useState(false);
  const [requestPartTarget, setRequestPartTarget] = useState<any | null>(null);
  
  // Selection State
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  // Search State
  const [searchTerm, setSearchTerm] = useState('');
  // C5: el filtrado se hace contra el término debounced (no recalcula la cola en
  // cada tecla). El input sigue ligado a searchTerm para que se sienta fluido.
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);
  /** Filtro por tecnología + modelo (cascada; nombres normalizados sin duplicados). */
  const [techFilter, setTechFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');

  // CQRS Dashboard State (Strangler Fig) — desactivado en cliente hasta que
  // USE_NEW_PROD_DASHBOARD esté activo en prod. Evita 403 ruidosos en consola
  // cuando el flag/authz no permiten el endpoint opcional.
  const useNewDashboard = false;
  const dashboardKpis: {
    diagnosticosPendientes: number;
    diagnosticosEnProceso: number;
    reparacionesEnEspera: number;
    reparacionesActivas: number;
  } | null = null;

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
  const [commentModalOpen, setCommentModalOpen] = useState<{ isOpen: boolean; item: any | null }>({
    isOpen: false,
    item: null,
  });
  const [commentSaving, setCommentSaving] = useState(false);

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

  // ── Retornar a Bodega (antes Despacho Taller) ─────────────────────────────
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
  /** Evita que una respuesta lenta de otra pestaña pise la cola actual. */
  const tasksFetchSeqRef = useRef(0);
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
    if (activeTab === 'po' || activeTab === 'despacho') {
      setSelectedRows([]);
      return;
    }
    // Reset inmediato al cambiar pestaña (evita mostrar cola vieja filtrada a vacío).
    setTasks([]);
    setTasksCursor(null);
    setTasksHasMore(false);
    setTasksTotalOs(null);
    setLocateHint(null);
    setTechFilter('');
    setModelFilter('');
    setSelectedRows([]);
    void fetchTasks(false, debouncedSearchTerm);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchTasks captura activeTab al invocar
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
    const modelRow = catModelos.find((m: any) => m.id === t.model_id);
    let techId =
      t.models?.technology_id ||
      modelRow?.technology_id ||
      '';

    let brandId = t.brand_id || '';
    let modelId = t.model_id || '';
    const reception = Array.isArray(t.receptions) ? t.receptions[0] : t.receptions;
    let courierStr = reception?.carrier || 'Desconocido';
    const seriesEntryMap: Record<string, 'CAC' | 'PX'> = {};
    const rawMap = t.series_entry_map || {};
    for (const [sn, src] of Object.entries(rawMap)) {
      const label = entrySourceLabel(normalizeEntrySource(src));
      if (label) seriesEntryMap[sn] = label;
    }
    const resolvedSource = resolveEntrySource({
      entry_source: t.entry_source,
      receptions: reception,
      series_entry_map: rawMap,
      guide: reception?.guide_number,
      serial: t.all_sns?.[0] || t.serial_number,
    });
    const tipoIngreso = entrySourceLabel(resolvedSource);
    const sourceStr = tipoIngreso || '—';
    let agenciaStr = 'N/A';

    const notes = (reception?.notes || '').replace(/\\n/g, '\n');
    const receptionGuide = (reception?.reception_guides || []).find(
      (rg: any) => rg.guide_number === reception?.guide_number
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

    const tecnologiaName = normalizeCatalogLabel(
      t.models?.technologies?.name ||
        techName(techId) ||
        (techId && !/^cajas:/i.test(techId) ? techId : null) ||
        'EQUIPO'
    );
    const marcaName = normalizeCatalogLabel(
      t.brands?.name || brandName(brandId) || brandId || 'Desconocida'
    );
    const modeloName = normalizeCatalogLabel(
      t.models?.name || modelName(modelId) || modelId || 'S/N'
    );

    const stageRaw = t.current_status === 'in_workshop' ? 'PARA DIAGNOSTICAR'
      : t.current_status === 'in_qc' ? 'REPARACION'
      : t.current_status === 'waiting_parts' ? 'ESPERANDO PARTES'
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

    const displayAt = t.stage_entered_at || t.updated_at;
    const diagIds = Array.isArray(t.current_diagnostics)
      ? t.current_diagnostics.map(String).filter(Boolean)
      : [];
    const diagnosticoLabel = (() => {
      if (diagIds.length > 0) {
        const names = diagIds
          .map((id) => {
            const hit = catDiagnosticos.find(
              (d: { id?: string; nombre?: string; name?: string }) => String(d.id) === id
            );
            return String(hit?.nombre || hit?.name || '').trim() || null;
          })
          .filter(Boolean);
        if (names.length > 0) return names.join(' · ');
      }
      const reason = String(t.l3_reason_text || '').trim();
      if (reason) return reason;
      return 'Sin diagnóstico registrado';
    })();

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
      // FECHA = envío a Diagnóstico (dispersión/auditoría), no updated_at del sync SAP.
      updatedAt: displayAt ? new Date(displayAt).toLocaleString() : 'Desconocida',
      fecha: displayAt
        ? new Date(displayAt).toLocaleDateString('es-GT', { day: 'numeric', month: 'numeric', year: 'numeric' })
        : '—',
      hora: displayAt
        ? new Date(displayAt).toLocaleTimeString('es-GT', { hour: 'numeric', minute: '2-digit' })
        : '',
      etapa: stageRaw,
      responsable: responsableName,
      dbId: t.service_order_id || t.id,
      all_dbIds: t.all_dbIds?.length ? t.all_dbIds : [t.id],
      tipo_ingreso: sourceStr,
      courier_name: courierStr,
      courier: `${sourceStr} – ${courierStr}`,
      series_entry_map: seriesEntryMap,
      agencia: agenciaStr,
      guide: reception?.guide_number || 'S/G',
      ingress_count: t.ingress_count || 1,
      current_diagnostics: diagIds,
      diagnosticoLabel,
      brandId: t.brand_id || brandId || null,
      modelId: t.model_id || modelId || null,
      seriesId: t.all_dbIds?.[0] || t.id || null,
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
    if (activeTab === 'esperando_partes') {
      notify.info('Esta OS espera piezas. Usa Bodega de Partes para despachar, o abre en Reparación tras el despacho.');
      return;
    }
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

    const workshopTab = activeTab as WorkshopTabId;
    const seq = append ? tasksFetchSeqRef.current : ++tasksFetchSeqRef.current;

    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
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

      // Respuesta obsoleta (el usuario ya cambió de pestaña / relanzó búsqueda).
      if (seq !== tasksFetchSeqRef.current) return;

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
          if (seq !== tasksFetchSeqRef.current) return;
          setLocateHint(
            loc.found &&
              (loc.outsideWorkshop || (Boolean(loc.tab) && loc.tab !== workshopTab))
              ? loc
              : null
          );
        } catch {
          if (seq === tasksFetchSeqRef.current) setLocateHint(null);
        }
      } else if (!append) {
        setLocateHint(null);
      }
    } catch (err) {
      if (seq !== tasksFetchSeqRef.current) return;
      const message =
        err instanceof Error && /failed to fetch/i.test(err.message)
          ? 'Servidor no disponible (reinicio o compilación). Recarga en unos segundos.'
          : err instanceof Error
            ? err.message
            : undefined;
      console.error('Error loading workshop tasks:', err);
      notify.error('No se pudo cargar la cola de taller', { description: message });
      if (!append) {
        setTasks([]);
        setLocateHint(null);
      }
    } finally {
      if (seq === tasksFetchSeqRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
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
          diagnostico: a.diagnosticoLabel || '',
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

    if (diagnosticResult === 'l3') {
      const priorDiags = Array.isArray(selectedForOperation.current_diagnostics)
        ? selectedForOperation.current_diagnostics
        : [];
      const hasCatalogDiag =
        (activeTab === 'diagnostico' && selectedDiagnostics.length > 0) ||
        lockedDiagnostics.length > 0 ||
        priorDiags.length > 0;
      const hasNotes = diagnosticNotes.trim().length > 0;
      if (!hasCatalogDiag && !hasNotes) {
        notify.warning('Para enviar a L3 indique el diagnóstico del catálogo o un motivo en observaciones.');
        return;
      }
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

    if (diagnosticResult === 'l3' && diagnosticNotes.trim()) {
      finalNotes += `Motivo L3: ${diagnosticNotes.trim()}\n\n`;
    }
    
    finalNotes += `Notas adicionales: ${diagnosticNotes || 'Sin notas adicionales'}`;

    const actionName = activeTab === 'diagnostico' ? 'DIAGNÓSTICO INICIAL COMPLETADO'
      : activeTab === 'reparacion' ? 'REPARACIÓN COMPLETADA'
      : activeTab === 'qc' ? 'CONTROL DE CALIDAD COMPLETADO'
      : activeTab === 'reacondicionado' ? 'REACONDICIONADO COMPLETADO'
      : activeTab === 'l3' ? 'REPARACIÓN L3 COMPLETADA'
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

      if (activeTab === 'reparacion' || activeTab === 'qc' || activeTab === 'reacondicionado') {
        const items = Array.isArray(selectedForOperation)
          ? selectedForOperation
          : [selectedForOperation];
        for (const item of items) {
          const osId = item?.dbId || item?.groupId;
          if (!osId) continue;
          try {
            const partStatus = await fetchOsPartStatus(String(osId));
            if (partStatus.pendingReturns?.length > 0) {
              notify.warning(
                'Hay una pieza reemplazada pendiente de retorno a Bodega Mala. Debe entregarse antes de avanzar.'
              );
              return;
            }
          } catch (error: unknown) {
            notify.error('No se pudo validar el retorno de piezas', {
              description: error instanceof Error ? error.message : 'Error desconocido',
            });
            return;
          }
        }
      }

      setOperateProgress({
        processedSeries: 0,
        totalSeries: seriesIds.length,
        equipmentCount,
      });

      const processedSeries = await operateWorkshopInBatches(
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
            totalSeries: Math.max(p.totalSeries, p.processedSeries),
            equipmentCount: p.equipmentCount,
          })
      );

      notify.success(
        Array.isArray(selectedForOperation)
          ? `${equipmentCount} equipo${equipmentCount !== 1 ? 's' : ''} trasladados (${processedSeries} series).`
          : `Equipo trasladado completo (${processedSeries} serie${processedSeries !== 1 ? 's' : ''}).`
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
        reason:
          activeTab === 'scraps'
            ? 'Regreso desde cola SCRAPS'
            : 'Movido manualmente desde Taller',
        clearBoxId: activeTab === 'scraps',
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

  const handleSaveScrapComment = async (comment: string) => {
    const item = commentModalOpen.item;
    if (!item) return;
    setCommentSaving(true);
    try {
      const seriesIds = item.all_dbIds?.length ? item.all_dbIds : [item.dbId];
      await addWorkshopCommentViaApi({
        seriesIds,
        comment,
        tab: activeTab,
      });
      notify.success('Comentario guardado', {
        description: `OS ${item.os || item.id || ''} — visible en historial`,
      });
      setCommentModalOpen({ isOpen: false, item: null });
    } catch (error: unknown) {
      notify.error('No se pudo guardar el comentario', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setCommentSaving(false);
    }
  };

  const tabs = [
    ...(useProductionOrderHex
      ? [{ id: 'po', label: 'PO Taller', icon: ClipboardList, color: 'text-cyan-600', bg: 'bg-cyan-50' }]
      : []),
    { id: 'diagnostico', label: 'Diagnóstico', icon: Stethoscope, color: 'text-amber-500', bg: 'bg-amber-50' },
    { id: 'reparacion', label: 'Reparación', icon: Wrench, color: 'text-blue-500', bg: 'bg-blue-50' },
    { id: 'esperando_partes', label: 'Esperando Partes', icon: Hourglass, color: 'text-sky-600', bg: 'bg-sky-50' },
    { id: 'reacondicionado', label: 'Reacondicionado', icon: RefreshCw, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { id: 'qc', label: 'Control de Calidad', icon: CheckSquare, color: 'text-purple-500', bg: 'bg-purple-50' },
    { id: 'l3', label: 'L3 (Avanzado)', icon: Zap, color: 'text-orange-500', bg: 'bg-orange-50' },
    { id: 'scraps', label: 'SCRAPS', icon: Trash2, color: 'text-rose-500', bg: 'bg-rose-50' },
    // Equipo Listo no es pestaña: solo destino "Aceptado → Listo" en Control de Calidad.
    { id: 'despacho', label: 'Retornar a Bodega', icon: Send, color: 'text-indigo-500', bg: 'bg-indigo-50' },
  ];

  // La API ya filtra por pestaña; no re-filtrar por etapa (evita cola vacía si hay
  // desfase de mapeo o una respuesta cruzada residual).
  const tabTasks = tasks;

  const techFilterOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const t of tabTasks) {
      const name = normalizeCatalogLabel(t.tecnologia);
      const key = catalogLabelKey(name);
      if (!key || key === 'EQUIPO') continue;
      if (!byKey.has(key)) byKey.set(key, name);
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'es'));
  }, [tabTasks]);

  const modelFilterOptions = useMemo(() => {
    const techKey = catalogLabelKey(techFilter);
    const byKey = new Map<string, string>();
    for (const t of tabTasks) {
      if (techKey && catalogLabelKey(t.tecnologia) !== techKey) continue;
      const name = normalizeCatalogLabel(t.modelo);
      const key = catalogLabelKey(name);
      if (!key || key === 'S/N' || key === 'DESCONOCIDA') continue;
      if (!byKey.has(key)) byKey.set(key, name);
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'es'));
  }, [tabTasks, techFilter]);

  const filteredTasks = useMemo(() => {
    const techKey = catalogLabelKey(techFilter);
    const modelKey = catalogLabelKey(modelFilter);
    return tabTasks.filter((t) => {
      if (techKey && catalogLabelKey(t.tecnologia) !== techKey) return false;
      if (modelKey && catalogLabelKey(t.modelo) !== modelKey) return false;
      // Con término de búsqueda la API ya filtró por serie/OS en toda la cola.
      return true;
    });
  }, [tabTasks, techFilter, modelFilter, debouncedSearchTerm]);

  // Cascada: limpiar filtros inválidos al cambiar pestaña / tech.
  useEffect(() => {
    if (techFilter && !techFilterOptions.some((n) => catalogLabelKey(n) === catalogLabelKey(techFilter))) {
      setTechFilter('');
    }
  }, [techFilter, techFilterOptions]);

  useEffect(() => {
    if (modelFilter && !modelFilterOptions.some((n) => catalogLabelKey(n) === catalogLabelKey(modelFilter))) {
      setModelFilter('');
    }
  }, [modelFilter, modelFilterOptions]);

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
            <Card className="rounded-2xl border-2 border-[var(--accent)] bg-[var(--primary)] p-4 text-[var(--primary-foreground)]">
              <h3 className="text-[10px] font-black tracking-widest uppercase opacity-80">Diagnósticos Pendientes</h3>
              <p className="mt-2 text-3xl font-black text-[var(--accent)]">{dashboardKpis.diagnosticosPendientes}</p>
            </Card>
            <Card className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <h3 className="text-[10px] font-black tracking-widest text-[var(--muted)] uppercase">Diag. En Proceso</h3>
              <p className="mt-2 text-3xl font-black text-amber-500">{dashboardKpis.diagnosticosEnProceso}</p>
            </Card>
            <Card className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <h3 className="text-[10px] font-black tracking-widest text-[var(--muted)] uppercase">Reparaciones en Espera</h3>
              <p className="mt-2 text-3xl font-black text-blue-500">{dashboardKpis.reparacionesEnEspera}</p>
            </Card>
            <Card className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <h3 className="text-[10px] font-black tracking-widest text-[var(--muted)] uppercase">Reparaciones Activas</h3>
              <p className="mt-2 text-3xl font-black text-emerald-500">{dashboardKpis.reparacionesActivas}</p>
            </Card>
          </div>
        )}

        {/* Navigation Tabs - scroll horizontal en pantallas medianas */}
        <div className="custom-scrollbar -mx-1 overflow-x-auto px-1 pb-1">
          <div className="flex w-full min-w-0 flex-wrap gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-hover)] p-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-3 text-[9px] font-black tracking-widest uppercase transition-all sm:gap-3 sm:px-4 sm:text-[10px] lg:px-5 sm:py-3.5 ${
                  isActive
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-md'
                    : 'text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--heading)]'
                }`}
              >
                <Icon size={16} className={isActive ? 'text-[var(--accent)]' : tab.color} />
                <span className="flex items-center gap-1.5 whitespace-nowrap sm:gap-2">
                  {tab.label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[8px] font-black sm:px-2 sm:text-[9px] ${
                      isActive
                        ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                        : 'bg-[var(--border)] text-[var(--muted)]'
                    }`}
                  >
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

            const tallerColumns: DataTableColumn<any>[] = [
              {
                id: 'select',
                width: '28px',
                align: 'center',
                header: (
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]"
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
                    className="h-3.5 w-3.5 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]"
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
                cell: (item: any) => plainCell(String(item.id || '—')),
              },
              ...Array.from({ length: WORKSHOP_SERIES_SLOTS }, (_, i) => ({
                id: `s${i + 1}`,
                header: `S${i + 1}`,
                width: 'minmax(90px, 0.85fr)',
                cell: (item: any) => {
                  const serial = seriesAt(item, i);
                  if (!serial) return plainCell('—', true);
                  return (
                    <button
                      type="button"
                      onClick={() => setShowItemDetail(item)}
                      title={serial}
                      className="block w-full min-w-0 truncate text-left text-xs font-medium whitespace-nowrap text-[var(--foreground)] hover:text-[var(--heading)] hover:underline"
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
                    cell: (item: any) => plainCell(String(item.tecnologia || '—').toUpperCase()),
                  } as DataTableColumn<any>]
                : []),
              {
                id: 'modelo',
                header: 'Modelo',
                width: 'minmax(0,0.8fr)',
                cell: (item: any) =>
                  plainCell(`${item.marca || ''} ${item.modelo || ''}`.trim().toUpperCase() || '—'),
              },
              {
                id: 'caja',
                header: 'Caja',
                width: 'minmax(0,0.45fr)',
                cell: (item: any) => plainCell(String(item.boxCode || '—'), !item.boxCode),
              },
              ...(activeTab === 'l3'
                ? [
                    {
                      id: 'diagnostico',
                      header: 'Diagnóstico',
                      width: 'minmax(140px, 1.2fr)',
                      cell: (item: any) => {
                        const label = String(item.diagnosticoLabel || 'Sin diagnóstico registrado');
                        const empty = label === 'Sin diagnóstico registrado';
                        return (
                          <span
                            title={label}
                            className={`block min-w-0 truncate text-xs font-medium ${
                              empty ? 'text-[var(--muted)] italic' : 'text-[var(--foreground)]'
                            }`}
                          >
                            {label}
                          </span>
                        );
                      },
                    } as DataTableColumn<any>,
                  ]
                : []),
              {
                id: 'fecha',
                header: 'Fecha',
                width: 'minmax(0,0.85fr)',
                cell: (item: any) => {
                  const label = [item.fecha, item.hora].filter(Boolean).join(' ');
                  return plainCell(label || '—', !label);
                },
              },
              {
                id: 'ingresos',
                header: 'Ingresos',
                width: 'minmax(0,0.7fr)',
                cell: (item: any) =>
                  plainCell(ingressLabel(item.ingress_count), item.ingress_count > 1),
              },
              {
                id: 'accion',
                header: 'Acc.',
                width:
                  activeTab === 'diagnostico'
                    ? '40px'
                    : activeTab === 'reparacion'
                      ? '116px'
                      : activeTab === 'scraps'
                        ? '96px'
                        : '84px',
                sticky: 'end',
                align: 'right',
                headerClassName: `justify-end ${TALLER_TABLE_HEADER} ${TALLER_TABLE_HEADER_TEXT}`,
                cell: (item: any) => (
                  <div className="flex items-center justify-end gap-0.5">
                    {activeTab === 'reparacion' && (
                      <button
                        type="button"
                        onClick={() => {
                          setRequestPartTarget(item);
                          setShowRequestPart(true);
                        }}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-sky-200 bg-sky-50 text-sky-700 transition-colors hover:border-sky-400 hover:bg-sky-100"
                        title="Solicitar pieza a Bodega de Partes"
                        aria-label={`Solicitar pieza para ${item.id || item.sn || 'la OS'}`}
                      >
                        <PackagePlus size={13} />
                      </button>
                    )}
                    {activeTab !== 'diagnostico' && (
                      <button
                        type="button"
                        onClick={() => {
                          setReturnModalOpen({ isOpen: true, item });
                          setReturnTargetStage('in_workshop');
                        }}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--border)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--heading)]"
                        title="Regresar a otra etapa"
                        aria-label="Regresar a otra etapa"
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}
                    {activeTab === 'scraps' && (
                      <button
                        type="button"
                        onClick={() => setCommentModalOpen({ isOpen: true, item })}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--border)] text-[var(--muted)] transition-colors hover:bg-rose-50 hover:text-rose-700"
                        title="Agregar comentario"
                        aria-label="Agregar comentario"
                      >
                        <MessageSquare size={12} />
                      </button>
                    )}
                    {activeTab !== 'diagnostico' && (
                      <button
                        type="button"
                        onClick={() => setHistoryModalOpen({ isOpen: true, item })}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--border)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--heading)]"
                        title="Ver historial"
                        aria-label="Ver historial"
                      >
                        <History size={12} />
                      </button>
                    )}
                    {activeTab !== 'scraps' && (
                      <button
                        type="button"
                        title="Evaluar"
                        aria-label="Evaluar"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--border)] bg-[var(--primary)] text-[var(--primary-foreground)] transition-colors hover:opacity-90"
                        onClick={() => void openOperationForSelection(item)}
                      >
                        <ArrowRight size={12} />
                      </button>
                    )}
                  </div>
                ),
              },
            ];

            return (
              <div className="space-y-6">
                {locateHint?.found && (locateHint.outsideWorkshop || (locateHint.tab && locateHint.tabLabel)) && (
                  <div className="flex flex-col justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-6 py-4 sm:flex-row sm:items-center">
                    <p className="text-sm font-bold text-[var(--heading)]">
                      {locateHint.outsideWorkshop ? (
                        <>
                          {locateHint.osLabel || locateHint.serial}{' '}
                          <span className="text-amber-600 dark:text-amber-400">
                            {locateHint.message ||
                              'está en Bodega Central; no ha sido despachado a Taller.'}
                          </span>
                          {locateHint.locationLabel ? (
                            <span className="mt-1 block text-xs font-semibold text-[var(--muted)]">
                              Ubicación: {locateHint.locationLabel}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <>
                          {locateHint.osLabel || locateHint.serial} está en{' '}
                          <span className="text-amber-600 dark:text-amber-400">{locateHint.tabLabel}</span>
                          {locateHint.tab !== activeTab && (
                            <>
                              , no en {tabs.find((t) => t.id === activeTab)?.label || 'esta pestaña'}.
                              {' '}La cola de Taller es compartida — todos los operadores ven los mismos equipos.
                            </>
                          )}
                        </>
                      )}
                    </p>
                    {!locateHint.outsideWorkshop && locateHint.tab && locateHint.tab !== activeTab && (
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
                <div className="flex min-w-0 flex-col gap-3 border border-[var(--border)] bg-[var(--surface)] p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-4">
                  {/* Búsqueda + filtros tecnología → modelo */}
                  <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-stretch xl:max-w-3xl xl:flex-1">
                    <div className="relative min-w-0 flex-1">
                      <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-[var(--muted)]" />
                      <textarea
                        placeholder={`Buscar serie u OS… (pegar hasta ${BATCH_LIMITS.WORKSHOP_SEARCH_MAX_SERIALS} series)`}
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                        }}
                        rows={2}
                        className="custom-scrollbar w-full min-w-0 resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] py-2.5 pr-3 pl-10 text-xs font-medium text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
                      />
                    </div>
                    <div className="relative w-full shrink-0 sm:w-40">
                      <Filter className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" />
                      <select
                        value={techFilter}
                        onChange={(e) => {
                          setTechFilter(e.target.value);
                          setModelFilter('');
                        }}
                        aria-label="Filtrar por tecnología"
                        className="h-full min-h-[42px] w-full appearance-none rounded-md border border-[var(--border)] bg-[var(--surface)] py-2 pr-8 pl-8 text-xs font-bold text-[var(--foreground)] outline-none transition-colors focus:border-[var(--accent)]"
                      >
                        <option value="">Toda tecnología</option>
                        {techFilterOptions.map((name) => (
                          <option key={catalogLabelKey(name)} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                      {techFilter ? (
                        <button
                          type="button"
                          title="Quitar filtro de tecnología"
                          onClick={() => {
                            setTechFilter('');
                            setModelFilter('');
                          }}
                          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-[var(--muted)] hover:text-[var(--heading)]"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                    <div className="relative w-full shrink-0 sm:w-44">
                      <Filter className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" />
                      <select
                        value={modelFilter}
                        onChange={(e) => setModelFilter(e.target.value)}
                        aria-label="Filtrar por modelo"
                        disabled={Boolean(techFilter) && modelFilterOptions.length === 0}
                        className="h-full min-h-[42px] w-full appearance-none rounded-md border border-[var(--border)] bg-[var(--surface)] py-2 pr-8 pl-8 text-xs font-bold text-[var(--foreground)] outline-none transition-colors focus:border-[var(--accent)] disabled:opacity-60"
                      >
                        <option value="">
                          {techFilter ? 'Modelos de la tech' : 'Todos los modelos'}
                        </option>
                        {modelFilterOptions.map((name) => (
                          <option key={catalogLabelKey(name)} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                      {modelFilter ? (
                        <button
                          type="button"
                          title="Quitar filtro de modelo"
                          onClick={() => setModelFilter('')}
                          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-[var(--muted)] hover:text-[var(--heading)]"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Acciones — envuelven en varias filas si no caben */}
                  <div className="flex w-full min-w-0 flex-wrap items-center justify-start gap-2 sm:gap-3 xl:w-auto xl:justify-end">
                    <Button
                      variant="outline"
                      className="border-[var(--border)] text-[10px] font-black tracking-widest text-[var(--foreground)] uppercase"
                      leftIcon={exportingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      disabled={exportingReport}
                      onClick={() => void handleExportTabReport()}
                    >
                      {exportingReport ? 'Exportando…' : 'Exportar Reporte'}
                    </Button>

                    {activeTab === 'scraps' ? (
                      <div className="flex flex-wrap gap-2 w-full xl:w-auto">
                        <Button
                          variant="primary"
                          className="bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-500/20 font-black"
                          leftIcon={<Package className="w-4 h-4" />}
                          onClick={() => {
                            setScrapScannedItems([]);
                            setScrapScanError('');
                            setScrapBoxStep('crear_caja');
                            setScrapBoxMarca('');
                            setScrapBoxModelo('');
                            setScrapBoxTecnologia('');
                            setScrapBoxCantidad('');
                            setScrapGuideNumber('');
                            setScrapNotes('');
                            setScrapActiveView('pistolero');
                            setScrapDispatchModal({ isOpen: true, item: null });
                          }}
                        >
                          Crear Caja Bodega SCRAPS
                        </Button>
                        {selectedRows.length > 0 && (
                          <Button
                            variant="outline"
                            className="border-rose-300 text-rose-700 hover:bg-rose-50 font-black"
                            leftIcon={<Send className="w-4 h-4" />}
                            onClick={() => {
                              const selectedItems = filteredTasks.filter((t) =>
                                selectedRows.includes(t.dbId)
                              );
                              const combined = {
                                id: selectedItems.map((i) => i.id).join(', '),
                                sn: selectedItems[0]?.sn,
                                marca: selectedItems[0]?.marca,
                                modelo: selectedItems[0]?.modelo,
                                tecnologia: selectedItems[0]?.tecnologia,
                                all_sns: selectedItems.flatMap((i) => i.all_sns),
                                all_dbIds: selectedItems.flatMap(
                                  (i) => i.all_dbIds || [i.dbId]
                                ),
                              };
                              setScrapScannedItems([]);
                              setScrapScanError('');
                              setScrapBoxStep('crear_caja');
                              setScrapGuideNumber('');
                              setScrapNotes('');
                              setScrapActiveView('pistolero');
                              setScrapDispatchModal({ isOpen: true, item: combined });
                            }}
                          >
                            Despachar Selección ({selectedRows.length})
                          </Button>
                        )}
                      </div>
                    ) : selectedRows.length > 0 ? (
                      <div className="flex flex-wrap gap-2 animate-rise-in w-full xl:w-auto">
                            {activeTab === 'reparacion' && selectedRows.length > 1 && (
                              <Button
                                variant="outline"
                                className="border-sky-300 bg-sky-50 text-sky-800 font-black"
                                leftIcon={<PackagePlus className="w-4 h-4" />}
                                onClick={() => {
                                  const selectedItems = filteredTasks.filter((task) =>
                                    selectedRows.includes(task.dbId)
                                  );
                                  setRequestPartTarget(selectedItems);
                                  setShowRequestPart(true);
                                }}
                              >
                                Solicitar pieza por lote ({selectedRows.length} OS)
                              </Button>
                            )}
                            <Button 
                              variant="primary" 
                              className="bg-[var(--primary)] text-[var(--primary-foreground)] shadow-lg hover:opacity-90" 
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
                      </div>
                    ) : (
                      <div className="w-full xl:w-auto xl:text-right">
                        <Button
                          variant="outline"
                          className="w-full cursor-not-allowed whitespace-normal border-[var(--border)] text-center text-[var(--muted)] opacity-50 hover:bg-[var(--surface-hover)] sm:w-auto"
                        >
                          Selecciona equipos para acciones masivas
                        </Button>
                        <p className="mt-1 text-[9px] font-black text-[var(--muted)]">
                          Máx. {BATCH_LIMITS.WORKSHOP_OPERATE_MAX_EQUIPMENTS} equipos / {BATCH_LIMITS.WORKSHOP_OPERATE_MAX_SERIES} series
                        </p>
                      </div>
                    )}

                  </div>
                </div>

                <Card padding="none" className="min-w-0 w-full overflow-hidden border border-[var(--border)] bg-[var(--surface)] p-0 shadow-sm">
                  {operateProgress ? (
                    <div className="space-y-4 px-8 py-16 text-center">
                      <Loader2 className="mx-auto h-8 w-8 animate-spin text-[var(--muted)]" />
                      <p className="text-xs font-semibold tracking-wide text-[var(--foreground)] uppercase">
                        Traspasando {operateProgress.equipmentCount} equipo
                        {operateProgress.equipmentCount !== 1 ? 's' : ''}…{' '}
                        {operateProgress.processedSeries}/{operateProgress.totalSeries} series
                      </p>
                      <div className="mx-auto h-1.5 max-w-md overflow-hidden rounded-full bg-[var(--border)]">
                        <div
                          className="h-full bg-[var(--accent)] transition-all duration-300"
                          style={{
                            width: `${Math.min(100, Math.round((operateProgress.processedSeries / operateProgress.totalSeries) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  ) : loading ? (
                    <div className="py-20 text-center">
                      <Loader2 className="mx-auto h-8 w-8 animate-spin text-[var(--muted)]" />
                      <p className="mt-4 text-[10px] font-semibold tracking-widest text-[var(--muted)] uppercase">
                        Sincronizando con servidor…
                      </p>
                    </div>
                  ) : (
                    <>
                      <DataTable
                        columns={tallerColumns}
                        data={filteredTasks}
                        getRowId={(item: any) => item.groupId || item.dbId}
                        rowHeight={36}
                        maxBodyHeight={680}
                        compact
                        headerClassName={TALLER_TABLE_HEADER}
                        headerTextClassName={TALLER_TABLE_HEADER_TEXT}
                        emptyMessage="No hay equipos en cola"
                        rowClassName={(item: any) =>
                          selectedRows.includes(item.dbId) ? 'bg-[var(--accent)]/10' : undefined
                        }
                      />
                      <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--surface-hover)] px-3 py-2">
                        <span className="text-[10px] font-semibold tracking-widest text-[var(--muted)] uppercase">
                          {tasksTotalOs != null
                            ? `${filteredTasks.length} de ${tasksTotalOs} equipos en cola`
                            : `${filteredTasks.length} equipos en cola`}
                          {tabCounts[activeTab] != null && tasksTotalOs != null && tabCounts[activeTab] !== tasksTotalOs && (
                            <span className="text-[var(--muted)]"> · badge {tabCounts[activeTab]}</span>
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

          {/* ════════════ TAB: RETORNAR A BODEGA ════════════ */}
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
          onRequestPart={() => {
            const target = Array.isArray(selectedForOperation)
              ? selectedForOperation[0]
              : selectedForOperation;
            setRequestPartTarget(target);
            setShowRequestPart(true);
          }}
        />
      )}
      {showRequestPart && requestPartTarget && (
        <RequestPartModal
          open={showRequestPart}
          onClose={() => {
            setShowRequestPart(false);
            setRequestPartTarget(null);
          }}
          onCreated={async () => {
            setSelectedForOperation(null);
            setSelectedRows([]);
            await queryClient.invalidateQueries({ queryKey: ['workshop-tab-counts'] });
            setActiveTab('esperando_partes');
          }}
          targets={(Array.isArray(requestPartTarget) ? requestPartTarget : [requestPartTarget]).map(
            (target) => ({
              serviceOrderId: String(target.dbId || target.groupId),
              seriesId: target.seriesId || target.all_dbIds?.[0] || null,
              seriesIds: (target.all_dbIds || [target.seriesId]).filter(Boolean),
              serialNumber: target.sn || null,
              serialNumbers: (target.all_sns || [target.sn]).filter(Boolean),
              brandId: target.brandId || null,
              modelId: target.modelId || null,
              brandName: target.marca || null,
              modelName: target.modelo || null,
              osLabel: target.id || null,
            })
          )}
        />
      )}
      {/* Modal de Historial */}
      {historyModalOpen.isOpen && historyModalOpen.item && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <Card className="my-0 flex max-h-[92dvh] w-full max-w-lg animate-rise-in flex-col overflow-hidden rounded-t-[1.75rem] p-0 shadow-2xl sm:my-4 sm:max-h-[85vh] sm:rounded-3xl">
            <div className="flex shrink-0 items-center justify-between bg-[var(--primary)] px-4 py-3 text-[var(--primary-foreground)]">
              <div className="flex min-w-0 items-center gap-2">
                <div className="shrink-0 rounded-lg bg-white/20 p-1.5 backdrop-blur-sm">
                  <History className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="blue" className="border-none bg-white/20 text-[8px] font-black text-white uppercase backdrop-blur-sm">
                      {historyModalOpen.item.id}
                    </Badge>
                    <span className="truncate font-mono text-[10px] text-white/80">{historyModalOpen.item.sn}</span>
                  </div>
                  <h3 className="truncate text-sm font-black">Historial de Operaciones</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHistoryModalOpen({ isOpen: false, item: null })}
                className="ml-2 shrink-0 text-white/80 transition-colors hover:text-white"
              >
                <XCircle size={22} strokeWidth={1.5} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[var(--surface)] p-4 text-[var(--foreground)]">
              <div className="relative space-y-4 border-l-2 border-[var(--border)] pl-4">
                {loadingHistory ? (
                  <div className="py-6 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-[var(--accent)]" />
                    <p className="mt-2 text-[9px] font-black tracking-widest text-[var(--muted)] uppercase">
                      Cargando historial...
                    </p>
                  </div>
                ) : historyItems.length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="text-[9px] font-black tracking-widest text-[var(--muted)] uppercase">
                      No hay historial registrado.
                    </p>
                  </div>
                ) : (
                  historyItems.map((record: any) => {
                    const isDiagnostic = record.action === 'DIAGNÓSTICO INICIAL COMPLETADO';
                    const isWorkshopComplete =
                      isDiagnostic || String(record.action || '').includes('COMPLETAD');
                    const payload = record.payload || {};
                    const statusLabel = (status: string) => {
                      if (status === 'in_workshop') return 'DIAGNÓSTICO';
                      if (status === 'in_qc') return 'REPARACIÓN';
                      if (status === 'in_validation') return 'CONTROL DE CALIDAD';
                      if (status === 'in_control_warehouse') return 'L3';
                      if (status === 'ready_to_dispatch') return 'REACONDICIONADO';
                      if (status === 'scrapped' || status === 'irreparable') return 'SCRAPS';
                      if (status === 'in_central_warehouse') return 'EQUIPO LISTO / BODEGA';
                      if (status === 'RECEPCIONADO_BODEGA_GENERAL') return 'BACKOFFICE';
                      return String(status).replace(/_/g, ' ').toUpperCase();
                    };
                    const lifecycleComment =
                      (typeof payload.notes === 'string' && payload.notes) ||
                      (typeof payload.observations === 'string' && payload.observations) ||
                      (typeof payload.comment === 'string' && payload.comment) ||
                      (typeof payload.box === 'string' && `Caja ${payload.box}`) ||
                      '';
                    const hidePayloadKeys = new Set([
                      'reason',
                      'status',
                      'notes',
                      'observations',
                      'comment',
                      'operator_name',
                      'registered_by',
                      'classified_by',
                      'source',
                      'box',
                      'box_id',
                      'nextStatus',
                      'result',
                      'items',
                      'repairs',
                      'diagnostics',
                    ]);
                    return (
                      <div className="relative" key={record.id}>
                        <div
                          className={`absolute -left-[21px] top-0.5 rounded-full border-2 bg-[var(--surface)] p-0.5 ${
                            isDiagnostic ? 'border-amber-500' : 'border-[var(--accent)]'
                          }`}
                        >
                          {isDiagnostic ? (
                            <Stethoscope className="h-2.5 w-2.5 text-amber-500" />
                          ) : (
                            <Activity className="h-2.5 w-2.5 text-[var(--accent)]" />
                          )}
                        </div>
                        <div>
                          <h4 className="text-[11px] leading-tight font-black text-[var(--heading)] uppercase">
                            {record.action}
                          </h4>
                          <p className="mt-0.5 text-[9px] font-bold text-[var(--muted)]">
                            {new Date(record.changed_at).toLocaleString()} •{' '}
                            {record.profiles?.full_name?.toUpperCase() || 'SISTEMA'}
                          </p>
                          <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] p-2.5 text-[10px] leading-snug text-[var(--foreground)]">
                            {isWorkshopComplete ? (
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
                                    <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--primary)] px-2 py-1 text-[9px] font-black tracking-wide text-[var(--primary-foreground)]">
                                      <span className="text-white/60">DERIVADO A:</span>
                                      {statusLabel(String(payload.nextStatus))}
                                    </span>
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="space-y-2">
                                {payload.reason && (
                                  <p className="text-[10px]">
                                    <strong>Motivo:</strong> {payload.reason}
                                  </p>
                                )}
                                {lifecycleComment && (
                                  <p className="whitespace-pre-wrap text-[10px]">
                                    <strong>Detalle:</strong> {lifecycleComment}
                                  </p>
                                )}
                                {payload.status && (
                                  <div>
                                    <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--primary)] px-2 py-1 text-[9px] font-black tracking-wide text-[var(--primary-foreground)]">
                                      <span className="text-white/60">ESTADO:</span>
                                      {statusLabel(String(payload.status))}
                                    </span>
                                  </div>
                                )}
                                {Object.keys(payload)
                                  .filter((k) => !hidePayloadKeys.has(k))
                                  .filter((k) => {
                                    const v = payload[k];
                                    return v !== null && v !== undefined && v !== '' && typeof v !== 'object';
                                  })
                                  .slice(0, 6)
                                  .map((k) => (
                                    <p key={k}>
                                      <strong>{k}:</strong> {String(payload[k])}
                                    </p>
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
          fromScraps={activeTab === 'scraps'}
          onClose={() => setReturnModalOpen({ isOpen: false, item: null })}
          onConfirm={handleReturnToStage}
        />
      )}
      {commentModalOpen.isOpen && (
        <ScrapCommentModal
          item={commentModalOpen.item}
          loading={commentSaving}
          onClose={() => setCommentModalOpen({ isOpen: false, item: null })}
          onConfirm={(c) => void handleSaveScrapComment(c)}
        />
      )}
    </ModulePage>
  );
}

