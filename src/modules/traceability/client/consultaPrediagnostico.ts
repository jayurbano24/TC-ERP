import type { SupabaseClient } from '@supabase/supabase-js';
import { buildPrediagnosticoDynamicCells } from '@/modules/reporting/infrastructure/providers/prediagnostico-export-catalog';
import {
  loadActivePrediagnosticoCatalogRows,
  loadModelItemProfilesMap,
} from '@/modules/backoffice/prediagnostico/loadPrediagnosticoMotorCatalog';
import { resolvePrediagnosticoMotorItems } from '@/modules/backoffice/prediagnostico/resolvePrediagnosticoMotorItems';
import { labelPrediagnosticoDictamen } from '@/shared/catalogs/prediagnosticoDictamenLabels';
import { displayPrediagnosticoObservaciones } from '@/modules/backoffice/prediagnostico/prediagnosticoBackfillMarkers';

const IN_CHUNK = 80;

export type ConsultaPrediagnosticoRow = {
  serviceOrderId: string;
  claseCarcasa: string;
  dictamen: string;
  dictamenLabel: string;
  observaciones: string;
  observacionesDisplay: string;
  operatorName: string;
  performedAt: string;
  checkCells: Record<string, string>;
};

function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') out[key] = entry;
  }
  return out;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function loadConsultaPrediagnosticoTrace(
  supabase: SupabaseClient,
  serviceOrderIds: string[]
): Promise<{ byOs: Record<string, ConsultaPrediagnosticoRow>; catalogItems: { name: string }[] }> {
  const uniqueIds = [...new Set(serviceOrderIds.filter(Boolean))];
  const byOs: Record<string, ConsultaPrediagnosticoRow> = {};

  const [catalogRows, modelItemProfiles] = await Promise.all([
    loadActivePrediagnosticoCatalogRows(supabase),
    loadModelItemProfilesMap(supabase),
  ]);

  for (const slice of chunkArray(uniqueIds, IN_CHUNK)) {
    const { data: osMeta, error: osErr } = await supabase
      .from('service_orders')
      .select('id, model_id, brand_id, models(technology_id)')
      .in('id', slice);
    if (osErr) throw new Error(osErr.message);

    const osContext = new Map<
      string,
      { modelId: string; brandId: string; techId: string }
    >();
    for (const row of osMeta || []) {
      const models = row.models as { technology_id?: string | null } | { technology_id?: string | null }[] | null;
      const model = Array.isArray(models) ? models[0] : models;
      osContext.set(String(row.id), {
        modelId: row.model_id ? String(row.model_id) : '',
        brandId: row.brand_id ? String(row.brand_id) : '',
        techId: model?.technology_id ? String(model.technology_id) : '',
      });
    }

    const { data, error } = await supabase
      .from('prediagnosticos')
      .select(
        'service_order_id, clase_carcasa, dictamen, observaciones, detalles_cosmeticos, funcionamiento, creado_por_nombre, actualizado_por_nombre, creado_en, actualizado_en'
      )
      .in('service_order_id', slice);
    if (error) {
      if (error.message.includes('prediagnosticos') && error.message.includes('does not exist')) {
        return { byOs, catalogItems };
      }
      throw new Error(error.message);
    }

    for (const row of data || []) {
      const osId = String(row.service_order_id);
      const cosmetics = asRecord(row.detalles_cosmeticos);
      const functionChecks = asRecord(row.funcionamiento);
      const ctx = osContext.get(osId) ?? { modelId: '', brandId: '', techId: '' };
      const motorItems = resolvePrediagnosticoMotorItems({
        catalogRows,
        modelItemProfiles,
        techId: ctx.techId,
        brandId: ctx.brandId,
        modelId: ctx.modelId,
      });
      const checkCells = buildPrediagnosticoDynamicCells({
        items: motorItems.map((item) => ({
          id: item.id,
          name: item.name,
          kind: item.kind,
          sortOrder: 0,
        })),
        functionChecks,
        cosmetics,
        claseCarcasa: String(row.clase_carcasa || ''),
      });
      const operatorName =
        String(row.actualizado_por_nombre || row.creado_por_nombre || '').trim() || '—';
      const performedAt = String(row.actualizado_en || row.creado_en || '');
      byOs[osId] = {
        serviceOrderId: osId,
        claseCarcasa: String(row.clase_carcasa || ''),
        dictamen: String(row.dictamen || ''),
        dictamenLabel: labelPrediagnosticoDictamen(String(row.dictamen || '')),
        observaciones: row.observaciones ? String(row.observaciones) : '',
        observacionesDisplay: displayPrediagnosticoObservaciones(row.observaciones),
        operatorName,
        performedAt,
        checkCells,
      };
    }
  }

  const catalogItems = catalogRows.map((row) => ({ name: row.name }));
  return { byOs, catalogItems };
}
