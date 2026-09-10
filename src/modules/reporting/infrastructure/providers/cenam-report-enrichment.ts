import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildEquipmentSerialSlots,
  coalesceMaterialLote,
  type SerialPickRow,
} from '@/lib/sap/equipmentSerialSlots';
import type { ReportRow } from '../../domain/types/report.types';

const CHUNK = 200;
const VALUATION_ONLY = /^(valorado|novalorado|no\s*valorado|sin\s*valoraci[oó]n)$/i;
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SeriesOsRow = SerialPickRow & {
  service_order_id: string;
  brand_id: string | null;
  model_id: string | null;
};

type ModelMeta = { name: string; brandId: string | null };

async function fetchPaged<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const pageSize = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) throw new Error(error.message);
    const chunk = data || [];
    out.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return out;
}

async function loadSeriesByOsIds(
  supabase: SupabaseClient,
  osIds: string[],
): Promise<Map<string, SeriesOsRow[]>> {
  const byOs = new Map<string, SeriesOsRow[]>();
  const unique = [...new Set(osIds.filter(Boolean))];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const rows = await fetchPaged<{
      id: string;
      service_order_id: string | null;
      serial_number: string | null;
      s2: string | null;
      s3: string | null;
      s4: string | null;
      material: string | null;
      valuation: string | null;
      sap_status: string | null;
      created_at: string | null;
      brand_id: string | null;
      model_id: string | null;
    }>((from, to) =>
      supabase
        .from('series')
        .select(
          'id, service_order_id, serial_number, s2, s3, s4, material, valuation, sap_status, created_at, brand_id, model_id',
        )
        .in('service_order_id', chunk)
        .range(from, to),
    );
    for (const r of rows) {
      const osId = String(r.service_order_id || '');
      if (!osId) continue;
      const list = byOs.get(osId) || [];
      list.push({
        id: String(r.id),
        service_order_id: osId,
        serial_number: r.serial_number,
        s2: r.s2,
        s3: r.s3,
        s4: r.s4,
        material: r.material,
        valuation: r.valuation,
        sap_status: r.sap_status,
        created_at: r.created_at,
        brand_id: r.brand_id ? String(r.brand_id) : null,
        model_id: r.model_id ? String(r.model_id) : null,
      });
      byOs.set(osId, list);
    }
  }
  return byOs;
}

async function loadMainSerialByOs(
  supabase: SupabaseClient,
  osIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(osIds.filter(Boolean))];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const rows = await fetchPaged<{ id: string; main_serial: string | null }>((from, to) =>
      supabase.from('service_orders').select('id, main_serial').in('id', chunk).range(from, to),
    );
    for (const r of rows) {
      const ms = String(r.main_serial || '').trim();
      if (ms) map.set(String(r.id), ms);
    }
  }
  return map;
}

async function loadCatalogNameMaps(supabase: SupabaseClient): Promise<{
  diagnostics: Map<string, string>;
  repairs: Map<string, string>;
}> {
  const diags = await fetchPaged<{ id: string; name: string }>((from, to) =>
    supabase.from('cat_diagnostics').select('id, name').range(from, to),
  );
  const reps = await fetchPaged<{ id: string; name: string }>((from, to) =>
    supabase.from('cat_repairs').select('id, name').range(from, to),
  );
  return {
    diagnostics: new Map(
      diags.map((d) => [String(d.id), String(d.name || '').trim().toUpperCase()]),
    ),
    repairs: new Map(reps.map((r) => [String(r.id), String(r.name || '').trim().toUpperCase()])),
  };
}

function fieldLooksLikeUuidList(value: string): boolean {
  const parts = String(value || '')
    .split(/[,;|]/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((p) => UUID_LIKE.test(p));
}

function resolveCatalogField(
  raw: string,
  catalog: Map<string, string>,
): string {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (!fieldLooksLikeUuidList(text)) return text.toUpperCase();
  const names = text
    .split(/[,;|]/)
    .map((id) => catalog.get(id.trim()) || id.trim())
    .filter(Boolean);
  return [...new Set(names)].join(', ').toUpperCase();
}

async function loadModelMeta(supabase: SupabaseClient): Promise<Map<string, ModelMeta>> {
  const rows = await fetchPaged<{ id: string; name: string; brand_id: string | null }>((from, to) =>
    supabase.from('models').select('id, name, brand_id').range(from, to),
  );
  return new Map(
    rows.map((m) => [
      String(m.id),
      { name: String(m.name || '').trim().toUpperCase(), brandId: m.brand_id ? String(m.brand_id) : null },
    ]),
  );
}

function isValuationLabel(value: string): boolean {
  return VALUATION_ONLY.test(String(value || '').trim());
}

function resolveSapBriefText(modelName: string, fallback: string): string {
  const model = modelName.trim().toUpperCase();
  if (model) return model;
  const fb = String(fallback || '').trim().toUpperCase();
  if (fb && !isValuationLabel(fb)) return fb;
  return model || 'SIN DESCRIPCIÓN';
}

function applySerialSlots(
  row: ReportRow,
  slots: { s1: string; s2: string; s3: string; s4: string },
): ReportRow {
  return {
    ...row,
    S1: slots.s1.toUpperCase() || '---',
    S2: slots.s2.toUpperCase() || '---',
    S3: slots.s3.toUpperCase() || '---',
    S4: slots.s4.toUpperCase() || '---',
  };
}

function stripInternalKeys(row: ReportRow): ReportRow {
  const { _osId, _sort, _sortAt, ...rest } = row as ReportRow & {
    _osId?: string;
    _sort?: number;
    _sortAt?: number;
  };
  return rest;
}

export type CenamSnapshotPayload = {
  ingresos: ReportRow[];
  entregado: ReportRow[];
  irreparables: ReportRow[];
  matrix: ReportRow[];
};

/** Enriquece S1–S4 (SAP validado), material y texto breve en los 4 libros de detalle. */
export async function enrichCenamSnapshotPayload(
  supabase: SupabaseClient,
  payload: CenamSnapshotPayload,
): Promise<CenamSnapshotPayload> {
  const osIds = [
    ...new Set(
      [...payload.ingresos, ...payload.entregado, ...payload.irreparables]
        .map((r) => String(r._osId || ''))
        .filter(Boolean),
    ),
  ];

  if (osIds.length === 0) {
    return {
      ...payload,
      ingresos: payload.ingresos.map(stripInternalKeys),
      entregado: payload.entregado.map(stripInternalKeys),
      irreparables: payload.irreparables.map(stripInternalKeys),
    };
  }

  const [seriesByOs, mainSerialByOs, modelById, catalogs] = await Promise.all([
    loadSeriesByOsIds(supabase, osIds),
    loadMainSerialByOs(supabase, osIds),
    loadModelMeta(supabase),
    loadCatalogNameMaps(supabase),
  ]);

  const enrichOsRow = (row: ReportRow, osId: string): ReportRow => {
    const siblings = seriesByOs.get(osId) || [];
    if (siblings.length === 0) return stripInternalKeys(row);

    const slots = buildEquipmentSerialSlots(siblings, mainSerialByOs.get(osId));
    const { material } = coalesceMaterialLote(siblings);
    const primary = slots.primary;
    const model = primary.model_id ? modelById.get(primary.model_id) : null;
    const brief = resolveSapBriefText(
      model?.name || '',
      String(row['Texto breve de material'] || row['DESCRIPCIÓN SAP'] || row.MODELO || ''),
    );

    let enriched = applySerialSlots(row, slots);
    enriched = {
      ...enriched,
      MATERIAL: material || String(row.MATERIAL || row['Material SAP'] || '').trim(),
      'Material SAP': material || String(row['Material SAP'] || row.MATERIAL || '').trim(),
      'Texto breve de material': brief,
      'DESCRIPCIÓN SAP': brief,
      SN: (slots.s1 || String(row.SN || '')).toUpperCase() || 'SIN SERIE',
      'NO. DE SERIE': (slots.s1 || String(row['NO. DE SERIE'] || '')).toUpperCase() || 'SIN SERIE',
    };
    return stripInternalKeys(enriched);
  };

  const ingresos = payload.ingresos.map((row) =>
    enrichOsRow(row, String(row._osId || '')),
  );

  const entregado = payload.entregado.map((row) => {
    const enriched = enrichOsRow(row, String(row._osId || ''));
    return {
      ...enriched,
      DIAGNÓSTICO: resolveCatalogField(String(enriched.DIAGNÓSTICO || ''), catalogs.diagnostics),
      ACCIÓN: resolveCatalogField(String(enriched.ACCIÓN || ''), catalogs.repairs),
    };
  });

  const irreparables = payload.irreparables.map((row) => {
    const osId = String(row._osId || '');
    if (!osId) return stripInternalKeys(row);
    const siblings = seriesByOs.get(osId);
    if (!siblings?.length) return stripInternalKeys(row);
    const slots = buildEquipmentSerialSlots(siblings, mainSerialByOs.get(osId));
    return stripInternalKeys({
      ...applySerialSlots(row, slots),
      SN: slots.s1.toUpperCase() || String(row.SN || 'S/N'),
      CASN:
        [slots.s2, slots.s3, slots.s4].find((v) => v && v !== slots.s1)?.toUpperCase() ||
        String(row.CASN || '---'),
    });
  });

  return { ...payload, ingresos, entregado, irreparables };
}
