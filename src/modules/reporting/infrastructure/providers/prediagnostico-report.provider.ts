import { queryCacTrayAllFiltered } from '@/lib/database/cacTrayUnits';
import { trayRowsToHistoryEntries } from '@/lib/backoffice/trayRowAdapter';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { IReportDataProvider } from '../../domain/ports/report-data-provider.port';
import type { ReportDataResult, ReportFilterParams, ReportRow } from '../../domain/types/report.types';
import {
  formatPrediagnosticoAccion,
  formatPrediagnosticoDiagnostico,
  type PrediagnosticoCheckItem,
} from './prediagnostico-report-format';

const VERDICT_LABEL: Record<string, string> = {
  reacondicionado: 'Reacondicionado',
  reparado: 'Reparado',
  irreparable: 'Irreparable',
};

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
  }));
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
      (models || []).map((row: { id: string; name: string; technology_id: string | null }) => [row.id, row])
    ),
  };
}

export class PrediagnosticoReportProvider implements IReportDataProvider {
  readonly code = 'PREDIAGNOSTICO_EQUIPOS';

  async fetch(filters: ReportFilterParams): Promise<ReportDataResult> {
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
    const entries = trayRowsToHistoryEntries(rows).filter((entry) => entry.serviceOrderId && entry.prediagnostico);
    const [details, items, catalogs] = await Promise.all([
      loadDetails(entries.map((entry) => entry.serviceOrderId || '').filter(Boolean)),
      loadCheckItems(),
      loadCatalogMaps(),
    ]);

    const reportRows: ReportRow[] = [];
    for (const entry of entries) {
      const detail = details.get(entry.serviceOrderId || '');
      if (!detail) continue;
      const model = catalogs.modelMap.get(entry.grp.modelId);
      const marca = catalogs.brandMap.get(entry.grp.brandId) || '';
      const modelo = model?.name || '';
      const tecnologia = model ? catalogs.techMap.get(model.technology_id || '') || '' : '';
      const descripcion = [tecnologia, marca, modelo].filter(Boolean).join(' ').toUpperCase();
      const fecha = new Date(entry.classifiedAtIso);
      const fe = Number.isNaN(fecha.getTime())
        ? ''
        : fecha.toLocaleDateString('es-GT');

      reportRows.push({
        OS: entry.osLabel,
        FE: fe,
        S1: entry.unit[0]?.serial_number || '',
        S2: entry.unit[1]?.serial_number || '',
        'DESCRIPCIÓN SAP': descripcion,
        MARCA: marca.toUpperCase(),
        MODELO: (modelo || descripcion).toUpperCase(),
        TECNOLOGÍA: tecnologia.toUpperCase(),
        TRATAMIENTO: 'RIP',
        'CANAL DE RECUPERACIÓN': 'CAC',
        DIAGNÓSTICO: formatPrediagnosticoDiagnostico(detail.functionChecks, items),
        ACCIÓN: formatPrediagnosticoAccion(detail.cosmetics, items),
        SAP: entry.unitSap === '---' ? '' : entry.unitSap,
        CLASE: detail.clase,
        DICTAMEN: VERDICT_LABEL[detail.dictamen] || detail.dictamen,
        OBSERVACIONES: detail.notes,
      });
    }

    return { rows: reportRows, truncated: rows.length >= 10000 };
  }
}
