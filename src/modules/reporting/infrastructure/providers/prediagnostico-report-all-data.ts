import { getSupabaseServerClient } from '@/lib/supabase/server';
import { isPrediagnosticoBackfillNotes } from '@/modules/backoffice/prediagnostico/prediagnosticoBackfillMarkers';
import type { SerialPickRow } from '@/lib/sap/equipmentSerialSlots';
import type { ReportFilterParams, ReportRow } from '../../domain/types/report.types';
import type { PrediagnosticoCheckItem } from './prediagnostico-report-format';
import {
  buildPrediagnosticoContractRow,
  formatIngressDateGt,
  formatPrediagnosticoDictamenLabel,
  formatPrediagnosticoObservacionesExport,
  formatVigenciaContract,
  resolveAgenciaRecuperacionSca,
  resolveProcedenciaFromSeries,
  resolvePrediagnosticoEquipmentSerials,
} from './prediagnostico-contract-report';
import {
  loadSapMaterialMaps,
  resolveNumeroTrasladoSap,
  resolvePrediagnosticoSku,
} from './prediagnostico-sap-enrichment';
import {
  buildPrediagnosticoDynamicCells,
  buildPrediagnosticoExportColumns,
  resolvePrediagnosticoExportItems,
} from './prediagnostico-export-catalog';
import { resolveEntrySource } from '@/modules/workshop/shared/entrySource';

const PAGE = 500;
/** PostgREST GET con `.in()` > ~100 UUIDs suele romper la URL → `fetch failed`. */
const IN_CHUNK = 80;

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type PredRow = {
  service_order_id: string;
  clase_carcasa: string;
  dictamen: string;
  observaciones: string | null;
  detalles_cosmeticos: unknown;
  funcionamiento: unknown;
  creado_en: string;
};

type OsRow = {
  id: string;
  os_label: string | null;
  brand_id: string | null;
  model_id: string | null;
  main_serial: string | null;
  created_at: string | null;
  reception_guides: { agency?: string | null; guide_number?: string | null } | null;
  sap_transfer_id?: string | null;
  sap_transfer_documents?: { agency?: string | null; sap_document_number?: string | null } | null;
};

type SeriesRow = {
  id: string;
  service_order_id: string;
  serial_number: string | null;
  s2: string | null;
  s3: string | null;
  s4: string | null;
  material: string | null;
  valuation: string | null;
  entry_source: string | null;
  created_at: string | null;
  sap_transfer_id?: string | null;
  sap_transfer_documents?: { agency?: string | null; sap_document_number?: string | null } | null;
  receptions: {
    source?: string | null;
    carrier?: string | null;
    guide_number?: string | null;
    notes?: string | null;
    sap_document?: string | null;
  } | null;
};

function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') out[key] = entry;
  }
  return out;
}

function seriesToPickRows(rows: SeriesRow[]): SerialPickRow[] {
  return rows.map((s) => ({
    id: String(s.id),
    serial_number: s.serial_number,
    material: s.material,
    valuation: s.valuation,
    created_at: s.created_at,
    s2: s.s2,
    s3: s.s3,
    s4: s.s4,
  }));
}

/** Exportación completa desde `prediagnosticos` (formato contractual SCA). */
export async function fetchPrediagnosticoReportAllData(
  filters: ReportFilterParams,
  items: PrediagnosticoCheckItem[],
  catalogs: {
    techMap: Map<string, string>;
    brandMap: Map<string, string>;
    modelMap: Map<
      string,
      { name: string; technology_id: string | null; portfolio_vigencia?: string | null }
    >;
  },
  modelItemProfiles: Map<string, string[]>
): Promise<{ rows: ReportRow[]; truncated: boolean; exportColumns: string[] }> {
  const supabase = getSupabaseServerClient();
  const reportRows: ReportRow[] = [];
  const modelIdsSeen = new Set<string>();
  let truncated = false;
  const rowCap = filters.maxRows ?? (filters.allData ? 250_000 : 50_000);

  for (let offset = 0; ; offset += PAGE) {
    let q = supabase
      .from('prediagnosticos')
      .select(
        'service_order_id, clase_carcasa, dictamen, observaciones, detalles_cosmeticos, funcionamiento, creado_en'
      )
      .order('creado_en', { ascending: false })
      .range(offset, offset + PAGE - 1);

    if (!filters.allData) {
      if (filters.from) q = q.gte('creado_en', `${filters.from}T00:00:00`);
      if (filters.to) q = q.lte('creado_en', `${filters.to}T23:59:59`);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const chunk = (data || []) as PredRow[];
    if (chunk.length === 0) break;

    const osIds = chunk.map((r) => r.service_order_id);
    const osRows: OsRow[] = [];
    for (const slice of chunkArray(osIds, IN_CHUNK)) {
      const { data: osData, error: osErr } = await supabase
        .from('service_orders')
        .select(
          `id, os_label, brand_id, model_id, main_serial, created_at, sap_transfer_id,
           reception_guides:reception_guide_id(agency, guide_number),
           sap_transfer_documents:sap_transfer_id(agency, sap_document_number)`
        )
        .in('id', slice);
      if (osErr) throw new Error(osErr.message);
      osRows.push(...((osData || []) as OsRow[]));
    }
    const osById = new Map(osRows.map((row) => [String(row.id), row]));

    const seriesRows: SeriesRow[] = [];
    for (const slice of chunkArray(osIds, IN_CHUNK)) {
      const { data: seriesData, error: seriesErr } = await supabase
        .from('series')
        .select(
          `id, service_order_id, serial_number, s2, s3, s4, material, valuation, entry_source, created_at, sap_transfer_id,
           sap_transfer_documents:sap_transfer_id(agency, sap_document_number),
           receptions:current_reception_id(source, carrier, guide_number, notes, sap_document)`
        )
        .in('service_order_id', slice)
        .not('brand_id', 'is', null);
      if (seriesErr) throw new Error(seriesErr.message);
      seriesRows.push(...((seriesData || []) as SeriesRow[]));
    }

    const seriesByOs = new Map<string, SeriesRow[]>();
    for (const s of seriesRows) {
      const osId = String(s.service_order_id);
      const list = seriesByOs.get(osId) || [];
      list.push(s);
      seriesByOs.set(osId, list);
    }

    const serialsInChunk = seriesRows
      .map((s) => String(s.serial_number ?? '').trim())
      .filter(Boolean);
    const sapMaterial = await loadSapMaterialMaps(supabase, osIds, serialsInChunk);

    for (const row of chunk) {
      if (reportRows.length >= rowCap) {
        truncated = true;
        break;
      }

      const notes = row.observaciones ? String(row.observaciones) : '';
      if (filters.excludeBackfill && isPrediagnosticoBackfillNotes(notes)) continue;

      const os = osById.get(row.service_order_id);
      if (!os) continue;

      if (filters.techId || filters.brandId || filters.modelId) {
        const modelMeta = os.model_id ? catalogs.modelMap.get(os.model_id) : undefined;
        if (filters.modelId && os.model_id !== filters.modelId) continue;
        if (filters.brandId && os.brand_id !== filters.brandId) continue;
        if (filters.techId && modelMeta?.technology_id !== filters.techId) continue;
      }

      const modelMeta = os.model_id ? catalogs.modelMap.get(os.model_id) : undefined;
      if (os.model_id) modelIdsSeen.add(os.model_id);
      const marca = os.brand_id ? catalogs.brandMap.get(os.brand_id) || '' : '';
      const modelo = modelMeta?.name || '';
      const tecnologia = modelMeta?.technology_id
        ? catalogs.techMap.get(modelMeta.technology_id) || ''
        : '';
      const cosmetics = asRecord(row.detalles_cosmeticos);
      const functionChecks = asRecord(row.funcionamiento);
      const dictamen = formatPrediagnosticoDictamenLabel(row.dictamen);
      const observaciones = formatPrediagnosticoObservacionesExport(notes);
      const checkCells = buildPrediagnosticoDynamicCells({
        items,
        functionChecks,
        cosmetics,
        claseCarcasa: row.clase_carcasa,
      });

      const siblings = seriesByOs.get(row.service_order_id) || [];
      const pickRows = seriesToPickRows(siblings);
      const serialMap = resolvePrediagnosticoEquipmentSerials(
        pickRows,
        os.main_serial,
        os.main_serial || ''
      );
      const primaryUnit =
        siblings.find((s) => String(s.id) === serialMap.primaryId) ?? siblings[0] ?? null;

      const reception = primaryUnit?.receptions ?? null;
      const entrySource = resolveEntrySource({
        entry_source: primaryUnit?.entry_source,
        receptions: reception?.source ? { source: reception.source } : null,
        guide: reception?.guide_number,
        serial: serialMap.s1 || primaryUnit?.serial_number,
      });
      const guideAgency = os.reception_guides?.agency;
      const sapAgency =
        primaryUnit?.sap_transfer_documents?.agency ??
        os.sap_transfer_documents?.agency ??
        null;
      const agencia = resolveAgenciaRecuperacionSca({
        guideAgency,
        sapAgency,
        receptionNotes: reception?.notes,
        carrier: reception?.carrier,
        entrySource,
      });

      const procedencia = resolveProcedenciaFromSeries({
        entry_source: primaryUnit?.entry_source,
        receptionSource: reception?.source,
        receptionNotes: reception?.notes,
        agencyName: guideAgency || agencia,
        guide: reception?.guide_number,
        serial: serialMap.s1 || primaryUnit?.serial_number,
        carrier: reception?.carrier,
      });

      const vigencia = formatVigenciaContract('', modelMeta?.portfolio_vigencia);
      const ingressIso = primaryUnit?.created_at || os.created_at;
      const sku = resolvePrediagnosticoSku({
        unitMaterial: primaryUnit?.material,
        siblings,
        serviceOrderId: row.service_order_id,
        serial: serialMap.serie,
        sapMaterialByOs: sapMaterial.byOs,
        sapMaterialBySerial: sapMaterial.bySerial,
      });
      const numeroTrasladoSap = resolveNumeroTrasladoSap({
        unitSapTransfer: primaryUnit?.sap_transfer_documents,
        osSapTransfer: os.sap_transfer_documents,
        receptionSapDocument: reception?.sap_document,
      });

      const contract = buildPrediagnosticoContractRow({
        numeroIngresoSca: os.os_label || '',
        procedencia,
        agencia,
        marca,
        modelo,
        sku,
        numeroTrasladoSap,
        serie: serialMap.serie,
        mac: serialMap.mac,
        s1: serialMap.s1,
        s2: serialMap.s2,
        s3: serialMap.s3,
        s4: serialMap.s4,
        tecnologia,
        vigencia,
        fechaIngreso: formatIngressDateGt(ingressIso),
        dictamen,
        checkCells,
        observaciones,
      });

      reportRows.push(contract as ReportRow);
    }

    if (truncated) break;
    if (chunk.length < PAGE) break;
    if (offset + chunk.length >= rowCap) {
      truncated = true;
      break;
    }
  }

  const exportItems = resolvePrediagnosticoExportItems({
    catalog: items,
    modelItemProfiles,
    modelIdFilter: filters.modelId,
    modelIdsSeen: filters.modelId ? undefined : modelIdsSeen,
  });
  const exportColumns = buildPrediagnosticoExportColumns(exportItems);

  return {
    rows: reportRows,
    truncated,
    exportColumns,
  };
}
