import { queryCacTrayAllFiltered } from '@/lib/database/cacTrayUnits';
import { trayRowsToHistoryEntries } from '@/lib/backoffice/trayRowAdapter';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { IReportDataProvider } from '../../domain/ports/report-data-provider.port';
import type { ReportDataResult, ReportFilterParams, ReportRow } from '../../domain/types/report.types';
import type { PrediagnosticoCheckItem } from './prediagnostico-report-format';
import { isPrediagnosticoBackfillNotes } from '@/modules/backoffice/prediagnostico/prediagnosticoBackfillMarkers';
import { fetchPrediagnosticoReportAllData } from './prediagnostico-report-all-data';
import type { SerialPickRow } from '@/lib/sap/equipmentSerialSlots';
import {
  buildPrediagnosticoContractRow,
  formatIngressDateGt,
  formatPrediagnosticoDictamenLabel,
  formatPrediagnosticoObservacionesExport,
  formatProcedenciaScaReport,
  formatVigenciaContract,
  resolveAgenciaRecuperacionSca,
  resolvePrediagnosticoEquipmentSerials,
  finalizePrediagnosticoContractRows,
} from './prediagnostico-contract-report';
import { dedupePrediagnosticoContractRows } from './prediagnostico-export-dedupe';
import { resolveEntrySource } from '@/modules/workshop/shared/entrySource';
import {
  buildPrediagnosticoDynamicCells,
  buildPrediagnosticoExportColumns,
  resolvePrediagnosticoExportItems,
} from './prediagnostico-export-catalog';
import {
  loadSapMaterialMaps,
  resolveNumeroTrasladoSap,
  resolvePrediagnosticoSku,
} from './prediagnostico-sap-enrichment';

type PrediagnosticoDetail = {
  clase: string;
  dictamen: string;
  notes: string;
  cosmetics: Record<string, string>;
  functionChecks: Record<string, string>;
};

function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') out[key] = entry;
  }
  return out;
}

async function loadDetails(serviceOrderIds: string[]): Promise<Map<string, PrediagnosticoDetail>> {
  const supabase = getSupabaseServerClient();
  const byOs = new Map<string, PrediagnosticoDetail>();
  for (let offset = 0; offset < serviceOrderIds.length; offset += 200) {
    const slice = serviceOrderIds.slice(offset, offset + 200);
    const { data, error } = await supabase
      .from('prediagnosticos')
      .select('service_order_id, clase_carcasa, dictamen, observaciones, detalles_cosmeticos, funcionamiento')
      .in('service_order_id', slice);
    if (error) {
      if (error.message.includes('prediagnosticos') || error.message.includes('does not exist')) {
        throw new Error('Falta aplicar la migración 251_prediagnostico.sql en Supabase.');
      }
      throw new Error(error.message);
    }
    for (const row of data || []) {
      byOs.set(String(row.service_order_id), {
        clase: String(row.clase_carcasa || ''),
        dictamen: String(row.dictamen || ''),
        notes: row.observaciones ? String(row.observaciones) : '',
        cosmetics: asRecord(row.detalles_cosmeticos),
        functionChecks: asRecord(row.funcionamiento),
      });
    }
  }
  return byOs;
}

async function loadCheckItems(): Promise<PrediagnosticoCheckItem[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('cat_prediagnostico_items')
    .select('id, name, item_kind, sort_order')
    .eq('active', true)
    .order('sort_order');
  if (error) {
    if (error.message.includes('cat_prediagnostico_items') || error.message.includes('does not exist')) {
      throw new Error('Falta aplicar la migración 251_prediagnostico.sql en Supabase.');
    }
    throw new Error(error.message);
  }
  return (data || []).map((row) => ({
    id: String(row.id),
    name: String(row.name || ''),
    kind: row.item_kind === 'cosmetico' ? 'cosmetico' : 'funcionamiento',
    sortOrder: Number(row.sort_order) || 0,
  }));
}

async function loadModelItemProfiles(): Promise<Map<string, string[]>> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('cat_prediagnostico_model_items').select('model_id, item_id');
  if (error) {
    if (error.message.includes('cat_prediagnostico_model_items') || error.message.includes('does not exist')) {
      return new Map();
    }
    throw new Error(error.message);
  }
  const map = new Map<string, string[]>();
  for (const row of data || []) {
    const modelId = String(row.model_id);
    const list = map.get(modelId) || [];
    list.push(String(row.item_id));
    map.set(modelId, list);
  }
  return map;
}

async function loadCatalogMaps() {
  const supabase = getSupabaseServerClient();
  const [{ data: techs }, { data: brands }, { data: models }] = await Promise.all([
    supabase.from('technologies').select('id, name'),
    supabase.from('brands').select('id, name'),
    supabase.from('models').select('id, name, technology_id'),
  ]);
  return {
    techMap: new Map((techs || []).map((row: { id: string; name: string }) => [row.id, row.name])),
    brandMap: new Map((brands || []).map((row: { id: string; name: string }) => [row.id, row.name])),
    modelMap: new Map(
      (models || []).map(
        (row: {
          id: string;
          name: string;
          technology_id: string | null;
          portfolio_vigencia?: string | null;
        }) => [row.id, row]
      )
    ),
  };
}

export class PrediagnosticoReportProvider implements IReportDataProvider {
  readonly code = 'PREDIAGNOSTICO_EQUIPOS';

  async fetch(filters: ReportFilterParams): Promise<ReportDataResult> {
    const [items, catalogs, modelItemProfiles] = await Promise.all([
      loadCheckItems(),
      loadCatalogMaps(),
      loadModelItemProfiles(),
    ]);

    /** Backfill CHG-015 vive en `prediagnosticos`; la bandeja CAC activa no incluye OS históricas. */
    const fromPrediagnosticosTable =
      filters.allData === true || Boolean(filters.from?.trim() || filters.to?.trim());

    if (fromPrediagnosticosTable) {
      const all = await fetchPrediagnosticoReportAllData(filters, items, catalogs, modelItemProfiles);
      return {
        rows: finalizePrediagnosticoContractRows(
          dedupePrediagnosticoContractRows(all.rows),
          all.exportColumns
        ),
        exportColumns: all.exportColumns,
        truncated: all.truncated,
      };
    }

    const rows = await queryCacTrayAllFiltered({
      from: filters.from,
      to: filters.to,
      search: filters.search,
      techId: filters.techId,
      brandId: filters.brandId,
      modelId: filters.modelId,
      osLabel: filters.osLabel,
      sapDocument: filters.sapDocument,
    });
    let entries = trayRowsToHistoryEntries(rows).filter((entry) => entry.serviceOrderId && entry.prediagnostico);
    if (filters.excludeBackfill) {
      entries = entries.filter((entry) => !isPrediagnosticoBackfillNotes(entry.prediagnostico?.notes));
    }
    const supabase = getSupabaseServerClient();
    const osIds = entries.map((entry) => entry.serviceOrderId || '').filter(Boolean);
    const serials = entries.flatMap((entry) =>
      entry.unit.map((u) => String(u.serial_number ?? '').trim()).filter(Boolean)
    );
    const [details, sapMaterial] = await Promise.all([
      loadDetails(osIds),
      loadSapMaterialMaps(supabase, osIds, serials),
    ]);

    const reportRows: ReportRow[] = [];
    const modelIdsSeen = new Set<string>();
    const rowCap = filters.maxRows ?? 50_000;

    for (const entry of entries) {
      if (reportRows.length >= rowCap) break;

      const detail = details.get(entry.serviceOrderId || '');
      if (!detail) continue;
      if (entry.grp.modelId) modelIdsSeen.add(entry.grp.modelId);

      const model = catalogs.modelMap.get(entry.grp.modelId);
      const marca = catalogs.brandMap.get(entry.grp.brandId) || '';
      const modelo = model?.name || '';
      const tecnologia = model ? catalogs.techMap.get(model.technology_id || '') || '' : '';
      const dictamen = formatPrediagnosticoDictamenLabel(detail.dictamen);
      const observaciones = formatPrediagnosticoObservacionesExport(detail.notes);
      const checkCells = buildPrediagnosticoDynamicCells({
        items,
        functionChecks: detail.functionChecks,
        cosmetics: detail.cosmetics,
        claseCarcasa: detail.clase,
      });
      const entrySource = resolveEntrySource({
        receptions: entry.rec?.source ? { source: entry.rec.source } : null,
        guide: entry.unitGuide,
        serial: entry.unit[0]?.serial_number,
      });
      const agencia = resolveAgenciaRecuperacionSca({
        guideAgency: entry.unitAgencyRaw,
        receptionNotes: entry.rec?.notes,
        carrier: entry.rec?.carrier,
        entrySource,
      });
      const procedencia = formatProcedenciaScaReport({
        entrySource,
        receptionNotes: entry.rec?.notes,
        agencyName: entry.unitAgencyRaw || agencia,
        carrier: entry.rec?.carrier,
        guideNumber: entry.unitGuide,
      });

      const unitPickRows: SerialPickRow[] = entry.unit.map((u) => ({
        id: String(u.id),
        serial_number: u.serial_number,
        created_at: u.service_orders?.created_at,
        s2: (u as { s2?: string | null }).s2,
        s3: (u as { s3?: string | null }).s3,
        s4: (u as { s4?: string | null }).s4,
        material: (u as { material?: string | null }).material,
        valuation: (u as { valuation?: string | null }).valuation,
      }));
      const mainSerial = entry.unit[0]?.service_orders?.main_serial;
      const serialMap = resolvePrediagnosticoEquipmentSerials(
        unitPickRows,
        mainSerial,
        entry.unit[0]?.serial_number || mainSerial || ''
      );
      const ingressIso = entry.unit[0]?.service_orders?.created_at || entry.classifiedAtIso;
      const sku = resolvePrediagnosticoSku({
        unitMaterial: null,
        siblings: unitPickRows,
        serviceOrderId: entry.serviceOrderId || '',
        serial: serialMap.serie,
        sapMaterialByOs: sapMaterial.byOs,
        sapMaterialBySerial: sapMaterial.bySerial,
      });
      const unitSapDoc = entry.unitSap && entry.unitSap !== '---' ? entry.unitSap : '';
      const numeroTrasladoSap = resolveNumeroTrasladoSap({
        receptionSapDocument: unitSapDoc,
      });
      const contract = buildPrediagnosticoContractRow({
        numeroIngresoSca: entry.osLabel,
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
        vigencia: formatVigenciaContract('', model?.portfolio_vigencia),
        fechaIngreso: formatIngressDateGt(ingressIso),
        dictamen,
        checkCells,
        observaciones,
      });
      reportRows.push(contract as ReportRow);
    }

    const exportItems = resolvePrediagnosticoExportItems({
      catalog: items,
      modelItemProfiles,
      modelIdFilter: filters.modelId,
      modelIdsSeen: filters.modelId ? undefined : modelIdsSeen,
    });
    const exportColumns = buildPrediagnosticoExportColumns(exportItems);

    return {
      rows: finalizePrediagnosticoContractRows(
        dedupePrediagnosticoContractRows(reportRows),
        exportColumns
      ),
      exportColumns,
      truncated: rows.length >= 10000 || reportRows.length >= rowCap,
    };
  }
}
