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

export function isClassifyIdentityMismatch(message: string): boolean {
  return /identidad S1-S4|contexto recepci[oÃ³]n\/SAP|EQUIPMENT_IDENTITY_MISMATCH/i.test(
    String(message || ''),
  );
}

function normalizedSet(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toUpperCase()).filter(Boolean))].sort();
}

export function isEquivalentReconciledOrder(params: {
  targetSapDocument: string;
  expectedSeries: string[];
  candidateSapDocument: string;
  candidateSeries: string[];
}): boolean {
  if (params.targetSapDocument.trim().toUpperCase() !== params.candidateSapDocument.trim().toUpperCase()) {
    return false;
  }
  const expected = normalizedSet(params.expectedSeries);
  const candidate = normalizedSet(params.candidateSeries);
  return expected.length > 0 && expected.length === candidate.length && expected.every((sn, i) => sn === candidate[i]);
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
  params: Pick<ClassifyBatchParams, 'receptionId' | 'sapTransferId'> & {
    mainSerial: string;
    allSeries?: string[];
  },
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

  if (!error && data) {
    const row = data as ServiceOrderRow;
    const status = String(row.status || '').toUpperCase();
    if (OPEN_ORDER_STATUSES.has(status) || status === '') {
      return row;
    }
  }

  if (!params.allSeries?.length) return null;

  const { data: targetTransfer, error: targetError } = await supabase
    .from('sap_transfer_documents')
    .select('sap_document_number')
    .eq('id', params.sapTransferId)
    .maybeSingle();
  if (targetError || !targetTransfer?.sap_document_number) return null;

  const { data: candidates, error: candidatesError } = await supabase
    .from('service_orders')
    .select('id, main_serial, status, reception_id, sap_transfer_id')
    .eq('reception_id', params.receptionId)
    .eq('main_serial', mainKey)
    .limit(10);
  if (candidatesError || !candidates?.length) return null;

  const openCandidates = (candidates as ServiceOrderRow[]).filter((candidate) => {
    const status = String(candidate.status || '').toUpperCase();
    return OPEN_ORDER_STATUSES.has(status) || status === '';
  });
  const candidateOrderIds = openCandidates.map((candidate) => candidate.id);
  const candidateTransferIds = [...new Set(openCandidates.map((candidate) => candidate.sap_transfer_id).filter(Boolean))] as string[];
  if (!candidateOrderIds.length || !candidateTransferIds.length) return null;

  const [{ data: transfers, error: transfersError }, { data: series, error: seriesError }] = await Promise.all([
    supabase.from('sap_transfer_documents').select('id, sap_document_number').in('id', candidateTransferIds),
    supabase.from('series').select('service_order_id, serial_number').in('service_order_id', candidateOrderIds),
  ]);
  if (transfersError || seriesError) return null;

  const documentByTransfer = new Map(
    (transfers ?? []).map((transfer) => [String(transfer.id), String(transfer.sap_document_number || '')]),
  );
  for (const candidate of openCandidates) {
    const candidateSeries = (series ?? [])
      .filter((row) => row.service_order_id === candidate.id)
      .map((row) => String(row.serial_number || ''));
    if (isEquivalentReconciledOrder({
      targetSapDocument: String(targetTransfer.sap_document_number),
      expectedSeries: params.allSeries,
      candidateSapDocument: documentByTransfer.get(String(candidate.sap_transfer_id)) ?? '',
      candidateSeries,
    })) {
      return candidate;
    }
  }
  return null;
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
