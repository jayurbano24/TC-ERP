import { getSupabaseServerClient } from '@/lib/supabase/server';
import { isPrediagnosticoBackfillNotes } from '@/modules/backoffice/prediagnostico/prediagnosticoBackfillMarkers';
import type { ReportFilterParams, ReportRow } from '../../domain/types/report.types';
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
  sap_transfer_id: string | null;
  created_at: string | null;
};

function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') out[key] = entry;
  }
  return out;
}

/** Exportación completa desde `prediagnosticos` (no limitada a bandeja CAC activa). */
export async function fetchPrediagnosticoReportAllData(
  filters: ReportFilterParams,
  items: PrediagnosticoCheckItem[],
  catalogs: {
    techMap: Map<string, string>;
    brandMap: Map<string, string>;
    modelMap: Map<string, { name: string; technology_id: string | null }>;
  }
): Promise<{ rows: ReportRow[]; truncated: boolean }> {
  const supabase = getSupabaseServerClient();
  const reportRows: ReportRow[] = [];
  let truncated = false;

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
      const { data, error: osErr } = await supabase
        .from('service_orders')
        .select('id, os_label, brand_id, model_id, main_serial, sap_transfer_id, created_at')
        .in('id', slice);
      if (osErr) throw new Error(osErr.message);
      osRows.push(...((data || []) as OsRow[]));
    }
    const osById = new Map(osRows.map((row) => [String(row.id), row]));

    const sapIds = [...new Set(osRows.map((r) => r.sap_transfer_id).filter(Boolean))] as string[];
    const sapById = new Map<string, string>();
    for (const slice of chunkArray(sapIds, IN_CHUNK)) {
      if (slice.length === 0) continue;
      const { data: sapRows, error: sapErr } = await supabase
        .from('sap_transfer_documents')
        .select('id, sap_document_number')
        .in('id', slice);
      if (sapErr) throw new Error(sapErr.message);
      for (const s of sapRows || []) {
        sapById.set(
          String((s as { id: string }).id),
          String((s as { sap_document_number?: string }).sap_document_number || '')
        );
      }
    }

    const seriesRows: { service_order_id: string; serial_number?: string; created_at?: string }[] = [];
    for (const slice of chunkArray(osIds, IN_CHUNK)) {
      const { data, error: seriesErr } = await supabase
        .from('series')
        .select('service_order_id, serial_number, created_at')
        .in('service_order_id', slice)
        .not('brand_id', 'is', null);
      if (seriesErr) throw new Error(seriesErr.message);
      seriesRows.push(...((data || []) as typeof seriesRows));
    }

    const serialsByOs = new Map<string, string[]>();
    for (const osId of osIds) {
      const os = osById.get(osId);
      const main = (os?.main_serial || '').trim().toUpperCase();
      const list = (seriesRows || [])
        .filter((s) => String((s as { service_order_id: string }).service_order_id) === osId)
        .map((s) => String((s as { serial_number?: string }).serial_number || '').trim())
        .filter(Boolean);
      list.sort((a, b) => {
        const aMain = a.toUpperCase() === main ? 0 : 1;
        const bMain = b.toUpperCase() === main ? 0 : 1;
        return aMain - bMain || a.localeCompare(b);
      });
      serialsByOs.set(osId, list);
    }

    for (const row of chunk) {
      const notes = row.observaciones ? String(row.observaciones) : '';
      if (filters.excludeBackfill && isPrediagnosticoBackfillNotes(notes)) continue;

      const os = osById.get(row.service_order_id);
      if (!os) continue;

      if (filters.techId || filters.brandId || filters.modelId) {
        const model = os.model_id ? catalogs.modelMap.get(os.model_id) : undefined;
        if (filters.modelId && os.model_id !== filters.modelId) continue;
        if (filters.brandId && os.brand_id !== filters.brandId) continue;
        if (filters.techId && model?.technology_id !== filters.techId) continue;
      }

      const model = os.model_id ? catalogs.modelMap.get(os.model_id) : undefined;
      const marca = os.brand_id ? catalogs.brandMap.get(os.brand_id) || '' : '';
      const modelo = model?.name || '';
      const tecnologia = model?.technology_id ? catalogs.techMap.get(model.technology_id) || '' : '';
      const descripcion = [tecnologia, marca, modelo].filter(Boolean).join(' ').toUpperCase();
      const feDate = new Date(row.creado_en || os.created_at || '');
      const fe = Number.isNaN(feDate.getTime()) ? '' : feDate.toLocaleDateString('es-GT');
      const serials = serialsByOs.get(row.service_order_id) || [];
      const sap =
        (os.sap_transfer_id && sapById.get(os.sap_transfer_id)) || '';

      const cosmetics = asRecord(row.detalles_cosmeticos);
      const functionChecks = asRecord(row.funcionamiento);

      reportRows.push({
        OS: os.os_label || '',
        FE: fe,
        S1: serials[0] || '',
        S2: serials[1] || '',
        'DESCRIPCIÓN SAP': descripcion,
        MARCA: marca.toUpperCase(),
        MODELO: (modelo || descripcion).toUpperCase(),
        TECNOLOGÍA: tecnologia.toUpperCase(),
        TRATAMIENTO: 'RIP',
        'CANAL DE RECUPERACIÓN': 'CAC',
        DIAGNÓSTICO: formatPrediagnosticoDiagnostico(functionChecks, items),
        ACCIÓN: formatPrediagnosticoAccion(cosmetics, items),
        SAP: sap,
        CLASE: row.clase_carcasa,
        DICTAMEN: VERDICT_LABEL[row.dictamen] || row.dictamen,
        OBSERVACIONES: notes,
      });
    }

    if (chunk.length < PAGE) break;
    const maxRows = filters.allData ? 250_000 : 50_000;
    if (offset + chunk.length >= maxRows) {
      truncated = true;
      break;
    }
  }

  return { rows: reportRows, truncated };
}
