import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveProfileDisplayNames } from '@/shared/infrastructure/profiles/resolveProfileDisplayNames';
import {
  deduplicateSeriesHistory,
  type SeriesHistoryEntry,
} from '@/shared/infrastructure/audit/seriesHistoryDedup';

export type { SeriesHistoryEntry };
export { deduplicateSeriesHistory };

type SeriesCtxRow = {
  id: string;
  serial_number: string | null;
  s2: string | null;
  s3: string | null;
  s4: string | null;
  service_order_id: string | null;
  current_reception_id: string | null;
  sap_transfer_id: string | null;
  current_box_id: string | null;
};

function normalizeToken(raw: string): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function buildTokens(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const v of values) {
    const t = normalizeToken(v || '');
    if (t.length >= 4) out.push(t);
  }
  return [...new Set(out)];
}

function textMentions(text: string, tokens: string[]): boolean {
  if (!tokens.length) return false;
  const u = normalizeToken(text);
  return tokens.some((t) => u.includes(t));
}

/** Ruido de lote/recepción que no es movimiento de esta OS/serie. */
function isBatchNoise(action: string, payload: Record<string, unknown>): boolean {
  const comment =
    (typeof payload.observations === 'string' && payload.observations) ||
    (typeof payload.comment === 'string' && payload.comment) ||
    (typeof payload.notes === 'string' && payload.notes) ||
    '';
  const blob = `${action} ${comment} ${JSON.stringify(payload)}`.toUpperCase();
  if (blob.includes('LOTE CLASIFICADO')) return true;
  if (
    blob.includes('EQUIPMENT.BATCH') ||
    blob.includes('BATCH_CLASSIFIED') ||
    blob.includes('BATCH CLASSIFIED') ||
    blob.includes('CLASSIFY BATCH') ||
    blob.includes('CLASSIFY_BATCH')
  ) {
    return true;
  }
  if (/\bPHOTOS?:?\b/.test(blob)) return true;
  if (action.trim().toUpperCase() === 'STATUS' && blob.includes('RECIBIDO_BACKOFFICE')) {
    return true;
  }
  if (/MOVIDO A BODEGA:\s*(TEL[EÉ]FONO|ACCESORIO)/i.test(blob)) return true;
  return false;
}

function payloadInScope(
  payload: Record<string, unknown>,
  scope: {
    seriesIdSet: Set<string>;
    serviceOrderIds: Set<string>;
    sapTransferIds: Set<string>;
    sapDocs: string[];
    serials: string[];
  }
): boolean {
  const so = payload.service_order_id;
  if (typeof so === 'string' && scope.serviceOrderIds.has(so)) return true;
  const sapId = payload.sap_transfer_id;
  if (typeof sapId === 'string' && scope.sapTransferIds.has(sapId)) return true;

  const sapDoc =
    (typeof payload.sap_document_number === 'string' && payload.sap_document_number) ||
    (typeof payload.document_number === 'string' && payload.document_number) ||
    '';
  if (sapDoc && textMentions(sapDoc, scope.sapDocs)) return true;

  for (const key of ['main_serial', 'serial_number', 'serial', 's1', 's2'] as const) {
    const v = payload[key];
    if (typeof v === 'string' && scope.serials.includes(normalizeToken(v))) return true;
  }
  if (Array.isArray(payload.serial_numbers)) {
    for (const s of payload.serial_numbers) {
      if (typeof s === 'string' && scope.serials.includes(normalizeToken(s))) return true;
    }
  }
  if (Array.isArray(payload.series_ids)) {
    for (const id of payload.series_ids) {
      if (typeof id === 'string' && scope.seriesIdSet.has(id)) return true;
    }
  }
  return false;
}

function mapAuditRow(
  d: {
    id: string;
    action: string;
    created_at: string;
    new_values: unknown;
    user_id: string | null;
    observations?: string | null;
  },
  profiles: Record<string, string>
): SeriesHistoryEntry {
  const payload = {
    ...((d.new_values || {}) as Record<string, unknown>),
  };
  if (d.observations && !payload.observations) {
    payload.observations = d.observations;
  }
  const payloadName =
    typeof payload.operator_name === 'string'
      ? payload.operator_name.trim()
      : typeof payload.registered_by === 'string'
        ? payload.registered_by.trim()
        : typeof payload.classified_by === 'string'
          ? payload.classified_by.trim()
          : '';
  const userId = d.user_id;
  const resolvedName = (userId && profiles[userId]) || payloadName || '';

  return {
    id: d.id,
    action: d.action,
    changed_at: d.created_at,
    payload,
    changed_by: userId,
    profiles: resolvedName
      ? { full_name: resolvedName }
      : userId
        ? { full_name: 'SISTEMA' }
        : null,
  };
}

/**
 * Historial de operaciones de un equipo: series + OS + SAP + caja + bodega.
 * Filtra ruido de lotes de recepción ajenos a esta OS/serie.
 */
export async function querySeriesHistory(
  supabase: SupabaseClient,
  recordIds: string[]
): Promise<SeriesHistoryEntry[]> {
  const seedIds = [...new Set(recordIds.map((id) => String(id).trim()).filter(Boolean))];
  if (seedIds.length === 0) return [];

  const { data: seedSeries, error: seedErr } = await supabase
    .from('series')
    .select(
      'id, serial_number, s2, s3, s4, service_order_id, current_reception_id, sap_transfer_id, current_box_id'
    )
    .in('id', seedIds);
  if (seedErr) throw seedErr;

  const seriesRows: SeriesCtxRow[] = (seedSeries || []) as SeriesCtxRow[];
  const serviceOrderIds = [
    ...new Set(seriesRows.map((s) => s.service_order_id).filter(Boolean) as string[]),
  ];

  // Hermanas del mismo OS (S1–S4) para no perder RECEPCIÓN/INGRESO en otra serie.
  if (serviceOrderIds.length > 0) {
    const { data: siblings } = await supabase
      .from('series')
      .select(
        'id, serial_number, s2, s3, s4, service_order_id, current_reception_id, sap_transfer_id, current_box_id'
      )
      .in('service_order_id', serviceOrderIds)
      .limit(40);
    const byId = new Map(seriesRows.map((s) => [s.id, s]));
    for (const s of (siblings || []) as SeriesCtxRow[]) byId.set(s.id, s);
    seriesRows.length = 0;
    seriesRows.push(...byId.values());
  }

  const seriesIdSet = new Set(seriesRows.map((s) => s.id));
  if (seriesIdSet.size === 0) {
    // Fallback: IDs pedidos sin fila series (comportamiento previo).
    for (const id of seedIds) seriesIdSet.add(id);
  }

  const sapTransferIds = new Set<string>();
  const boxIds = new Set<string>();
  const serials: string[] = [];
  for (const s of seriesRows) {
    if (s.sap_transfer_id) sapTransferIds.add(s.sap_transfer_id);
    if (s.current_box_id) boxIds.add(s.current_box_id);
    for (const sn of [s.serial_number, s.s2, s.s3, s.s4]) {
      if (sn) serials.push(normalizeToken(sn));
    }
  }

  let osLabels: string[] = [];
  let sapDocs: string[] = [];
  if (serviceOrderIds.length > 0) {
    const { data: sos } = await supabase
      .from('service_orders')
      .select('id, os_label, sap_transfer_id, reception_id')
      .in('id', serviceOrderIds);
    for (const so of sos || []) {
      if (so.os_label) osLabels.push(String(so.os_label));
      if (so.sap_transfer_id) sapTransferIds.add(String(so.sap_transfer_id));
    }

    const { data: tray } = await supabase
      .from('cac_tray_units')
      .select('service_order_id, sap_document_number, guide_number')
      .in('service_order_id', serviceOrderIds);
    for (const t of tray || []) {
      if (t.sap_document_number) sapDocs.push(String(t.sap_document_number));
      if (t.guide_number) sapDocs.push(String(t.guide_number));
    }
  }

  if (sapTransferIds.size > 0) {
    const { data: docs } = await supabase
      .from('sap_transfer_documents')
      .select('id, sap_document_number')
      .in('id', [...sapTransferIds]);
    for (const d of docs || []) {
      if (d.sap_document_number) sapDocs.push(String(d.sap_document_number));
    }
  }

  const sapDocTokens = buildTokens(sapDocs);
  const scopeTokens = buildTokens([...serials, ...osLabels, ...sapDocs, ...serviceOrderIds]);

  // IDs amarrados al equipo (no reception_id completo → evita ruido de lote).
  const auditRecordIds = new Set<string>([...seriesIdSet]);
  for (const id of serviceOrderIds) auditRecordIds.add(id);
  for (const id of sapTransferIds) auditRecordIds.add(id);
  for (const id of boxIds) auditRecordIds.add(id);
  for (const g of sapDocs) if (g) auditRecordIds.add(g);

  const idList = [...auditRecordIds];
  const auditChunks: Array<{
    id: string;
    action: string;
    created_at: string;
    new_values: unknown;
    user_id: string | null;
    observations?: string | null;
    record_id?: string | null;
  }>[] = [];

  // PostgREST .in() soporta bien lotes moderados; partimos por si acaso.
  for (let i = 0; i < idList.length; i += 80) {
    const chunk = idList.slice(i, i + 80);
    const { data, error } = await supabase
      .from('erp_audit_logs')
      .select('id, action, created_at, new_values, user_id, observations, record_id')
      .in('record_id', chunk)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    auditChunks.push(data || []);
  }

  // Eventos con sap_transfer_id en payload (aunque record_id sea otro).
  for (const sapId of sapTransferIds) {
    const { data } = await supabase
      .from('erp_audit_logs')
      .select('id, action, created_at, new_values, user_id, observations, record_id')
      .filter('new_values->>sap_transfer_id', 'eq', sapId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (data?.length) auditChunks.push(data);
  }

  const auditById = new Map<string, (typeof auditChunks)[0][number]>();
  for (const chunk of auditChunks) {
    for (const row of chunk) auditById.set(row.id, row);
  }

  const warehouseRows: Array<{
    id: string;
    created_at: string;
    movement_type: string | null;
    box_id: string | null;
    series_ids: string[] | null;
    performed_by: string | null;
    performed_by_name: string | null;
    notes: string | null;
  }> = [];

  if (boxIds.size > 0) {
    const { data } = await supabase
      .from('warehouse_movements')
      .select(
        'id, created_at, movement_type, box_id, series_ids, performed_by, performed_by_name, notes'
      )
      .in('box_id', [...boxIds])
      .order('created_at', { ascending: false })
      .limit(80);
    warehouseRows.push(...(data || []));
  }
  if (seriesIdSet.size > 0) {
    const { data } = await supabase
      .from('warehouse_movements')
      .select(
        'id, created_at, movement_type, box_id, series_ids, performed_by, performed_by_name, notes'
      )
      .overlaps('series_ids', [...seriesIdSet])
      .order('created_at', { ascending: false })
      .limit(80);
    warehouseRows.push(...(data || []));
  }

  const boxCodeById = new Map<string, string>();
  if (boxIds.size > 0) {
    const { data: boxes } = await supabase
      .from('boxes')
      .select('id, box_code')
      .in('id', [...boxIds]);
    for (const b of boxes || []) {
      if (b.box_code) boxCodeById.set(String(b.id), String(b.box_code));
    }
  }

  const userIds = [
    ...[...auditById.values()].map((r) => r.user_id),
    ...warehouseRows.map((r) => r.performed_by),
  ].filter(Boolean) as string[];
  const profiles = await resolveProfileDisplayNames([...new Set(userIds)]);

  const scope = {
    seriesIdSet,
    serviceOrderIds: new Set(serviceOrderIds),
    sapTransferIds,
    sapDocs: sapDocTokens,
    serials: [...new Set(serials)],
  };

  const entries: SeriesHistoryEntry[] = [];

  for (const row of auditById.values()) {
    const payload = (row.new_values || {}) as Record<string, unknown>;
    const recordId = row.record_id ? String(row.record_id) : '';
    const alreadyScoped =
      seriesIdSet.has(recordId) ||
      scope.serviceOrderIds.has(recordId) ||
      sapTransferIds.has(recordId) ||
      boxIds.has(recordId);

    if (isBatchNoise(row.action, payload)) continue;

    if (!alreadyScoped) {
      const blob = `${row.action} ${row.observations || ''} ${JSON.stringify(payload)}`;
      const ok =
        textMentions(blob, scopeTokens) ||
        payloadInScope(payload, scope) ||
        (blob.toUpperCase().includes('DOCUMENTO SAP') && textMentions(blob, sapDocTokens));
      if (!ok) continue;
    }

    entries.push(mapAuditRow(row, profiles));
  }

  const whById = new Map<string, (typeof warehouseRows)[0]>();
  for (const mov of warehouseRows) whById.set(mov.id, mov);

  for (const mov of whById.values()) {
    const movSeries = Array.isArray(mov.series_ids) ? mov.series_ids : [];
    const hasOverlap = movSeries.some((id) => seriesIdSet.has(id));
    const isCurrentBox = Boolean(mov.box_id && boxIds.has(mov.box_id));
    if (!hasOverlap && !(isCurrentBox && movSeries.length === 0)) continue;

    const type = String(mov.movement_type || 'MOVIMIENTO').toUpperCase();
    const boxCode = mov.box_id ? boxCodeById.get(mov.box_id) : null;
    let action = type;
    let status = type;
    let notes = (mov.notes || '').trim();
    if (type === 'INGRESO') {
      action = 'INGRESO BODEGA';
      status = 'in_central_warehouse';
      notes = notes || (boxCode ? `Ingreso a Bodega General · ${boxCode}` : 'Ingreso a Bodega General');
    } else if (type === 'TRASLADO' || type === 'DISPERSION_CAJA') {
      action = 'TRASLADO CAJA';
      notes = notes || 'Traslado / dispersión de caja';
    } else if (type === 'SALIDA') {
      action = 'SALIDA BODEGA';
      status = 'dispatched';
      notes = notes || 'Salida de bodega';
    }

    const actorName =
      (mov.performed_by_name && String(mov.performed_by_name).trim()) ||
      (mov.performed_by && profiles[mov.performed_by]) ||
      'SISTEMA';

    entries.push({
      id: `warehouse-${mov.id}`,
      action,
      changed_at: mov.created_at,
      payload: {
        status,
        box: boxCode || mov.box_id,
        notes,
        source: 'warehouse_movements',
        operator_name: actorName,
      },
      changed_by: mov.performed_by,
      profiles: { full_name: actorName },
    });
  }

  entries.sort(
    (a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()
  );

  return deduplicateSeriesHistory(entries, {
    multiSeries: seriesIdSet.size > 1 || seedIds.length > 1,
  });
}
