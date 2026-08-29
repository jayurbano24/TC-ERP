"use client";

import React, { useEffect, useMemo, useState, useCallback, startTransition } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  Card,
  Badge,
  Button,
  notify,
  confirmDialog,
  DataTable,
  TablePagination,
  type DataTableColumn,
} from '@/components/ui';
import { erpTab, erpTableHeader, erpTableHeaderText, erpFieldClass, erpLabelClass } from '@/lib/design/tokens';
import { apiFetch } from '@/lib/http/apiFetch';
import { sapValidationReader, getSapStatusMeta, type SapValidationState } from '@/modules/sap-integration';
import * as XLSX from 'xlsx';
import { ModulePage, ModuleToolbar } from '@/components/module-page';
import { DispatchBatchPanel } from './DispatchBatchPanel';
import {
  filterBrandsByTechnologyId,
  filterModelsByTechAndBrand,
} from '@/shared/catalogs/cascadeCatalogFilters';
import {
  fetchSapMatLotOptionsForModel,
  uniqueMaterials,
  valuationsForMaterial,
} from '@/lib/api/despachoSapMatLot';
import { 
  Truck, 
  Package, 
  Boxes, 
  QrCode, 
  ClipboardList, 
  CheckCircle2,
  FileText,
  ArrowRight,
  Search,
  Plus,
  X,
  Trash2,
  ArrowLeft,
  Pencil,
  Upload,
  Printer,
  FileSpreadsheet,
  Eye,
} from 'lucide-react';

import { fetchDespachoBoxItems } from '@/lib/api/despachoBoxItems';
import {
  downloadOutboundBoxExcel,
  formatOutboundCode,
  parseOutboundCodeNumber,
  OUTBOUND_EXCEL_MAX_TOTAL,
} from '@/lib/api/downloadOutboundBoxExcel';
import {
  fetchDespachoBoxesViaApi,
  fetchDespachoHistoryViaApi,
  fetchDespachoHistoryReprint,
  fetchDespachoPendientesViaApi,
  allocateOutboundCode,
} from '@/lib/api/despachoReads';
import {
  filterDespachoHistoryGroups,
  groupDespachoHistory,
  type DespachoHistoryGroup,
} from '@/lib/api/groupDespachoHistory';
import { fetchReferenceCatalogsViaApi } from '@/lib/api/referenceCatalogs';
import { DespachoSalidaModal } from './DespachoSalidaModal';
import { EquipoListoPanel } from './EquipoListoPanel';
import { printOutboundLabel, printOutboundLabels } from './printOutboundLabel';
import { printOutboundDetalle } from './printOutboundDetalle';

const SERIES_BOX_SELECT =
  'id, serial_number, service_order_id, current_status, current_box_id, brand_id, model_id, material, valuation, sap_status, updated_at, created_at';
const SERIES_SIBLING_SELECT =
  'id, serial_number, service_order_id, material, valuation, sap_status, created_at';

const BOX_DESPACHO_SELECT =
  'id, box_code, brand_id, model_id, capacity, status, material, valuation, created_at';

const DESPACHO_HISTORY_PAGE_SIZE = 25;
const DESPACHO_OUTBOUND_PAGE_SIZE = 20;

type DispatchItem = {
  id: string;
  dbId?: string;
  brand_id?: string;
  model_id?: string;
  material?: string;
  valuation?: string;
  filled_count?: number;
  valorado_count?: number;
  novalorado_count?: number;
  series_preview?: string[];
  destino: string;
  tipo: 'Masivo' | 'Individual' | 'Outbound';
  unidades: number;
  estatus: 'Pendiente' | 'En Ruta' | 'Entregado';
  fecha?: string;
};

function looksLikeSapSn(sn: string): boolean {
  return /^\d{12,}$/.test(sn.trim());
}

function looksLikeMac(sn: string): boolean {
  const s = sn.trim();
  return /^[0-9A-Fa-f]{12}$/.test(s) && /[A-Fa-f]/.test(s);
}

/** Prioriza serie SAP (SN numérico) sobre MAC/CAS para columna S1. */
function pickSapPrimary(
  sibs: Array<{ serial_number?: string; material?: string | null; valuation?: string | null }>,
  mainSerial?: string | null
) {
  if (!sibs.length) return null;
  const norm = (s: string) => s.trim().toUpperCase();
  const main = mainSerial?.trim() || '';
  if (main && looksLikeSapSn(main)) {
    const hit = sibs.find((s) => norm(String(s.serial_number || '')) === norm(main));
    if (hit) return hit;
  }
  const score = (s: (typeof sibs)[number]) => {
    const sn = String(s.serial_number || '');
    let n = 0;
    if (looksLikeSapSn(sn)) n += 100;
    if (looksLikeMac(sn)) n -= 50;
    if (main && norm(sn) === norm(main)) n += 15;
    if (String(s.material ?? '').trim()) n += 30;
    if (String(s.valuation ?? '').trim()) n += 10;
    return n;
  };
  return [...sibs].sort((a, b) => score(b) - score(a))[0]!;
}

const EMPTY_LIST: any[] = [];

function getJoinedServiceOrder(
  row: any
): { id?: string; os_label?: string | null; sap_integration_status?: string } | null {
  const so = row?.service_orders;
  if (!so) return null;
  if (Array.isArray(so)) return so[0] ?? null;
  return so;
}

/** Vacío/null no cuenta como valor. Comparación case-insensitive. */
function normMatLot(value: unknown): string | null {
  const s = String(value ?? '').trim();
  return s ? s.toUpperCase() : null;
}

/** Conflicto si ambos lados tienen valor y difieren. */
function materialsConflict(
  aMat: unknown,
  aLot: unknown,
  bMat: unknown,
  bLot: unknown
): boolean {
  const am = normMatLot(aMat);
  const al = normMatLot(aLot);
  const bm = normMatLot(bMat);
  const bl = normMatLot(bLot);
  if (am && bm && am !== bm) return true;
  if (al && bl && al !== bl) return true;
  return false;
}

type OutboundScanMatValContext = {
  serial?: string | null;
  osLabel?: string | null;
};

/**
 * Material/Valoración vs caja. Si faltan en serie, el caso habitual es
 * «equipo no validado en Integración SAP» (no un error genérico de Material).
 */
function checkOutboundScanMaterialValuation(
  eqMaterial: unknown,
  eqValuation: unknown,
  boxMat: unknown,
  boxVal: unknown,
  sapUnitStatus: SapValidationState,
  ctx: OutboundScanMatValContext = {}
): { ok: true } | { ok: false; title: string; description: string } {
  const sm = normMatLot(eqMaterial);
  const sv = normMatLot(eqValuation);
  const bm = normMatLot(boxMat);
  const bv = normMatLot(boxVal);
  const sapLabel = getSapStatusMeta(sapUnitStatus).label;
  const who = [ctx.osLabel, ctx.serial].filter(Boolean).join(' · ') || 'Este equipo';
  const notValidated = sapUnitStatus !== 'Validado SAP';

  if (bm) {
    if (!sm) {
      if (notValidated) {
        return {
          ok: false,
          title: 'Equipo no validado en Integración SAP',
          description:
            `${who} está en estado «${sapLabel}», por eso no tiene Material SAP y no puede entrar a esta Outbound (Material requerido: ${bm}). ` +
            `Vaya a Integración SAP → cargue/valide el Excel G985 (match) hasta «Validado SAP», luego vuelva a pistolear.`,
        };
      }
      return {
        ok: false,
        title: 'Sin Material SAP tras validación',
        description:
          `${who} figura «${sapLabel}» pero no trae Material en BD (la caja exige ${bm}). ` +
          `Re-sincronice en Integración SAP o corrija Material en la serie y reintente.`,
      };
    }
    if (sm !== bm) {
      return {
        ok: false,
        title: 'Material distinto al de la caja',
        description:
          `${who}: Material de la serie [${sm}] no coincide con el de la Outbound [${bm}]. ` +
          `No se pueden mezclar materiales en la misma caja.`,
      };
    }
  }
  if (bv) {
    if (!sv) {
      if (notValidated) {
        return {
          ok: false,
          title: 'Equipo no validado en Integración SAP',
          description:
            `${who} está en estado «${sapLabel}», por eso no tiene Valoración (lote) SAP y no puede entrar a esta Outbound (Valoración requerida: ${bv}). ` +
            `Vaya a Integración SAP → valide el Excel G985 hasta «Validado SAP», luego vuelva a pistolear.`,
        };
      }
      return {
        ok: false,
        title: 'Sin Valoración SAP tras validación',
        description:
          `${who} figura «${sapLabel}» pero no trae Valoración en BD (la caja exige ${bv}). ` +
          `Re-sincronice en Integración SAP o corrija el lote y reintente.`,
      };
    }
    if (sv !== bv) {
      return {
        ok: false,
        title: 'Valoración distinta a la de la caja',
        description:
          `${who}: Valoración de la serie [${sv}] no coincide con la de la Outbound [${bv}]. ` +
          `No se pueden mezclar lotes en la misma caja.`,
      };
    }
  }
  return { ok: true };
}

/** Toma Material y Lote de cualquier serie hermana (SAP a menudo llena solo una). */
function coalesceMaterialLote(
  rows: Array<{ material?: string | null; valuation?: string | null }>
): { material: string; valuation: string } {
  let material = '';
  let valuation = '';
  for (const s of rows) {
    const m = String(s.material ?? '').trim();
    const v = String(s.valuation ?? '').trim();
    if (!material && m) material = m;
    if (!valuation && v) valuation = v;
    if (material && valuation) break;
  }
  return { material, valuation };
}

async function fetchDespachoData(): Promise<{ history: any[]; dispatches: DispatchItem[] }> {
  // Historial y Outbounds independientes: un fallo de historial no debe vaciar la tabla.
  const historyResult = await fetchDespachoHistoryViaApi()
    .then((history) => ({ history, ok: true as const }))
    .catch((err) => {
      console.warn('[despacho] history API failed:', err);
      return { history: EMPTY_LIST as any[], ok: false as const };
    });

  const boxesResult = await fetchDespachoBoxesViaApi()
    .then((dispatches) => ({ dispatches: dispatches as DispatchItem[], ok: true as const }))
    .catch((err) => {
      console.warn('[despacho] boxes API failed:', err);
      return { dispatches: null as DispatchItem[] | null, ok: false as const };
    });

  if (boxesResult.ok && boxesResult.dispatches) {
    return { history: historyResult.history, dispatches: boxesResult.dispatches };
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return {
      history: historyResult.history,
      dispatches: EMPTY_LIST as DispatchItem[],
    };
  }

  let history = historyResult.history;
  if (!historyResult.ok) {
    const { data: hist } = await supabase
      .from('dispatches')
      .select(
        `
        id, 
        guide_number, 
        dispatch_type, 
        notes, 
        dispatched_at, 
        dispatched_by,
        dispatch_items(count)
      `
      )
      .order('dispatched_at', { ascending: false });
    history = (hist ?? []).map((row: any) => ({
      ...row,
      created_at: row.dispatched_at ?? row.created_at,
    }));
  }

  let dispatches: DispatchItem[] = [];
  const { data: recData } = await supabase
    .from('receptions')
    .select('id')
    .eq('guide_number', 'MANUAL_BOXES_DESPACHO')
    .maybeSingle();
  if (recData?.id) {
    // Paginar en cliente: PostgREST trunca ~1000; no enriquecer aquí (bloqueaba la UI).
    const allBoxes: any[] = [];
    let from = 0;
    const pageSize = 200;
    for (let guard = 0; guard < 50; guard += 1) {
      const { data: boxes, error } = await supabase
        .from('boxes')
        .select(BOX_DESPACHO_SELECT)
        .eq('reception_id', recData.id)
        .eq('status', 'open')
        .neq('rack_location', 'ELIMINADO')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) {
        console.warn('[despacho] legacy boxes:', error.message);
        break;
      }
      const chunk = boxes ?? [];
      allBoxes.push(...chunk);
      if (chunk.length < pageSize) break;
      from += pageSize;
    }
    const seen = new Set<string>();
    dispatches = allBoxes
      .filter((b) => {
        if (!b?.id || seen.has(b.id)) return false;
        seen.add(b.id);
        return true;
      })
      .map((b: any) => ({
        id: b.box_code,
        dbId: b.id,
        brand_id: b.brand_id,
        model_id: b.model_id,
        material: b.material ?? '',
        valuation: b.valuation ?? '',
        filled_count: 0,
        valorado_count: 0,
        novalorado_count: 0,
        series_preview: [],
        destino: 'Pendiente de asignar',
        tipo: 'Outbound' as const,
        unidades: b.capacity || 0,
        estatus: b.status === 'open' ? ('Pendiente' as const) : ('En Ruta' as const),
        fecha: new Date(b.created_at).toLocaleDateString(),
      }));
  }

  return { history, dispatches };
}

export default function DespachoPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  type DespachoTabId = 'equipo_listo' | 'operacion' | 'historial' | 'cqrs' | 'lotes';
  const [activeTab, setActiveTab] = useState<DespachoTabId>('equipo_listo');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (
      tab === 'historial' ||
      tab === 'operacion' ||
      tab === 'equipo_listo' ||
      tab === 'cqrs' ||
      tab === 'lotes'
    ) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const despachoQuery = useQuery({
    queryKey: ['despacho-data', 'v1'],
    queryFn: fetchDespachoData,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const dispatchHistory = despachoQuery.data?.history ?? EMPTY_LIST;
  const [historyPage, setHistoryPage] = useState(1);
  const [historySearch, setHistorySearch] = useState('');
  const [outboundPage, setOutboundPage] = useState(1);

  const groupedDispatchHistory = useMemo(
    () => groupDespachoHistory(dispatchHistory),
    [dispatchHistory]
  );
  const filteredDispatchHistory = useMemo(
    () => filterDespachoHistoryGroups(groupedDispatchHistory, historySearch),
    [groupedDispatchHistory, historySearch]
  );

  const historyTotalCount = filteredDispatchHistory.length;
  const historyTotalPages = Math.max(1, Math.ceil(historyTotalCount / DESPACHO_HISTORY_PAGE_SIZE));
  const historySafePage = Math.min(historyPage, historyTotalPages);

  useEffect(() => {
    if (historyPage > historyTotalPages) {
      startTransition(() => setHistoryPage(historyTotalPages));
    }
  }, [historyPage, historyTotalPages]);

  const onHistoryPageChange = useCallback((value: React.SetStateAction<number>) => {
    startTransition(() => setHistoryPage(value));
  }, []);

  const dispatchHistoryPageItems = useMemo(() => {
    const start = (historySafePage - 1) * DESPACHO_HISTORY_PAGE_SIZE;
    return filteredDispatchHistory.slice(start, start + DESPACHO_HISTORY_PAGE_SIZE);
  }, [filteredDispatchHistory, historySafePage]);

  const historyStartItem =
    historyTotalCount === 0 ? 0 : (historySafePage - 1) * DESPACHO_HISTORY_PAGE_SIZE + 1;
  const historyEndItem = Math.min(historySafePage * DESPACHO_HISTORY_PAGE_SIZE, historyTotalCount);

  const refreshDispatches = () =>
    queryClient.invalidateQueries({ queryKey: ['despacho-data', 'v1'] });

  const [showDispatchForm, setShowDispatchForm] = useState(false);
  const [dispatchType, setDispatchType] = useState<'massive' | 'individual' | 'master_box'>('master_box');
  const [itemsToDispatch, setItemsToDispatch] = useState<string[]>([]);
  const [scanInput, setScanInput] = useState('');

  const [showCreateBoxModal, setShowCreateBoxModal] = useState(false);
  const [boxBrand, setBoxBrand] = useState('');
  const [boxModel, setBoxModel] = useState('');
  const [boxTech, setBoxTech] = useState('');
  const [boxQty, setBoxQty] = useState<number | ''>('');
  const [boxCount, setBoxCount] = useState<number | ''>(1);
  const [boxMaterial, setBoxMaterial] = useState('');
  const [boxValuation, setBoxValuation] = useState('');
  
  const catalogsQuery = useQuery({
    queryKey: ['despacho-catalogs', 'v1'],
    queryFn: async () => {
      const lookups = await fetchReferenceCatalogsViaApi();
      return {
        brands: lookups.brands,
        models: lookups.models,
        techs: lookups.technologies,
      };
    },
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const dbBrands: any[] = catalogsQuery.data?.brands ?? EMPTY_LIST;
  const dbModels: any[] = catalogsQuery.data?.models ?? EMPTY_LIST;
  const dbTechs: any[] = catalogsQuery.data?.techs ?? EMPTY_LIST;
  const [editBoxId, setEditBoxId] = useState<string | null>(null);
  const [creatingBoxes, setCreatingBoxes] = useState(false);

  const outboundBrands = useMemo(
    () => filterBrandsByTechnologyId(dbBrands, dbModels, boxTech),
    [dbBrands, dbModels, boxTech]
  );
  const outboundModels = useMemo(
    () => filterModelsByTechAndBrand(dbModels, boxTech, boxBrand),
    [dbModels, boxTech, boxBrand]
  );

  const sapMatLotQuery = useQuery({
    queryKey: ['despacho-sap-mat-lot', boxBrand, boxModel],
    queryFn: () => fetchSapMatLotOptionsForModel(boxBrand, boxModel),
    enabled: showCreateBoxModal && !!boxBrand && !!boxModel,
    staleTime: 60_000,
  });
  const sapMatLotPairs = sapMatLotQuery.data ?? [];
  const sapMaterialOptions = useMemo(() => {
    const list = uniqueMaterials(sapMatLotPairs);
    if (boxMaterial && !list.some((m) => m.toUpperCase() === boxMaterial.toUpperCase())) {
      return [boxMaterial, ...list];
    }
    return list;
  }, [sapMatLotPairs, boxMaterial]);
  const sapValuationOptions = useMemo(() => {
    const list = valuationsForMaterial(sapMatLotPairs, boxMaterial);
    if (boxValuation && !list.some((v) => v.toUpperCase() === boxValuation.toUpperCase())) {
      return [boxValuation, ...list];
    }
    return list;
  }, [sapMatLotPairs, boxMaterial, boxValuation]);

  useEffect(() => {
    if (!showCreateBoxModal || !boxBrand || !boxModel) return;
    if (sapMatLotQuery.isLoading || sapMatLotQuery.isFetching) return;
    const mats = uniqueMaterials(sapMatLotPairs);
    if (mats.length === 1 && !boxMaterial) {
      setBoxMaterial(mats[0]);
    }
  }, [
    showCreateBoxModal,
    boxBrand,
    boxModel,
    sapMatLotPairs,
    sapMatLotQuery.isLoading,
    sapMatLotQuery.isFetching,
    boxMaterial,
  ]);

  useEffect(() => {
    if (!showCreateBoxModal || !boxMaterial) return;
    if (sapMatLotQuery.isLoading || sapMatLotQuery.isFetching) return;
    const vals = valuationsForMaterial(sapMatLotPairs, boxMaterial);
    if (vals.length === 1 && boxValuation.toUpperCase() !== vals[0].toUpperCase()) {
      setBoxValuation(vals[0]);
    } else if (
      boxValuation &&
      vals.length > 0 &&
      !vals.some((v) => v.toUpperCase() === boxValuation.toUpperCase())
    ) {
      setBoxValuation('');
    }
  }, [
    showCreateBoxModal,
    boxMaterial,
    sapMatLotPairs,
    sapMatLotQuery.isLoading,
    sapMatLotQuery.isFetching,
    boxValuation,
  ]);

  const [showUploadSAPModal, setShowUploadSAPModal] = useState(false);
  const [isUploadingSAP, setIsUploadingSAP] = useState(false);

  const handleUploadSAP = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingSAP(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json: any[] = XLSX.utils.sheet_to_json(worksheet);

      const updates = json.map(row => ({
        serial_number: String(row['Número de serie']).trim(),
        material: String(row['Material'] || '').trim(),
        valuation: String(row['Lote'] || '').trim(),
      })).filter(u => u.serial_number && u.serial_number !== 'undefined');

      if (updates.length === 0) {
        notify.warning('Sin registros válidos', { description: 'Verifique que exista la columna "Número de serie".' });
        setIsUploadingSAP(false);
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      let successCount = 0;
      let errorCount = 0;
      
      const chunkSize = 50;
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async (u) => {
          const { error } = await supabase
            .from('series')
            .update({ material: u.material, valuation: u.valuation })
            .eq('serial_number', u.serial_number);
          if (error) {
            console.error('Error updating', u.serial_number, error);
            errorCount++;
          } else {
            successCount++;
          }
        }));
      }

      notify.success('Carga SAP completada', { description: `Procesados: ${successCount} · Errores: ${errorCount}` });
      setShowUploadSAPModal(false);

    } catch (error) {
      console.error(error);
      notify.error('Error procesando el archivo Excel.');
    } finally {
      setIsUploadingSAP(false);
    }
  };

  const dispatches = despachoQuery.data?.dispatches ?? (EMPTY_LIST as DispatchItem[]);
  const [outboundSearch, setOutboundSearch] = useState('');

  const filteredDispatches = useMemo(() => {
    const term = outboundSearch.trim().toLowerCase();
    if (!term) return dispatches;
    const compact = term.replace(/^ob-/, '').replace(/^0+/, '');
    return dispatches.filter((d) => {
      const code = String(d.id || '').toLowerCase();
      const material = String(d.material || '').toLowerCase();
      const valuation = String(d.valuation || '').toLowerCase();
      if (code.includes(term) || material.includes(term) || valuation.includes(term)) return true;
      if (compact && code.replace(/^ob-/, '').replace(/^0+/, '').includes(compact)) return true;
      return false;
    });
  }, [dispatches, outboundSearch]);

  const outboundTotalCount = filteredDispatches.length;
  const outboundTotalPages = Math.max(1, Math.ceil(outboundTotalCount / DESPACHO_OUTBOUND_PAGE_SIZE));
  const outboundSafePage = Math.min(outboundPage, outboundTotalPages);

  useEffect(() => {
    if (outboundPage > outboundTotalPages) {
      startTransition(() => setOutboundPage(outboundTotalPages));
    }
  }, [outboundPage, outboundTotalPages]);

  const onOutboundPageChange = useCallback((value: React.SetStateAction<number>) => {
    startTransition(() => setOutboundPage(value));
  }, []);

  const dispatchPageItems = useMemo(() => {
    const start = (outboundSafePage - 1) * DESPACHO_OUTBOUND_PAGE_SIZE;
    return filteredDispatches.slice(start, start + DESPACHO_OUTBOUND_PAGE_SIZE);
  }, [filteredDispatches, outboundSafePage]);

  const outboundStartItem =
    outboundTotalCount === 0 ? 0 : (outboundSafePage - 1) * DESPACHO_OUTBOUND_PAGE_SIZE + 1;
  const outboundEndItem = Math.min(
    outboundSafePage * DESPACHO_OUTBOUND_PAGE_SIZE,
    outboundTotalCount
  );

  const [selectedBox, setSelectedBox] = useState<DispatchItem | null>(null);
  const [selectedBoxIds, setSelectedBoxIds] = useState<Set<string>>(new Set());
  const [exportingBoxReport, setExportingBoxReport] = useState(false);
  const [exportingBulkExcel, setExportingBulkExcel] = useState(false);
  const [showSalidaModal, setShowSalidaModal] = useState(false);
  const [boxItems, setBoxItems] = useState<any[]>([]);
  const [scanSN, setScanSN] = useState('');
  const [scanCAS, setScanCAS] = useState('');

  const toggleSelectBox = (disp: DispatchItem, checked: boolean) => {
    if (!disp.dbId) return;
    setSelectedBoxIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(disp.dbId!);
      else next.delete(disp.dbId!);
      return next;
    });
  };

  const toggleSelectPageHeader = () => {
    const pageIds = dispatchPageItems
      .map((d) => d.dbId)
      .filter((id): id is string => Boolean(id));
    if (pageIds.length === 0) return;

    const allPageInSelection = pageIds.every((id) => selectedBoxIds.has(id));
    if (allPageInSelection) {
      setSelectedBoxIds(new Set());
      return;
    }
    setSelectedBoxIds((prev) => {
      const next = new Set(prev);
      for (const id of pageIds) next.add(id);
      return next;
    });
  };

  const clearBoxSelection = () => setSelectedBoxIds(new Set());

  const selectedBoxes = dispatches.filter((d) => d.dbId && selectedBoxIds.has(d.dbId));

  const salidaBoxes = useMemo(
    () =>
      selectedBoxes.map((b) => {
        const brandName = dbBrands.find((x) => x.id === b.brand_id)?.name || '—';
        const model = dbModels.find((m) => m.id === b.model_id);
        const modelName = model?.name || '—';
        const techName = dbTechs.find((t) => t.id === model?.technology_id)?.name || '—';
        return {
          id: b.id,
          dbId: b.dbId!,
          material: b.material,
          valuation: b.valuation,
          brandName,
          modelName,
          techName,
          filled_count: b.filled_count,
          valorado_count: b.valorado_count,
          novalorado_count: b.novalorado_count,
          unidades: b.unidades,
          series_preview: b.series_preview,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dispatches, dbBrands, dbModels, dbTechs, [...selectedBoxIds].sort().join('|')]
  );

  const openSalidaForSelection = () => {
    if (selectedBoxes.length === 0) {
      notify.warning('Seleccione al menos una caja.');
      return;
    }
    void refreshDispatches();
    setShowSalidaModal(true);
  };

  const loadBoxItems = async (boxDbId: string) => {
    try {
      const items = await fetchDespachoBoxItems(boxDbId);
      setBoxItems(items);
      queryClient.setQueryData<{ history: unknown[]; dispatches: DispatchItem[] } | undefined>(
        ['despacho-data', 'v1'],
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            dispatches: prev.dispatches.map((d) =>
              d.dbId === boxDbId ? { ...d, filled_count: items.length } : d
            ),
          };
        }
      );
      return;
    } catch (e) {
      console.warn('[despacho] API box items fallback:', e);
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data } = await supabase
      .from('series')
      .select(`${SERIES_BOX_SELECT}, service_orders(id)`)
      .eq('current_box_id', boxDbId)
      .order('updated_at', { ascending: false });
    if (data && data.length > 0) {
      const osIds = data.map((d) => getJoinedServiceOrder(d)?.id).filter(Boolean) as string[];
      let siblingsData: any[] = [];
      const mainByOs = new Map<string, string>();
      if (osIds.length > 0) {
        const [{ data: siblings }, { data: osRows }] = await Promise.all([
          supabase
            .from('series')
            .select(SERIES_SIBLING_SELECT)
            .in('service_order_id', osIds)
            .order('created_at', { ascending: true }),
          supabase.from('service_orders').select('id, main_serial').in('id', osIds),
        ]);
        if (siblings) siblingsData = siblings;
        for (const os of osRows ?? []) {
          if (os.main_serial) mainByOs.set(String(os.id), String(os.main_serial));
        }
      }
      
      const enrichedData: any[] = [];
      const processedOsIds = new Set();

      data.forEach((item) => {
        const serviceOrder = getJoinedServiceOrder(item);
        if (serviceOrder?.id) {
          if (processedOsIds.has(serviceOrder.id)) return;
          processedOsIds.add(serviceOrder.id);

          const siblings = siblingsData.filter((s) => s.service_order_id === serviceOrder.id);
          const sibs = siblings.length > 0 ? siblings : [item];
          const { material, valuation } = coalesceMaterialLote([item, ...siblings]);
          const primary = pickSapPrimary(sibs, mainByOs.get(serviceOrder.id)) || sibs[0];
          const mainSn = primary.serial_number;
          const otherSiblings = sibs.filter((s) => s.serial_number !== mainSn);
          const orderedSiblings = [primary, ...otherSiblings];

          enrichedData.push({
            ...item,
            id: orderedSiblings[0]?.id || item.id,
            s1: orderedSiblings[0]?.serial_number || item.serial_number,
            s2: orderedSiblings[1]?.serial_number || '',
            s3: orderedSiblings[2]?.serial_number || '',
            s4: orderedSiblings[3]?.serial_number || '',
            material,
            valuation,
          });
        } else {
          enrichedData.push({
            ...item,
            s1: item.serial_number,
            s2: '',
            s3: '',
            s4: '',
            material: item.material ?? '',
            valuation: item.valuation ?? '',
          });
        }
      });
      setBoxItems(enrichedData);
    } else {
      setBoxItems([]);
    }
  };

  const handleSelectBox = (box: DispatchItem) => {
    if (!box.dbId) {
      notify.info('Esta caja es un dato de prueba.');
      return;
    }
    setSelectedBox(box);
    loadBoxItems(box.dbId);
  };

  const handleScanToBox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanSN || !selectedBox?.dbId) return;
    
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    
    const sn = scanSN.trim();
    const { data: sData } = await supabase
      .from('series')
      .select(`${SERIES_BOX_SELECT}, service_orders(id, os_label, sap_integration_status)`)
      .ilike('serial_number', sn)
      .limit(1)
      .maybeSingle();
    if (!sData) {
      notify.warning('Serie no encontrada.'); return;
    }
    
    if (sData.current_status !== 'in_central_warehouse') {
      notify.warning('El equipo no está en estado EQUIPO LISTO.'); return;
    }

    if (sData.brand_id !== selectedBox.brand_id || sData.model_id !== selectedBox.model_id) {
      notify.warning('La marca o modelo del equipo no coinciden con la caja.'); return;
    }

    // 1. Hermanas (OS) — necesarias para SAP S1–S4 y material coalescido
    let siblings: any[] = [];
    let idsToUpdate = [sData.id];
    if (sData.service_order_id) {
      const { data: sibRows } = await supabase
        .from('series')
        .select(SERIES_SIBLING_SELECT)
        .eq('service_order_id', sData.service_order_id);
      if (sibRows && sibRows.length > 0) {
        siblings = sibRows;
        idsToUpdate = sibRows.map((s) => s.id);
      }
    }

    const scanServiceOrder = getJoinedServiceOrder(sData);
    const sapSeriesStatuses = [
      (sData as { sap_status?: string | null }).sap_status,
      ...siblings.map((s: { sap_status?: string | null }) => s.sap_status),
    ];
    const sapUnitStatus = sapValidationReader.resolveStatus({
      integrationStatus: scanServiceOrder?.sap_integration_status,
      seriesStatuses: sapSeriesStatuses,
    });
    const sapDecision = sapValidationReader.authorize(
      { integrationStatus: scanServiceOrder?.sap_integration_status, seriesStatuses: sapSeriesStatuses },
      'dispatch'
    );
    if (!sapDecision.allowed) {
      const sapLabel = getSapStatusMeta(sapDecision.status).label;
      notify.error('Bloqueo operativo (Integración SAP)', {
        description: `No se puede pistoleo en Outbound: estado «${sapLabel}». Sin Coincidencia y Obsoleto están bloqueados para despacho.`,
        duration: 0,
      });
      return;
    }

    const { material: eqMaterial, valuation: eqValuation } = coalesceMaterialLote([
      sData,
      ...siblings,
    ]);
    const boxMatRef = selectedBox.material || (boxItems[0]?.material ?? '');
    const boxLotRef = selectedBox.valuation || (boxItems[0]?.valuation ?? '');

    const matVal = checkOutboundScanMaterialValuation(
      eqMaterial,
      eqValuation,
      boxMatRef,
      boxLotRef,
      sapUnitStatus,
      {
        serial: sn,
        osLabel: scanServiceOrder?.os_label ?? null,
      }
    );
    if (!matVal.ok) {
      notify.error(matVal.title, {
        description: matVal.description,
        duration: 0,
      });
      return;
    }
    // Refuerzo vs ítems ya en caja (por si la caja no tenía declarado y el contenido sí)
    if (boxItems.length > 0 && materialsConflict(eqMaterial, eqValuation, boxItems[0].material, boxItems[0].valuation)) {
      notify.error('No se pueden mezclar Material/Valoración', {
        description: `Equipo: Material [${normMatLot(eqMaterial) || '—'}] Valoración [${normMatLot(eqValuation) || '—'}] · En caja: Material [${normMatLot(boxItems[0].material) || '—'}] Valoración [${normMatLot(boxItems[0].valuation) || '—'}].`,
        duration: 0,
      });
      return;
    }

    if (boxItems.length >= selectedBox.unidades) {
      notify.warning('La caja ya está llena.'); return;
    }

    const patch: { current_box_id: string; material?: string; valuation?: string } = {
      current_box_id: selectedBox.dbId,
    };
    if (normMatLot(eqMaterial)) patch.material = normMatLot(eqMaterial);
    if (normMatLot(eqValuation)) patch.valuation = normMatLot(eqValuation);

    const { error } = await supabase.from('series').update(patch).in('id', idsToUpdate);
    if (error) {
      notify.error('Error al asignar equipo a la caja.');
    } else {
      setScanSN('');
      setScanCAS('');
      await loadBoxItems(selectedBox.dbId);
      void refreshDispatches();
    }
  };

  const handleRemoveFromBox = async (seriesId: string) => {
    if (!selectedBox?.dbId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    
    // Buscar si tiene hermanos para removerlos todos
    const { data: sData } = await supabase.from('series').select('service_order_id').eq('id', seriesId).single();
    let idsToRemove = [seriesId];
    if (sData?.service_order_id) {
      const { data: siblings } = await supabase.from('series').select('id').eq('service_order_id', sData.service_order_id);
      if (siblings) idsToRemove = siblings.map(s => s.id);
    }

    const { error } = await supabase.from('series').update({ current_box_id: null }).in('id', idsToRemove);
    if (!error) {
      await loadBoxItems(selectedBox.dbId);
      void refreshDispatches();
    }
  };

  const handleCreateBox = async () => {
    if (!boxBrand || !boxModel || !boxQty || !boxTech) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const unitsPerBox = Number(boxQty);
    if (!Number.isFinite(unitsPerBox) || unitsPerBox <= 0) {
      notify.warning('Indique equipos por caja mayor a 0.');
      return;
    }

    const boxesToCreate = editBoxId
      ? 1
      : Math.min(50, Math.max(1, Math.floor(Number(boxCount) || 1)));

    try {
      let receptionId;
      const { data: recData } = await supabase.from('receptions').select('id').eq('guide_number', 'MANUAL_BOXES_DESPACHO').single();
      if (recData) {
        receptionId = recData.id;
      } else {
        notify.error('No se encontró la recepción base para despacho.');
        return;
      }

      if (editBoxId) {
        const { error } = await supabase.from('boxes').update({
          brand_id: boxBrand,
          model_id: boxModel,
          capacity: unitsPerBox,
          material: boxMaterial.trim() || null,
          valuation: boxValuation.trim() || null,
        }).eq('id', editBoxId);

        if (error) {
          console.error(error);
          notify.error('Error al actualizar Outbound', { description: error.message });
        } else {
          notify.success('Outbound actualizado.');
          setShowCreateBoxModal(false);
          setBoxBrand(''); setBoxModel(''); setBoxTech(''); setBoxQty('');
          setBoxCount(1);
          setBoxMaterial(''); setBoxValuation('');
          setEditBoxId(null);
          await refreshDispatches();
        }
        return;
      }

      setCreatingBoxes(true);
      const createdCodes: string[] = [];
      let lastError: string | null = null;

      for (let n = 0; n < boxesToCreate; n++) {
        let inserted = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          let boxCode: string;
          try {
            boxCode = await allocateOutboundCode();
          } catch (e: unknown) {
            lastError = e instanceof Error ? e.message : 'No se pudo generar código Outbound';
            break;
          }
          const { error } = await supabase.from('boxes').insert({
            reception_id: receptionId,
            box_code: boxCode,
            brand_id: boxBrand,
            model_id: boxModel,
            capacity: unitsPerBox,
            material: boxMaterial.trim() || null,
            valuation: boxValuation.trim() || null,
            status: 'open',
            rack_location: 'OUTBOUND',
          });

          if (!error) {
            createdCodes.push(boxCode);
            inserted = true;
            break;
          }

          lastError = error.message;
          if (!/duplicate|unique|box_code/i.test(error.message)) {
            break;
          }
        }
        if (!inserted) break;
      }

      setCreatingBoxes(false);

      if (createdCodes.length === boxesToCreate) {
        if (boxesToCreate === 1) {
          notify.success(`Outbound ${createdCodes[0]} creado.`);
        } else {
          notify.success(`${createdCodes.length} Outbounds creados.`, {
            description: `${createdCodes[0]} … ${createdCodes[createdCodes.length - 1]}`,
          });
        }
        setShowCreateBoxModal(false);
        setBoxBrand(''); setBoxModel(''); setBoxTech(''); setBoxQty('');
        setBoxCount(1);
        setBoxMaterial(''); setBoxValuation('');
        await refreshDispatches();
        return;
      }

      if (createdCodes.length > 0) {
        notify.warning(`Se crearon ${createdCodes.length} de ${boxesToCreate} cajas.`, {
          description: lastError || 'Revise la lista y reintente el resto.',
        });
        await refreshDispatches();
        return;
      }

      notify.error('Error al crear Outbound', { description: lastError || 'Código no disponible' });
    } catch (e) {
      setCreatingBoxes(false);
      console.error(e);
      notify.error('Error inesperado al guardar Outbound.');
    }
  };

  const handleEditBox = (disp: DispatchItem) => {
    if (!disp.dbId) return;
    setEditBoxId(disp.dbId);
    setBoxBrand(disp.brand_id || '');
    setBoxModel(disp.model_id || '');
    setBoxQty(disp.unidades);
    setBoxMaterial(disp.material || '');
    setBoxValuation(disp.valuation || '');
    const model = dbModels.find((m) => m.id === disp.model_id);
    setBoxTech(model?.technology_id || '');
    setShowCreateBoxModal(true);
  };

  const handleDeleteBox = async (disp: DispatchItem) => {
    if (!disp.dbId) return;
    if (!(await confirmDialog({ title: 'Eliminar Outbound', message: `¿Eliminar ${disp.id}? Los equipos dentro quedarán libres.`, tone: 'error', confirmText: 'Eliminar' }))) return;
    
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    try {
      const { error } = await supabase.from('boxes').update({ rack_location: 'ELIMINADO' }).eq('id', disp.dbId);
      if (error) {
        console.error(error);
        notify.error('Error al eliminar la caja', { description: error.message });
      } else {
        notify.success('Caja eliminada con éxito.');
        await refreshDispatches();
      }
    } catch (e) {
      console.error(e);
      notify.error('Error inesperado al eliminar.');
    }
  };

  const handleExportOutboundBoxExcel = async (disp: DispatchItem) => {
    if (!disp.dbId) {
      notify.warning('Esta caja no tiene identificador para exportar.');
      return;
    }
    try {
      await downloadOutboundBoxExcel([disp.dbId], disp.id);
      notify.success('Excel descargado.');
    } catch (e) {
      console.error(e);
      notify.error('No se pudo exportar el Excel.', {
        description: e instanceof Error ? e.message : 'Error desconocido',
      });
    }
  };

  const [outboundRangeFrom, setOutboundRangeFrom] = useState('');
  const [outboundRangeTo, setOutboundRangeTo] = useState('');

  const resolveOutboundRange = useCallback(() => {
    const fromN = parseOutboundCodeNumber(outboundRangeFrom);
    const toN = parseOutboundCodeNumber(outboundRangeTo);
    if (fromN == null || toN == null) {
      notify.warning('Indique Desde y Hasta válidos.', {
        description: 'Ejemplos: 32 y 150, o OB-000032 y OB-000150.',
      });
      return null;
    }
    const lo = Math.min(fromN, toN);
    const hi = Math.max(fromN, toN);
    const inRange = dispatches.filter((d) => {
      if (!d.dbId) return false;
      const n = parseOutboundCodeNumber(d.id);
      return n != null && n >= lo && n <= hi;
    });
    if (inRange.length === 0) {
      notify.warning('No hay Outbound abiertos en ese rango.', {
        description: `${formatOutboundCode(lo)} → ${formatOutboundCode(hi)}`,
      });
      return null;
    }
    return { lo, hi, inRange };
  }, [dispatches, outboundRangeFrom, outboundRangeTo]);

  const handleSelectOutboundRange = () => {
    const resolved = resolveOutboundRange();
    if (!resolved) return;
    setSelectedBoxIds(new Set(resolved.inRange.map((d) => d.dbId!)));
    notify.success('Rango seleccionado', {
      description: `${formatOutboundCode(resolved.lo)} → ${formatOutboundCode(resolved.hi)} · ${resolved.inRange.length} caja(s).`,
    });
  };

  const handleBulkOutboundExcelExport = async () => {
    const fromSelection =
      selectedBoxIds.size > 0
        ? dispatches.filter((d) => d.dbId && selectedBoxIds.has(d.dbId))
        : dispatches.filter((d) => d.dbId);

    if (fromSelection.length === 0) {
      notify.warning('No hay Outbound para exportar.');
      return;
    }

    if (fromSelection.length > OUTBOUND_EXCEL_MAX_TOTAL) {
      notify.warning(`Máximo ${OUTBOUND_EXCEL_MAX_TOTAL} cajas por exportación.`, {
        description: 'Use un rango Desde–Hasta más estrecho o exporte en varias tandas.',
      });
      return;
    }

    const boxIds = fromSelection.map((d) => d.dbId!);
    const selectionMode = selectedBoxIds.size > 0;
    const baseLabel = selectionMode
      ? `Seleccion_${fromSelection.length}_Outbound`
      : `Masivo_${fromSelection.length}_Outbound`;

    setExportingBulkExcel(true);
    try {
      const result = await downloadOutboundBoxExcel(boxIds, baseLabel, {
        filePrefix: 'Reporte_Outbound',
      });
      notify.success(
        selectionMode ? 'Reporte Excel de selección listo.' : 'Reporte Excel masivo listo.',
        {
          description: `${result.boxes} caja(s) en un solo Excel · series S1–S4 por equipo.`,
        }
      );
    } catch (e) {
      console.error(e);
      notify.error('No se pudo exportar el reporte Excel.', {
        description: e instanceof Error ? e.message : 'Error desconocido',
      });
    } finally {
      setExportingBulkExcel(false);
    }
  };

  const handleRangeOutboundExcelExport = async () => {
    const resolved = resolveOutboundRange();
    if (!resolved) return;
    if (resolved.inRange.length > OUTBOUND_EXCEL_MAX_TOTAL) {
      notify.warning(`Máximo ${OUTBOUND_EXCEL_MAX_TOTAL} cajas por exportación.`);
      return;
    }
    setSelectedBoxIds(new Set(resolved.inRange.map((d) => d.dbId!)));
    setExportingBulkExcel(true);
    try {
      const label = `Rango_${formatOutboundCode(resolved.lo)}_${formatOutboundCode(resolved.hi)}`;
      const result = await downloadOutboundBoxExcel(
        resolved.inRange.map((d) => d.dbId!),
        label,
        { filePrefix: 'Reporte_Outbound' }
      );
      notify.success('Reporte por rango listo.', {
        description: `${result.boxes} cajas en un solo Excel · ${formatOutboundCode(resolved.lo)} → ${formatOutboundCode(resolved.hi)}.`,
      });
    } catch (e) {
      console.error(e);
      notify.error('No se pudo exportar el rango.', {
        description: e instanceof Error ? e.message : 'Error desconocido',
      });
    } finally {
      setExportingBulkExcel(false);
    }
  };

  const handlePrintOutboundBoxPdf = async (disp: DispatchItem) => {
    if (!disp.dbId) {
      notify.warning('Esta caja no tiene identificador para imprimir.');
      return;
    }
    try {
      const items = await fetchDespachoBoxItems(disp.dbId);
      const brandName = dbBrands.find((b) => b.id === disp.brand_id)?.name || 'N/A';
      const model = dbModels.find((m) => m.id === disp.model_id);
      const modelName = model?.name || 'N/A';
      const techName = dbTechs.find((t) => t.id === model?.technology_id)?.name || 'N/A';
      await printOutboundLabel({
        outboundCode: disp.id,
        brandName,
        modelName,
        techName,
        capacity: Number(disp.unidades) || items.length,
        boxMaterial: disp.material,
        boxValuation: disp.valuation,
        items,
        onEmpty: () => notify.warning('No hay equipos en el Outbound para imprimir.'),
        onBarcodeError: () => notify.error('No se pudo generar la etiqueta PDF.'),
      });
    } catch (e) {
      console.error(e);
      notify.error('No se pudo abrir la etiqueta PDF.', {
        description: e instanceof Error ? e.message : 'Error desconocido',
      });
    }
  };

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanInput) return;
    setItemsToDispatch([scanInput, ...itemsToDispatch]);
    setScanInput('');
  };

  const printBoxLabel = async () => {
    if (!selectedBox) return;
    const brandName = dbBrands.find(b => b.id === selectedBox.brand_id)?.name || 'N/A';
    const model = dbModels.find(m => m.id === selectedBox.model_id);
    const modelName = model?.name || 'N/A';
    const techName = dbTechs.find(t => t.id === model?.technology_id)?.name || 'N/A';
    await printOutboundLabel({
      outboundCode: selectedBox.id,
      brandName,
      modelName,
      techName,
      capacity: Number(selectedBox.unidades) || boxItems.length,
      boxMaterial: selectedBox.material,
      boxValuation: selectedBox.valuation,
      items: boxItems,
      onEmpty: () => notify.warning('No hay equipos en el Outbound para imprimir.'),
      onBarcodeError: () => notify.error('No se pudo generar la etiqueta de impresión.'),
    });
  };

  const handleExportBoxReport = async () => {
    if (!selectedBox?.dbId) {
      notify.warning('Esta caja no tiene identificador para exportar.');
      return;
    }
    if (boxItems.length === 0) {
      notify.warning('No hay equipos en la caja para el reporte.');
      return;
    }
    setExportingBoxReport(true);
    try {
      await downloadOutboundBoxExcel([selectedBox.dbId], selectedBox.id, {
        filePrefix: 'Reporte_Outbound',
      });
      notify.success('Reporte masivo de caja descargado.', {
        description: 'Excel con datos de caja y series S1–S4 por equipo.',
      });
    } catch (e) {
      notify.error('No se pudo exportar el reporte.', {
        description: e instanceof Error ? e.message : 'Error desconocido',
      });
    } finally {
      setExportingBoxReport(false);
    }
  };

  const handleReprintHistory = async (hist: DespachoHistoryGroup | any) => {
    try {
      const memberIds: string[] =
        Array.isArray(hist.memberIds) && hist.memberIds.length > 0
          ? hist.memberIds
          : [hist.id];
      const reprints = await Promise.all(
        memberIds.map((id) => fetchDespachoHistoryReprint(id))
      );
      const withItems = reprints.filter((d) => d.items?.length);
      if (!withItems.length) {
        notify.warning('Este conduce no tiene series para reimprimir.');
        return;
      }

      const first = withItems[0]!;
      const fechaSalida = new Date(
        first.dispatch.dispatched_at || hist.dispatched_at || hist.created_at || Date.now()
      ).toLocaleString('es-PA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      const isIndividual = String(hist.dispatch_type || '').toLowerCase() === 'individual';
      const detalleRows: Array<{
        outboundCode: string;
        brandName: string;
        modelName: string;
        techName: string;
        cantidad: number;
        material: string;
        valuation: string;
        series?: string[];
      }> = [];
      const labelPayloads: Array<{
        outboundCode: string;
        brandName: string;
        modelName: string;
        techName: string;
        capacity: number;
        boxMaterial: string;
        boxValuation: string;
        items: typeof first.items;
      }> = [];

      for (const data of withItems) {
        const boxCode = data.box?.box_code || hist.box_code || '—';
        const brandId = data.box?.brand_id || hist.brand_id;
        const modelId = data.box?.model_id || hist.model_id;
        const brandName = dbBrands.find((b) => b.id === brandId)?.name || 'N/A';
        const model = dbModels.find((m) => m.id === modelId);
        const modelName = model?.name || 'N/A';
        const techName = dbTechs.find((t) => t.id === model?.technology_id)?.name || 'N/A';

        if (isIndividual) {
          for (const item of data.items) {
            const itemBrandId = item.brand_id || brandId;
            const itemModelId = item.model_id || modelId;
            const itemBrand = dbBrands.find((b) => b.id === itemBrandId)?.name || brandName;
            const itemModel = dbModels.find((m) => m.id === itemModelId);
            const itemModelName = itemModel?.name || modelName;
            const itemTech =
              dbTechs.find((t) => t.id === itemModel?.technology_id)?.name || techName;
            const sn = String(item.serial_number || item.s1 || '').trim();
            detalleRows.push({
              outboundCode: boxCode,
              brandName: itemBrand,
              modelName: itemModelName,
              techName: itemTech,
              cantidad: 1,
              material: item.material || data.box?.material || hist.material || '',
              valuation: item.valuation || data.box?.valuation || hist.valuation || '',
              series: sn ? [sn] : [],
            });
          }
        } else {
          detalleRows.push({
            outboundCode: boxCode,
            brandName,
            modelName,
            techName,
            cantidad: data.equipos_count || data.items.length,
            material: data.box?.material || hist.material || '',
            valuation: data.box?.valuation || hist.valuation || '',
          });
        }

        labelPayloads.push({
          outboundCode: boxCode,
          brandName,
          modelName,
          techName,
          capacity: data.box?.capacity || data.items.length,
          boxMaterial: data.box?.material || hist.material || '',
          boxValuation: data.box?.valuation || hist.valuation || '',
          items: data.items,
        });
      }

      await printOutboundDetalle(detalleRows, {
        fechaSalida,
        numeroSalida: first.dispatch.guide_number || hist.guide_number || undefined,
        trasladoSap: first.dispatch.traslado_sap || undefined,
        notaEntrega: first.dispatch.nota_entrega || undefined,
        destino: first.dispatch.destino || undefined,
        origen: 'Tech Corps Guatemala S.A.',
        includeSeries: isIndividual,
      });

      await printOutboundLabels(labelPayloads, {
        onEmpty: () => notify.warning('No hay series para imprimir en este conduce.'),
        onBarcodeError: () => notify.error('No se pudo generar la etiqueta de series.'),
      });
    } catch (e: any) {
      notify.error('No se pudo reimprimir', {
        description: e?.message || 'Error al cargar el conduce.',
      });
    }
  };

  const handleExportHistoryExcel = async (hist: DespachoHistoryGroup | any) => {
    try {
      const memberIds: string[] =
        Array.isArray(hist.memberIds) && hist.memberIds.length > 0
          ? hist.memberIds
          : [hist.id];
      const reprints = await Promise.all(
        memberIds.map((id) => fetchDespachoHistoryReprint(id))
      );
      const withItems = reprints.filter((d) => d.items?.length);
      if (!withItems.length) {
        notify.warning('Este conduce no tiene series para exportar.');
        return;
      }

      const ns =
        withItems[0]?.dispatch.guide_number || hist.guide_number || '';
      const rows: Record<string, string | number>[] = [];
      let seq = 0;

      for (const data of withItems) {
        const boxCode = data.box?.box_code || hist.box_code || '';
        const brandId = data.box?.brand_id || hist.brand_id;
        const modelId = data.box?.model_id || hist.model_id;
        const brandName = dbBrands.find((b) => b.id === brandId)?.name || '';
        const model = dbModels.find((m) => m.id === modelId);
        const modelName = model?.name || '';
        const techName = dbTechs.find((t) => t.id === model?.technology_id)?.name || '';
        const fecha = data.dispatch.dispatched_at || hist.dispatched_at || hist.created_at || '';

        for (const it of data.items) {
          seq += 1;
          rows.push({
            'Nº Conduce': ns,
            Outbound: boxCode,
            Destino: data.dispatch.destino || hist.notes || '',
            'Traslado SAP': data.dispatch.traslado_sap || '',
            'Nota Entrega': data.dispatch.nota_entrega || '',
            'Fecha salida': fecha ? new Date(fecha).toLocaleString('es-PA') : '',
            Usuario: hist.dispatched_by_name || '',
            Marca: brandName,
            Modelo: modelName,
            Tecnología: techName,
            Material: it.material || data.box?.material || '',
            Valoración: it.valuation || data.box?.valuation || '',
            '#': seq,
            S1: it.s1 || it.serial_number || '',
            S2: it.s2 || '',
            S3: it.s3 || '',
            S4: it.s4 || '',
          });
        }
      }

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Series');
      const safeNs = String(ns || 'salida').replace(/[^\w.-]+/g, '_');
      XLSX.writeFile(wb, `Conduce_${safeNs}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      notify.success(`Excel generado: ${rows.length} equipo(s)`);
    } catch (e: any) {
      notify.error('No se pudo exportar a Excel', {
        description: e?.message || 'Error al cargar el conduce.',
      });
    }
  };

  const formatDispatchType = (t?: string) => {
    if (!t) return '—';
    if (t === 'single_box') return 'Caja';
    if (t === 'partial') return 'Parcial';
    return String(t).replace(/_/g, ' ');
  };

  if (selectedBox) {
    const progress = (boxItems.length / selectedBox.unidades) * 100;
    return (
      <ModulePage
        title={'Llenado Outbound: ' + selectedBox.id}
        subtitle="Escanee los equipos para agregarlos al Outbound."
        category="Despacho"
        actions={
          <Button
            variant="outline"
            onClick={() => {
              setSelectedBox(null);
              void refreshDispatches();
            }}
            leftIcon={<ArrowLeft className="w-4 h-4" />}
          >
            Volver a Outbound
          </Button>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:items-stretch">
          <div className="space-y-6 lg:max-h-[calc(100dvh-10rem)] lg:overflow-y-auto custom-scrollbar">
            <Card className="p-6 space-y-6">
              <h3 className="font-bold text-slate-800">Escáner de Series</h3>
              <form onSubmit={handleScanToBox} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase flex justify-between">
                    <span>SN *</span>
                    <span className="text-slate-400 font-normal">Max: 15</span>
                  </label>
                  <input
                    type="text"
                    value={scanSN}
                    onChange={e => setScanSN(e.target.value)}
                    placeholder="Escanear SN (15 dig)..."
                    className="w-full bg-[var(--surface-hover)] border-2 border-[var(--border)] focus:border-[var(--accent)] rounded-lg px-4 py-3 outline-none transition-colors font-mono font-bold"
                    autoFocus
                  />
                </div>

                <Button type="submit" variant="primary" className="w-full py-4 text-sm">
                  Registrar Equipo (Enter)
                </Button>
              </form>
            </Card>

            <Card className="p-6">
              <h3 className="text-sm text-slate-500 font-medium mb-4">Detalle Outbound</h3>
              <div className="space-y-2 mb-4 text-slate-700">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-xs uppercase text-slate-400">N° Outbound</span>
                  <span className="font-black text-sm font-mono text-[var(--heading)]">{selectedBox.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-xs uppercase text-slate-400">Marca</span>
                  <span className="font-medium text-sm">{dbBrands.find(b => b.id === selectedBox.brand_id)?.name || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-xs uppercase text-slate-400">Modelo</span>
                  <span className="font-medium text-sm">{dbModels.find(m => m.id === selectedBox.model_id)?.name || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-xs uppercase text-slate-400">Tecnología</span>
                  <span className="font-medium text-sm">{dbTechs.find(t => t.id === dbModels.find(m => m.id === selectedBox.model_id)?.technology_id)?.name || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-xs uppercase text-slate-400">QTY (Max)</span>
                  <span className="font-medium text-sm">{selectedBox.unidades}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-xs uppercase text-slate-400">Material</span>
                  <span className="font-medium text-sm font-mono">{selectedBox.material || boxItems[0]?.material || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-xs uppercase text-slate-400">Valoración</span>
                  <span className="font-medium text-sm font-mono">{selectedBox.valuation || boxItems[0]?.valuation || '—'}</span>
                </div>
              </div>
              <div className="flex flex-col gap-2 mt-4">
                <Button onClick={() => void printBoxLabel()} className="w-full" variant="outline">
                  <FileText className="w-4 h-4 mr-2" /> PDF Imprimir Etiqueta
                </Button>
                <Button
                  onClick={() => void handleExportBoxReport()}
                  className="w-full"
                  variant="outline"
                  disabled={exportingBoxReport || boxItems.length === 0}
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  {exportingBoxReport ? 'Generando Excel…' : 'Descargar reporte masivo de caja'}
                </Button>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm text-slate-500 font-medium">Progreso Outbound</h3>
                {boxItems.length >= selectedBox.unidades && selectedBox.unidades > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-full">
                    <CheckCircle2 className="w-3 h-3" />
                    Completada
                  </span>
                ) : (
                  <span className="text-[9px] font-black uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-100 px-2 py-1 rounded-full">
                    En llenado
                  </span>
                )}
              </div>
              <div className="flex items-end gap-2 mb-3">
                <span className="text-3xl font-black text-[var(--heading)]">{boxItems.length}</span>
                <span className="text-sm text-slate-400 font-medium pb-1">/ {selectedBox.unidades} equipos</span>
              </div>
              <div className="h-4 w-full bg-[var(--surface-hover)] rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ease-out ${
                    boxItems.length >= selectedBox.unidades && selectedBox.unidades > 0
                      ? 'bg-emerald-600'
                      : 'bg-[var(--primary)]'
                  }`}
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
              {boxItems.length >= selectedBox.unidades && selectedBox.unidades > 0 && (
                <p className="mt-3 text-xs font-bold text-emerald-700">
                  Ya se completó el Outbound. Listo para despacho.
                </p>
              )}
            </Card>
          </div>

          <div className="lg:col-span-2 flex flex-col min-h-[min(calc(100dvh-10rem),1400px)]">
            <Card className="p-0 overflow-hidden flex-1 flex flex-col min-h-[720px] lg:min-h-[calc(100dvh-10rem)]">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h3 className="font-bold text-slate-800">Contenido Outbound</h3>
              </div>
              <div className="flex-1 min-h-[calc(2.25rem*25+3rem)] overflow-y-auto overflow-x-auto custom-scrollbar">
                <table className="w-full text-left">
                  <thead className={`sticky top-0 z-10 ${erpTableHeader} backdrop-blur`}>
                    <tr>
                      <th className={`px-4 py-2.5 text-[10px] font-black uppercase tracking-widest ${erpTableHeaderText}`}>#</th>
                      <th className={`px-4 py-2.5 text-[10px] font-black uppercase tracking-widest ${erpTableHeaderText}`}>S1 / SN</th>
                      <th className={`px-4 py-2.5 text-[10px] font-black uppercase tracking-widest ${erpTableHeaderText}`}>S2</th>
                      <th className={`px-4 py-2.5 text-[10px] font-black uppercase tracking-widest ${erpTableHeaderText}`}>S3</th>
                      <th className={`px-4 py-2.5 text-[10px] font-black uppercase tracking-widest ${erpTableHeaderText}`}>S4</th>
                      <th className={`px-4 py-2.5 text-[10px] font-black uppercase tracking-widest ${erpTableHeaderText}`}>Material</th>
                      <th className={`px-4 py-2.5 text-[10px] font-black uppercase tracking-widest ${erpTableHeaderText}`}>Valoración</th>
                      <th className={`px-4 py-2.5 text-[10px] font-black uppercase tracking-widest ${erpTableHeaderText} text-right`}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {boxItems.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                        <td className="px-4 py-2 text-xs font-bold text-slate-500">{boxItems.length - idx}</td>
                        <td className="px-4 py-2">
                          <span className="font-mono font-bold text-emerald-600 text-sm">{item.s1 || item.serial_number}</span>
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-slate-400">{item.s2 || '---'}</td>
                        <td className="px-4 py-2 font-mono text-xs text-slate-400">{item.s3 || '---'}</td>
                        <td className="px-4 py-2 font-mono text-xs text-slate-400">{item.s4 || '---'}</td>
                        <td className="px-4 py-2 font-mono text-xs text-slate-600">{item.material || '---'}</td>
                        <td className="px-4 py-2 font-mono text-xs text-slate-600">{item.valuation || '---'}</td>
                        <td className="px-4 py-2 text-right">
                          <button onClick={() => handleRemoveFromBox(item.id)} className="text-rose-400 hover:text-rose-600 p-2 transition-colors" title="Eliminar de la caja">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {boxItems.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-400 text-sm">
                          Outbound vacío. Escanee equipos para llenarlo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      </ModulePage>
    );
  }

  const outboundPageSelectableIds = dispatchPageItems
    .map((d) => d.dbId)
    .filter((id): id is string => Boolean(id));
  const allPageSelected =
    outboundPageSelectableIds.length > 0 &&
    outboundPageSelectableIds.every((id) => selectedBoxIds.has(id));
  const somePageSelected =
    outboundPageSelectableIds.some((id) => selectedBoxIds.has(id)) && !allPageSelected;

  const dispatchColumns: DataTableColumn<any>[] = [
    {
      id: 'select',
      header: (
        <input
          type="checkbox"
          checked={allPageSelected}
          ref={(el) => {
            if (el) el.indeterminate = somePageSelected;
          }}
          onChange={() => toggleSelectPageHeader()}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 accent-[var(--primary)]"
          title={
            allPageSelected || somePageSelected
              ? 'Quitar toda la selección'
              : 'Seleccionar Outbound de esta página'
          }
        />
      ),
      width: '44px',
      cell: (disp: DispatchItem) => (
        <input
          type="checkbox"
          checked={!!disp.dbId && selectedBoxIds.has(disp.dbId)}
          onChange={(e) => {
            e.stopPropagation();
            toggleSelectBox(disp, e.target.checked);
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 accent-[var(--primary)]"
        />
      ),
    },
    {
      id: 'outbound',
      header: 'Outbound',
      width: 'minmax(130px,1fr)',
      cell: (disp: DispatchItem) => (
        <span className="text-sm font-black text-[var(--heading)] font-mono tracking-tight">{disp.id}</span>
      ),
    },
    {
      id: 'fecha',
      header: 'Fecha',
      width: '110px',
      cell: (disp: DispatchItem) => (
        <span className="text-xs font-bold text-slate-500">{disp.fecha || '—'}</span>
      ),
    },
    {
      id: 'material',
      header: 'Material',
      width: '110px',
      cell: (disp: DispatchItem) => (
        <span className="text-xs font-mono font-bold text-slate-800">{disp.material || '—'}</span>
      ),
    },
    {
      id: 'valuation',
      header: 'Valoración',
      width: '130px',
      cell: (disp: DispatchItem) => {
        const raw = String(disp.valuation || '').trim();
        const isNoVal = /novalorad|no\s*valorad/i.test(raw);
        const isVal = /valorado/i.test(raw) && !isNoVal;
        if (isVal) {
          return (
            <span className="text-[10px] font-black uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
              Valorado
            </span>
          );
        }
        if (isNoVal || raw) {
          // Si hay lote tipo NOVALORADO, o cualquier valoración no-valorada
          if (isNoVal) {
            return (
              <span className="text-[10px] font-black uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                No valorado
              </span>
            );
          }
        }
        // Fallback por conteos de equipos si no hay texto en caja
        const valN = disp.valorado_count ?? 0;
        const noValN = disp.novalorado_count ?? 0;
        if (valN > 0 && noValN === 0) {
          return (
            <span className="text-[10px] font-black uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
              Valorado
            </span>
          );
        }
        if (noValN > 0 && valN === 0) {
          return (
            <span className="text-[10px] font-black uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
              No valorado
            </span>
          );
        }
        return <span className="text-xs text-slate-400">—</span>;
      },
    },
    {
      id: 'equipos',
      header: 'Equipos',
      width: '100px',
      cell: (disp: DispatchItem) => (
        <span className="text-sm font-black text-slate-800">
          {disp.filled_count ?? 0}
          <span className="text-slate-400 font-bold text-xs"> / {disp.unidades}</span>
        </span>
      ),
    },
    {
      id: 'estatus',
      header: 'Estatus',
      width: '120px',
      cell: (disp: DispatchItem) => {
        const filled = disp.filled_count ?? 0;
        const complete = disp.unidades > 0 && filled >= disp.unidades;
        if (complete) {
          return (
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-[10px] font-black uppercase tracking-tight text-emerald-700">Completada</span>
            </div>
          );
        }
        return (
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="text-[10px] font-black uppercase tracking-tight text-slate-600">Pendiente</span>
          </div>
        );
      },
    },
    {
      id: 'acciones',
      header: 'Acciones',
      width: '240px',
      align: 'right',
      cell: (disp: DispatchItem) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void handlePrintOutboundBoxPdf(disp);
            }}
            className="h-8 px-2 flex items-center justify-center gap-1 rounded-lg bg-slate-100 text-slate-800 hover:bg-slate-200 transition-colors shrink-0"
            title="Imprimir etiqueta PDF"
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="text-[9px] font-black uppercase tracking-wide">PDF</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void handleExportOutboundBoxExcel(disp);
            }}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors shrink-0"
            title="Descargar Excel de la caja"
          >
            <FileSpreadsheet className="w-4 h-4" />
          </button>
          <div
            onClick={(e) => { e.stopPropagation(); handleEditBox(disp); }}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 cursor-pointer transition-colors"
            title="Editar"
          >
            <Pencil className="w-4 h-4" />
          </div>
          <div
            onClick={(e) => { e.stopPropagation(); handleDeleteBox(disp); }}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-100 text-red-600 hover:bg-red-200 cursor-pointer transition-colors"
            title="Eliminar"
          >
            <Trash2 className="w-4 h-4" />
          </div>
          <div
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300 cursor-pointer transition-colors"
            title="Llenar Outbound"
          >
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      ),
    },
  ];

  const dispatchHistoryColumns: DataTableColumn<DespachoHistoryGroup>[] = [
    {
      id: 'conduce',
      header: 'Nº Conduce',
      width: 'minmax(160px,1.2fr)',
      cell: (hist) => {
        const guide = String(hist.guide_number || '').trim();
        const href = guide
          ? `/despacho/historial/${encodeURIComponent(guide)}`
          : null;
        const inner = (
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
              <Truck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-sm font-black text-[var(--heading)] font-mono block truncate group-hover/link:text-emerald-700">
                {guide || '—'}
              </span>
              {hist.box_count > 1 ? (
                <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-600">
                  {hist.box_count} cajas
                </span>
              ) : null}
            </div>
          </div>
        );
        if (!href) return inner;
        return (
          <Link
            href={href}
            className="group/link block hover:opacity-90 transition-opacity"
            title="Ver cajas de este conduce"
            onClick={(e) => e.stopPropagation()}
          >
            {inner}
          </Link>
        );
      },
    },
    {
      id: 'destino',
      header: 'Destino / Detalle',
      width: 'minmax(220px,1.8fr)',
      cell: (hist) => (
        <div className="min-w-0 space-y-1">
          <span className="text-xs font-bold text-slate-600 line-clamp-2 block">
            {hist.notes || '—'}
          </span>
          {hist.box_codes?.length ? (
            <span
              className="text-[10px] font-mono font-bold text-slate-400 line-clamp-1 block"
              title={hist.box_codes.join(', ')}
            >
              {hist.box_codes.length <= 3
                ? hist.box_codes.join(' · ')
                : `${hist.box_codes.slice(0, 3).join(' · ')} +${hist.box_codes.length - 3}`}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      id: 'fecha',
      header: 'Fecha salida',
      width: '180px',
      cell: (hist) => (
        <span className="text-xs font-bold text-slate-500">
          {new Date(hist.dispatched_at || hist.created_at || Date.now()).toLocaleString()}
        </span>
      ),
    },
    {
      id: 'tipo',
      header: 'Tipo',
      width: '110px',
      cell: (hist) => <Badge variant="blue">{formatDispatchType(hist.dispatch_type)}</Badge>,
    },
    {
      id: 'items',
      header: 'Equipos',
      width: '90px',
      cell: (hist) => (
        <span className="text-sm font-bold text-slate-700">
          {hist.equipos_count ?? hist.dispatch_items?.[0]?.count ?? 0}
        </span>
      ),
    },
    {
      id: 'usuario',
      header: 'Usuario',
      width: 'minmax(140px,1fr)',
      cell: (hist) => (
        <span className="text-xs font-bold text-slate-500">
          {hist.dispatched_by_name || hist.dispatched_by || 'Sistema'}
        </span>
      ),
    },
    {
      id: 'acciones',
      header: 'Acciones',
      width: '150px',
      cell: (hist) => {
        const guide = String(hist.guide_number || '').trim();
        return (
          <div className="flex items-center gap-1.5">
            {guide ? (
              <Link
                href={`/despacho/historial/${encodeURIComponent(guide)}`}
                onClick={(e) => e.stopPropagation()}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                title="Ver detalle de cajas"
              >
                <Eye className="w-4 h-4" />
              </Link>
            ) : null}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleReprintHistory(hist);
              }}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
              title="Reimprimir conduce y series"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleExportHistoryExcel(hist);
              }}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors"
              title="Exportar series a Excel"
            >
              <FileSpreadsheet className="w-4 h-4" />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <ModulePage
      title="Despacho Final & Logística de Salida"
      subtitle="Gestión de salidas masivas, individuales y consolidación en Master Boxes para transporte optimizado."
      category="Despacho"
      actions={
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setShowUploadSAPModal(true)} leftIcon={<Upload className="w-4 h-4" />}>
            Cargar Excel SAP
          </Button>
          <Button variant="outline" onClick={() => {
            setEditBoxId(null);
            setBoxBrand(''); setBoxModel(''); setBoxTech(''); setBoxQty('');
            setBoxCount(1);
            setBoxMaterial(''); setBoxValuation('');
            setShowCreateBoxModal(true);
          }} leftIcon={<Plus className="w-4 h-4" />}>
            Crear Outbound
          </Button>
          <Button variant="primary" onClick={() => {
            if (selectedBoxIds.size > 0) {
              openSalidaForSelection();
              return;
            }
            setShowDispatchForm(!showDispatchForm);
          }} leftIcon={<Truck className="w-4 h-4" />}>
            {selectedBoxIds.size > 0
              ? `Despachar (${selectedBoxIds.size})`
              : showDispatchForm
                ? 'Cancelar Despacho'
                : 'Nuevo Despacho'}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className={`${erpTab.list} w-fit flex-wrap`}>
          {(
            [
              { id: 'equipo_listo' as const, label: 'Equipo Listo', icon: CheckCircle2 },
              { id: 'operacion' as const, label: 'Gestión de Outbound', icon: null },
              { id: 'historial' as const, label: 'Historial de Despachos', icon: null },
              { id: 'cqrs' as const, label: 'Pendientes (CQRS Eventos)', icon: Boxes },
              { id: 'lotes' as const, label: 'Lotes de salida', icon: Boxes },
            ] satisfies Array<{ id: DespachoTabId; label: string; icon: typeof Boxes | null }>
          ).map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={[
                  erpTab.trigger,
                  'px-6 py-2.5 text-sm normal-case tracking-normal',
                  active ? erpTab.triggerActive : erpTab.triggerInactive,
                  Icon ? 'flex items-center gap-2' : '',
                ].filter(Boolean).join(' ')}
              >
                {Icon ? <Icon className="w-4 h-4" /> : null}
                {label}
              </button>
            );
          })}
        </div>

        {activeTab === 'equipo_listo' ? (
          <EquipoListoPanel />
        ) : activeTab === 'lotes' ? (
          <DispatchBatchPanel />
        ) : activeTab === 'cqrs' ? (
          <div className="space-y-6 animate-in fade-in">
            <Card className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">Despachos Pendientes Asíncronos</h3>
                  <p className="text-sm text-slate-500">Ordenes creadas automáticamente al finalizar reparaciones en Taller.</p>
                </div>
                <Button variant="primary" onClick={async () => {
                  try {
                    const items = await fetchDespachoPendientesViaApi();
                    const ws = XLSX.utils.json_to_sheet(items);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, "Despachos Pendientes");
                    XLSX.writeFile(wb, `Despachos_CQRS_${new Date().toISOString().split('T')[0]}.xlsx`);
                  } catch (e) {
                    console.error(e);
                    notify.error('No se pudo exportar pendientes', {
                      description: 'Verifique que el módulo Despacho CQRS esté activo.',
                    });
                  }
                }}>
                  Exportar Reporte CQRS
                </Button>
              </div>
              <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed border-[var(--border)] rounded-[2rem] bg-[var(--surface-hover)]/50">
                <Truck className="w-16 h-16 text-[var(--accent)] mb-4 opacity-50" />
                <h4 className="font-bold text-slate-600 mb-2">Módulo en modo Strangler Fig</h4>
                <p className="text-slate-400 text-sm max-w-md text-center">
                  Las órdenes se están orquestando en segundo plano gracias al Event Bus. Descarga el Excel para visualizar la data segregada (Read Model).
                </p>
              </div>
            </Card>
          </div>
        ) : activeTab === 'operacion' ? (
          <div className="space-y-10 animate-in fade-in">
        
        {showUploadSAPModal && (
          <div className="fixed inset-0 bg-[#0b0e20]/80 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in">
            <Card className="w-full max-w-md bg-[var(--surface)] border-[var(--border)] shadow-2xl overflow-hidden animate-in zoom-in-95">
              <div className="p-6 border-b border-[var(--border)] bg-[var(--surface-hover)] flex items-center justify-between">
                <h2 className="text-xl font-bold text-[var(--heading)] flex items-center gap-2">
                  <Upload className="w-5 h-5 text-[var(--accent)]" />
                  Cargar Validaciones SAP
                </h2>
                <button 
                  onClick={() => setShowUploadSAPModal(false)}
                  className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-8 bg-[var(--surface-hover)] flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 mb-2">
                  <FileText className="w-8 h-8" />
                </div>
                <h3 className="font-bold text-slate-800">Sube tu archivo Excel</h3>
                <p className="text-sm text-slate-500">
                  El archivo debe contener las columnas <strong className="text-slate-700">Número de serie</strong>, <strong className="text-slate-700">Material</strong> y <strong className="text-slate-700">Lote</strong> (Valoración).
                </p>
                <div className="relative w-full mt-4">
                  <input 
                    type="file" 
                    accept=".xlsx, .xls"
                    onChange={handleUploadSAP}
                    disabled={isUploadingSAP}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <Button variant="primary" className="w-full pointer-events-none" disabled={isUploadingSAP}>
                    {isUploadingSAP ? 'Procesando archivo...' : 'Seleccionar archivo .xlsx'}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {showCreateBoxModal && (
          <div className="fixed inset-0 bg-[#0b0e20]/80 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in">
            <Card className="w-full max-w-lg bg-[var(--surface)] border-[var(--border)] shadow-2xl overflow-hidden animate-in zoom-in-95">
              <div className="p-6 border-b border-[var(--border)] bg-[var(--surface-hover)] flex items-center justify-between">
                <h2 className="text-xl font-bold text-[var(--heading)] flex items-center gap-2">
                  <Package className="w-5 h-5 text-[var(--accent)]" />
                  {editBoxId ? 'Editar Outbound' : 'Crear Outbound'}
                </h2>
                <button 
                  onClick={() => {
                    setShowCreateBoxModal(false);
                    setEditBoxId(null);
                    setBoxCount(1);
                  }}
                  className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-4 bg-[var(--surface-hover)]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className={erpLabelClass}>Tecnología</label>
                    <select 
                      className={erpFieldClass}
                      value={boxTech}
                      onChange={(e) => {
                        setBoxTech(e.target.value);
                        setBoxBrand('');
                        setBoxModel('');
                        setBoxMaterial('');
                        setBoxValuation('');
                      }}
                    >
                      <option value="">Seleccione...</option>
                      {dbTechs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className={erpLabelClass}>Marca</label>
                    <select 
                      className={erpFieldClass}
                      value={boxBrand}
                      disabled={!boxTech}
                      onChange={(e) => {
                        setBoxBrand(e.target.value);
                        setBoxModel('');
                        setBoxMaterial('');
                        setBoxValuation('');
                      }}
                    >
                      <option value="">{boxTech ? 'Seleccione...' : 'Tecnología primero'}</option>
                      {outboundBrands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className={erpLabelClass}>Modelo</label>
                    <select 
                      className={erpFieldClass}
                      value={boxModel}
                      disabled={!boxBrand}
                      onChange={(e) => {
                        setBoxModel(e.target.value);
                        setBoxMaterial('');
                        setBoxValuation('');
                      }}
                    >
                      <option value="">{boxBrand ? 'Seleccione...' : 'Marca primero'}</option>
                      {outboundModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className={erpLabelClass}>Equipos por caja</label>
                    <input 
                      type="number" 
                      min={1}
                      placeholder="Ej: 9"
                      className={erpFieldClass}
                      value={boxQty}
                      onChange={(e) => setBoxQty(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </div>

                  {!editBoxId ? (
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className={erpLabelClass}>Cantidad de cajas</label>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        placeholder="Ej: 5"
                        className={erpFieldClass}
                        value={boxCount}
                        onChange={(e) =>
                          setBoxCount(e.target.value === '' ? '' : Number(e.target.value))
                        }
                      />
                      <p className="text-[11px] text-[var(--muted)] font-medium">
                        Misma tecnología, marca, modelo, material y valoración en cada outbound (máx. 50).
                      </p>
                    </div>
                  ) : null}

                  <div className="space-y-1.5">
                    <label className={erpLabelClass}>Material</label>
                    <select
                      className={`${erpFieldClass} font-mono`}
                      value={boxMaterial}
                      disabled={!boxModel || sapMatLotQuery.isLoading}
                      onChange={(e) => {
                        setBoxMaterial(e.target.value);
                        setBoxValuation('');
                      }}
                    >
                      <option value="">
                        {!boxModel
                          ? 'Modelo primero'
                          : sapMatLotQuery.isLoading
                            ? 'Cargando SAP...'
                            : sapMaterialOptions.length === 0
                              ? 'Sin material SAP para este modelo'
                              : 'Seleccione material SAP...'}
                      </option>
                      {sapMaterialOptions.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className={erpLabelClass}>Valoración</label>
                    <select
                      className={`${erpFieldClass} font-mono`}
                      value={boxValuation}
                      disabled={!boxMaterial || sapMatLotQuery.isLoading}
                      onChange={(e) => setBoxValuation(e.target.value)}
                    >
                      <option value="">
                        {!boxMaterial
                          ? 'Material primero'
                          : sapMatLotQuery.isLoading
                            ? 'Cargando SAP...'
                            : sapValuationOptions.length === 0
                              ? 'Sin valoración SAP para este material'
                              : 'Seleccione valoración SAP...'}
                      </option>
                      {sapValuationOptions.map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {boxModel && !sapMatLotQuery.isLoading && sapMatLotPairs.length === 0 && (
                  <p className="text-[11px] text-amber-700 font-medium">
                    No hay Material/Valoración SAP en series de este marca+modelo. Valide equipos en Integración SAP o cargue el Excel G985.
                  </p>
                )}
              </div>

              <div className="p-6 bg-[var(--surface-hover)] border-t border-[var(--border)] flex justify-end gap-3">
                <Button variant="outline" onClick={() => {
                  setShowCreateBoxModal(false);
                  setEditBoxId(null);
                  setBoxBrand(''); setBoxModel(''); setBoxTech(''); setBoxQty('');
                  setBoxCount(1);
                  setBoxMaterial(''); setBoxValuation('');
                }}>
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void handleCreateBox()}
                  disabled={
                    creatingBoxes ||
                    !boxBrand ||
                    !boxModel ||
                    !boxQty ||
                    !boxTech ||
                    (!editBoxId && (Number(boxCount) < 1 || Number(boxCount) > 50))
                  }
                >
                  {creatingBoxes
                    ? 'Creando…'
                    : editBoxId
                      ? 'Guardar Outbound'
                      : Number(boxCount) > 1
                        ? `Crear ${Math.min(50, Math.floor(Number(boxCount) || 1))} Outbounds`
                        : 'Crear Outbound'}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {showDispatchForm && (
          <Card className="border-2 border-[var(--accent)]/20 p-0 overflow-hidden animate-rise-in">
            <div className="border-b border-[var(--border)] bg-[var(--surface-hover)] p-8 text-[var(--heading)] flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="bg-[var(--accent)]/10 p-3 rounded-2xl">
                  <Package className="w-6 h-6 text-[var(--accent)]" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Configuración de Salida</h2>
                  <p className="text-[var(--muted)] text-xs font-medium">Defina el tipo de despacho y escanee las unidades</p>
                </div>
              </div>
              <div className="flex gap-2">
                {(['master_box', 'massive', 'individual'] as const).map(type => (
                  <button 
                    key={type}
                    onClick={() => setDispatchType(type)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${dispatchType === type ? 'bg-[var(--accent)] text-[var(--heading)]' : 'bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--border)]'}`}
                  >
                    {type.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-8 space-y-8">
              <div className="grid md:grid-cols-3 gap-8">
                <div className="space-y-2">
                  <label className={erpLabelClass}>Destino / Cliente</label>
                  <input type="text" placeholder="Ej: Bodega Central" className={erpFieldClass} />
                </div>
                <div className="space-y-2">
                  <label className={erpLabelClass}>Transporte / Ruta</label>
                  <select className={erpFieldClass}>
                    <option>Ruta Norte - Piloto A</option>
                    <option>Ruta Sur - Piloto B</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className={erpLabelClass}>Prioridad</label>
                  <select className={erpFieldClass}>
                    <option>Normal</option>
                    <option>Urgente (SLA 24h)</option>
                  </select>
                </div>
              </div>

              <div className="pt-8 border-t border-slate-100">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <QrCode className="w-5 h-5 text-[var(--accent)]" />
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Validación de Salida (Escaneo)</h3>
                  </div>
                  <Badge variant="blue">{itemsToDispatch.length} Items Escaneados</Badge>
                </div>

                <form onSubmit={handleScan} className="flex gap-4">
                  <input 
                    type="text" 
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    placeholder="Escanee Serie o Código de Caja..."
                    className="flex-1 bg-[var(--surface-hover)] p-5 rounded-2xl border-2 border-[var(--border)] focus:border-[var(--accent)] outline-none text-lg font-mono font-bold shadow-sm transition-all"
                  />
                  <Button type="submit" className="px-12 rounded-2xl">Validar</Button>
                </form>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mt-8">
                  {itemsToDispatch.map((item, i) => (
                    <div key={i} className="bg-[var(--surface-hover)] p-3 rounded-xl text-[10px] font-mono font-bold flex items-center justify-between group border border-[var(--border)]">
                      <span className="truncate">{item}</span>
                      <button onClick={() => setItemsToDispatch(itemsToDispatch.filter((_, idx) => idx !== i))} className="text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                    </div>
                  ))}
                  {itemsToDispatch.length === 0 && (
                    <div className="col-span-full py-16 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 rounded-[2.5rem] opacity-30">
                      <Boxes className="w-12 h-12 mb-4" />
                      <p className="text-xs font-black uppercase tracking-widest">Esperando escaneo de unidades...</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-8 border-t border-slate-100">
                <Button variant="outline" onClick={() => setShowDispatchForm(false)}>Descartar</Button>
                <Button variant="primary" className="px-12 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-500/20" disabled={itemsToDispatch.length === 0}>
                  Finalizar y Generar Guía de Salida
                </Button>
              </div>
            </div>
          </Card>
        )}

        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ModuleToolbar
              onSearch={(v) => {
                setOutboundSearch(v);
                startTransition(() => setOutboundPage(1));
              }}
              addLabel="Nuevo Despacho"
            />
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap items-end gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] px-3 py-2">
                <div className="space-y-0.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-[var(--muted)]">
                    Desde OB
                  </label>
                  <input
                    className={`${erpFieldClass} h-8 w-[7.5rem] py-1 text-xs font-mono`}
                    placeholder="32"
                    value={outboundRangeFrom}
                    onChange={(e) => setOutboundRangeFrom(e.target.value)}
                    disabled={exportingBulkExcel}
                  />
                </div>
                <div className="space-y-0.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-[var(--muted)]">
                    Hasta OB
                  </label>
                  <input
                    className={`${erpFieldClass} h-8 w-[7.5rem] py-1 text-xs font-mono`}
                    placeholder="150"
                    value={outboundRangeTo}
                    onChange={(e) => setOutboundRangeTo(e.target.value)}
                    disabled={exportingBulkExcel}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={exportingBulkExcel}
                  onClick={handleSelectOutboundRange}
                >
                  Seleccionar rango
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<FileSpreadsheet className="w-3.5 h-3.5" />}
                  disabled={exportingBulkExcel || dispatches.every((d) => !d.dbId)}
                  onClick={() => void handleRangeOutboundExcelExport()}
                >
                  Excel rango
                </Button>
              </div>
              <Button
                variant="outline"
                leftIcon={<FileSpreadsheet className="w-4 h-4" />}
                disabled={exportingBulkExcel || dispatches.every((d) => !d.dbId)}
                onClick={() => void handleBulkOutboundExcelExport()}
              >
                {exportingBulkExcel
                  ? 'Generando Excel…'
                  : selectedBoxIds.size > 0
                    ? `Excel selección (${selectedBoxIds.size})`
                    : `Reporte Excel masivo (${dispatches.filter((d) => d.dbId).length})`}
              </Button>
            {selectedBoxIds.size > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-500">
                  {selectedBoxIds.size} Outbound · {selectedBoxes.reduce((n, b) => n + (b.filled_count ?? 0), 0)} equipos
                </span>
                <Button variant="outline" size="sm" onClick={clearBoxSelection}>
                  Limpiar selección
                </Button>
                <Button
                  variant="primary"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  leftIcon={<Truck className="w-4 h-4" />}
                  onClick={openSalidaForSelection}
                >
                  Despachar seleccionados
                </Button>
              </div>
            )}
            </div>
          </div>

          <Card padding="none" className="overflow-hidden">
            <DataTable
              columns={dispatchColumns}
              data={dispatchPageItems}
              getRowId={(disp: DispatchItem) => disp.dbId || disp.id}
              onRowClick={(disp: DispatchItem) => handleSelectBox(disp)}
              rowClassName={(disp: DispatchItem) =>
                `group cursor-pointer ${disp.dbId && selectedBoxIds.has(disp.dbId) ? 'bg-sky-50/80' : ''}`
              }
              rowHeight={64}
              maxBodyHeight={560}
              minWidth={1100}
              headerClassName={erpTableHeader}
              headerTextClassName={erpTableHeaderText}
              emptyMessage={
                despachoQuery.isLoading || despachoQuery.isFetching
                  ? 'Cargando Outbound…'
                  : despachoQuery.isError
                    ? 'Error al cargar Outbound. Use Actualizar o reintente.'
                    : outboundSearch.trim()
                      ? `Sin resultados para «${outboundSearch.trim()}». Pruebe OB-000032 o solo 32.`
                      : 'No hay Outbound registrados.'
              }
            />
            <TablePagination
              totalCount={outboundTotalCount}
              page={outboundSafePage}
              totalPages={outboundTotalPages}
              startItem={outboundStartItem}
              endItem={outboundEndItem}
              pageSize={DESPACHO_OUTBOUND_PAGE_SIZE}
              onPageChange={onOutboundPageChange}
              itemLabel="Outbound"
            />
          </Card>
        </section>
        </div>
        ) : (
          <div className="space-y-6 animate-in fade-in">
            <ModuleToolbar
              onSearch={(v) => {
                setHistorySearch(v);
                startTransition(() => setHistoryPage(1));
              }}
              searchValue={historySearch}
              searchPlaceholder="Buscar por serie, Nº conduce (NS-…) o caja (OB-…)"
            />
            <Card padding="none" className="overflow-hidden">
              <DataTable
                columns={dispatchHistoryColumns}
                data={dispatchHistoryPageItems}
                getRowId={(hist) => hist.guide_number || hist.id}
                rowHeight={64}
                maxBodyHeight={560}
                minWidth={900}
                headerClassName={erpTableHeader}
                headerTextClassName={erpTableHeaderText}
                emptyMessage={
                  historySearch.trim()
                    ? `Sin resultados para «${historySearch.trim()}». Pruebe NS-000004, OB-000032 o un serial.`
                    : 'No hay historial de despachos registrados.'
                }
              />
              <TablePagination
                totalCount={historyTotalCount}
                page={historySafePage}
                totalPages={historyTotalPages}
                startItem={historyStartItem}
                endItem={historyEndItem}
                pageSize={DESPACHO_HISTORY_PAGE_SIZE}
                onPageChange={onHistoryPageChange}
                itemLabel="despachos"
              />
            </Card>
          </div>
        )}
      </div>

      {showSalidaModal && salidaBoxes.length > 0 && (
        <DespachoSalidaModal
          boxes={salidaBoxes}
          dispatchType={dispatchType}
          onClose={() => setShowSalidaModal(false)}
          onDone={() => {
            setShowSalidaModal(false);
            setSelectedBoxIds(new Set());
            refreshDispatches();
          }}
        />
      )}
    </ModulePage>
  );
}
// Force HMR refresh
