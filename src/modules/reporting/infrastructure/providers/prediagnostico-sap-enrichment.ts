import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveSkuMaterialSap } from './prediagnostico-contract-report';

const IN_CHUNK = 80;

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export const PREDIAGNOSTICO_SAP_TRASLADO_COLUMN = 'Número de traslado SAP';

type SapTransferDoc = { sap_document_number?: string | null } | null | undefined;

/** Documento SAP / traslado (prioridad: traslado de la serie → OS → recepción). */
export function resolveNumeroTrasladoSap(input: {
  unitSapTransfer?: SapTransferDoc;
  osSapTransfer?: SapTransferDoc;
  receptionSapDocument?: string | null;
}): string {
  const fromUnit = String(input.unitSapTransfer?.sap_document_number ?? '').trim();
  if (fromUnit) return fromUnit;
  const fromOs = String(input.osSapTransfer?.sap_document_number ?? '').trim();
  if (fromOs) return fromOs;
  return String(input.receptionSapDocument ?? '').trim();
}

/** SKU = material SAP en series; si falta, última validación G985 por OS o serie. */
export function resolvePrediagnosticoSku(input: {
  unitMaterial?: string | null;
  siblings: Array<{ material?: string | null; valuation?: string | null }>;
  serviceOrderId: string;
  serial: string;
  sapMaterialByOs: Map<string, string>;
  sapMaterialBySerial: Map<string, string>;
}): string {
  const fromSeries = resolveSkuMaterialSap(input.unitMaterial, input.siblings);
  if (fromSeries) return fromSeries;
  const fromOs = input.sapMaterialByOs.get(input.serviceOrderId);
  if (fromOs) return fromOs;
  const serialKey = input.serial.trim().toUpperCase();
  if (serialKey) {
    const hit = input.sapMaterialBySerial.get(serialKey);
    if (hit) return hit;
  }
  return '';
}

/** Material SAP desde `sap_validation_details` (coincidencia G985). */
export async function loadSapMaterialMaps(
  supabase: SupabaseClient,
  serviceOrderIds: string[],
  serials: string[]
): Promise<{ byOs: Map<string, string>; bySerial: Map<string, string> }> {
  const byOs = new Map<string, string>();
  const bySerial = new Map<string, string>();

  const uniqueOs = [...new Set(serviceOrderIds.filter(Boolean))];
  for (const slice of chunkArray(uniqueOs, IN_CHUNK)) {
    const { data, error } = await supabase
      .from('sap_validation_details')
      .select('equipo_id, serie, material, created_at')
      .in('equipo_id', slice)
      .eq('coincidencia', true)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      const osId = String(row.equipo_id);
      const mat = String(row.material ?? '').trim();
      if (mat && !byOs.has(osId)) byOs.set(osId, mat);
      const serialKey = String(row.serie ?? '').trim().toUpperCase();
      if (serialKey && mat && !bySerial.has(serialKey)) bySerial.set(serialKey, mat);
    }
  }

  const uniqueSerials = [...new Set(serials.map((s) => s.trim()).filter(Boolean))];
  for (const slice of chunkArray(uniqueSerials, IN_CHUNK)) {
    const { data, error } = await supabase
      .from('sap_validation_details')
      .select('serie, material, created_at')
      .in('serie', slice)
      .eq('coincidencia', true)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      const serialKey = String(row.serie ?? '').trim().toUpperCase();
      const mat = String(row.material ?? '').trim();
      if (serialKey && mat && !bySerial.has(serialKey)) bySerial.set(serialKey, mat);
    }
  }

  return { byOs, bySerial };
}
