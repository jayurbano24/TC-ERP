import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClassifyBatchParams, ClassifyBatchResult } from '../../domain/types/equipment-unit.types';

const OPEN_ORDER_STATUSES = new Set([
  'INGRESADO',
  'EN_PROCESO',
  'EN_REPARACION',
  'EN_DIAGNOSTICO',
  'PENDIENTE',
  'RECEPCIONADO',
]);

export function isClassifyLockTimeout(message: string, rpcCode?: string | null): boolean {
  if (rpcCode === '55P03') return true;
  const text = String(message || '');
  return /lock timeout|55P03|lock_not_available|canceling statement due to lock timeout/i.test(text);
}

export function isClassifyRpcTimeout(message: string, rpcCode?: string | null): boolean {
  if (isClassifyLockTimeout(message, rpcCode)) return false;
  if (rpcCode === '57014') return true;
  const text = String(message || '').trim();
  if (!text) return false;
  if (/tard[oó] demasiado/i.test(text)) return true;
  return /upstream request timeout|request timeout|timed out|timeout|57014/i.test(text);
}

type ServiceOrderRow = {
  id: string;
  main_serial: string | null;
  status: string | null;
  reception_id: string | null;
  sap_transfer_id: string | null;
};

/** Consulta OS abierta ya creada para el mismo contexto recepción/SAP/S1 (ghost success). */
export async function findReconciledOpenServiceOrder(
  supabase: SupabaseClient,
  params: Pick<ClassifyBatchParams, 'receptionId' | 'sapTransferId'> & { mainSerial: string },
): Promise<ServiceOrderRow | null> {
  const mainKey = params.mainSerial.trim().toUpperCase();
  if (!mainKey) return null;

  const { data, error } = await supabase
    .from('service_orders')
    .select('id, main_serial, status, reception_id, sap_transfer_id')
    .eq('reception_id', params.receptionId)
    .eq('sap_transfer_id', params.sapTransferId)
    .eq('main_serial', mainKey)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as ServiceOrderRow;
  const status = String(row.status || '').toUpperCase();
  if (!OPEN_ORDER_STATUSES.has(status) && status !== '') {
    return null;
  }
  return row;
}

export function reconciledClassifyResult(order: ServiceOrderRow): ClassifyBatchResult {
  return {
    data: [order],
    unitsProcessed: 1,
    unitsSkipped: 0,
  };
}

export const CLASSIFY_TIMEOUT_SAFE_MESSAGE =
  'El servidor tardó demasiado en guardar los equipos. Espere un momento y pulse Finalizar de nuevo; si persiste, avise a soporte (Logs Supabase · classify).';
