import type { SupabaseClient } from '@supabase/supabase-js';
import { BRAND_SELECT, MODEL_SELECT, TECHNOLOGY_SELECT } from '@/shared/constants/dbProjections';

export type WarehouseBoxListRow = {
  box_id: string;
  rack?: string | null;
  label?: string | null;
  series_count?: number;
  equipos_count?: number | null;
  capacity?: number | null;
  sample_status?: string | null;
  sample_brand_id?: string | null;
  sample_model_id?: string | null;
  sample_service_order_id?: string | null;
  last_movement_at?: string | null;
};

export type EnrichedWarehouseBoxRow = WarehouseBoxListRow & {
  capacity?: number | null;
  equipos_count?: number | null;
  deletion_status?: string | null;
  assigned_operator_id?: string | null;
  ingreso_user_name?: string | null;
  created_at?: string | null;
  brand_name?: string | null;
  model_name?: string | null;
  tech_name?: string | null;
  technology_id?: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function fetchMapById(
  supabase: SupabaseClient,
  table: string,
  ids: string[],
  cols: string
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  if (ids.length === 0) return map;

  const chunkSize = 80;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase.from(table).select(cols).in('id', chunk);
    if (error) {
      console.error(`[warehouse] batch ${table}:`, error.message);
      continue;
    }
    for (const row of data ?? []) {
      map.set(String((row as { id: string }).id), row as Record<string, unknown>);
    }
  }
  return map;
}

/** Nombres genéricos de backfill / automatismos — no son operador real. */
function isGenericActorName(name?: string | null): boolean {
  const n = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!n) return true;
  if (n === 'sistema' || n === 'operador' || n === 'operador_sistema' || n === 'n/a' || n === '---') {
    return true;
  }
  if (n.includes('backfill')) return true;
  if (n.startsWith('sistema (')) return true;
  if (n.startsWith('sistema —') || n.startsWith('sistema -')) return true;
  if (UUID_RE.test(n)) return true;
  return false;
}

function displayPersonName(fullName?: string | null, email?: string | null): string | null {
  const name = (fullName || '').trim();
  const mail = (email || '').trim();
  if (name && !name.includes('@') && !isGenericActorName(name)) return name;
  if (mail && !isGenericActorName(mail.split('@')[0])) return mail.split('@')[0] || mail;
  if (name && name.includes('@') && !isGenericActorName(name.split('@')[0])) {
    return name.split('@')[0] || name;
  }
  return null;
}

function parseRecibidoPorFromNotes(notes?: string | null): string | null {
  if (!notes) return null;
  const normalized = String(notes).replace(/\\n/g, '\n');
  const m = normalized.match(/Recibido Por:\s*([^\n]+)/i);
  return displayPersonName(m?.[1]?.trim() || null, null);
}

type MovementActor = { name: string | null; userId: string | null };

/**
 * Mejor actor por caja desde warehouse_movements.
 * Prefiere INGRESO con usuario real; si solo hay backfill "Sistema (...)", busca otro movimiento.
 */
async function fetchBestMovementActorByBox(
  supabase: SupabaseClient,
  boxIds: string[]
): Promise<Map<string, MovementActor>> {
  const map = new Map<string, MovementActor>();
  if (boxIds.length === 0) return map;

  const chunkSize = 40;
  for (let i = 0; i < boxIds.length; i += chunkSize) {
    const chunk = boxIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('warehouse_movements')
      .select('box_id, performed_by, performed_by_name, created_at, movement_type')
      .in('box_id', chunk)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[warehouse] movements actor:', error.message);
      continue;
    }

    type MovRow = {
      box_id: string;
      performed_by?: string | null;
      performed_by_name?: string | null;
      movement_type?: string | null;
    };

    const byBox = new Map<string, MovRow[]>();
    for (const row of (data ?? []) as MovRow[]) {
      const boxId = String(row.box_id);
      const list = byBox.get(boxId) || [];
      list.push(row);
      byBox.set(boxId, list);
    }

    for (const [boxId, rows] of byBox) {
      const score = (row: MovRow): number => {
        const rawName = String(row.performed_by_name || '').trim();
        const generic = isGenericActorName(rawName);
        const hasUser = Boolean(row.performed_by);
        const isIngreso = String(row.movement_type || '').toUpperCase() === 'INGRESO';
        let s = 0;
        if (hasUser && !generic) s += 40;
        else if (hasUser) s += 20;
        else if (!generic && rawName) s += 15;
        if (isIngreso) s += 5;
        return s;
      };

      let best: MovRow | null = null;
      let bestScore = 0;
      for (const row of rows) {
        const s = score(row);
        if (s > bestScore) {
          bestScore = s;
          best = row;
        }
      }

      if (!best || bestScore <= 0) continue;

      const rawName = String(best.performed_by_name || '').trim();
      map.set(boxId, {
        name: isGenericActorName(rawName) ? null : rawName,
        userId: best.performed_by ?? null,
      });
    }
  }
  return map;
}

/**
 * Misma fuente que Consulta/Bitácora: erp_audit_logs action = INGRESO BODEGA.
 * Ahí está el técnico real cuando warehouse_movements solo tiene backfill "Sistema".
 */
async function fetchIngresoAuditActorByBox(
  supabase: SupabaseClient,
  boxIds: string[]
): Promise<Map<string, MovementActor>> {
  const map = new Map<string, MovementActor>();
  if (boxIds.length === 0) return map;

  const seriesToBox = new Map<string, string>();
  const perBoxCount = new Map<string, number>();
  const chunkSize = 40;

  for (let i = 0; i < boxIds.length; i += chunkSize) {
    const chunk = boxIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('series')
      .select('id, current_box_id, created_at')
      .in('current_box_id', chunk)
      .order('created_at', { ascending: true })
      .limit(Math.min(chunk.length * 4, 400));

    if (error) {
      console.error('[warehouse] series for audit actor:', error.message);
      continue;
    }

    for (const row of data ?? []) {
      const seriesId = String((row as { id: string }).id);
      const boxId = String((row as { current_box_id: string }).current_box_id);
      const n = perBoxCount.get(boxId) || 0;
      if (n >= 2) continue;
      seriesToBox.set(seriesId, boxId);
      perBoxCount.set(boxId, n + 1);
    }
  }

  const recordIds = [...new Set([...seriesToBox.keys(), ...boxIds])];
  if (recordIds.length === 0) return map;

  for (let i = 0; i < recordIds.length; i += 80) {
    const chunk = recordIds.slice(i, i + 80);
    const { data, error } = await supabase
      .from('erp_audit_logs')
      .select('record_id, user_id, action, created_at')
      .eq('action', 'INGRESO BODEGA')
      .in('record_id', chunk)
      .order('created_at', { ascending: true })
      .limit(400);

    if (error) {
      console.error('[warehouse] audit ingreso actor:', error.message);
      continue;
    }

    for (const row of data ?? []) {
      const recordId = String((row as { record_id: string }).record_id);
      const userId = (row as { user_id?: string | null }).user_id ?? null;
      if (!userId) continue;
      const boxId = seriesToBox.get(recordId) || (boxIds.includes(recordId) ? recordId : null);
      if (!boxId || map.has(boxId)) continue;
      map.set(boxId, { name: null, userId });
    }
  }

  return map;
}

/** Enriquece filas de warehouse_list_boxes_page con nombres y metadatos de caja. */
export async function enrichWarehouseBoxItems(
  supabase: SupabaseClient,
  items: WarehouseBoxListRow[]
): Promise<EnrichedWarehouseBoxRow[]> {
  if (items.length === 0) return [];

  const boxIds = [...new Set(items.map((i) => i.box_id).filter(Boolean))];
  const brandIds = [...new Set(items.map((i) => i.sample_brand_id).filter(Boolean) as string[])];
  const modelIds = [...new Set(items.map((i) => i.sample_model_id).filter(Boolean) as string[])];

  const [boxMetaMap, brandMap, modelMap, movementByBox, auditByBox] = await Promise.all([
    fetchMapById(
      supabase,
      'boxes',
      boxIds,
      'id, capacity, created_at, deletion_status, assigned_operator_id, reception_id'
    ),
    fetchMapById(supabase, 'brands', brandIds, BRAND_SELECT),
    fetchMapById(supabase, 'models', modelIds, MODEL_SELECT),
    fetchBestMovementActorByBox(supabase, boxIds),
    fetchIngresoAuditActorByBox(supabase, boxIds),
  ]);

  const receptionIds = [
    ...new Set(
      [...boxMetaMap.values()]
        .map((b) => b.reception_id as string | undefined)
        .filter(Boolean) as string[]
    ),
  ];
  const receptionMap = await fetchMapById(
    supabase,
    'receptions',
    receptionIds,
    'id, received_by, notes'
  );

  const operatorIds = [
    ...new Set(
      [
        ...[...boxMetaMap.values()].map((b) => b.assigned_operator_id as string | undefined),
        ...[...movementByBox.values()].map((m) => m.userId || undefined),
        ...[...auditByBox.values()].map((m) => m.userId || undefined),
        ...[...receptionMap.values()]
          .map((r) => {
            const rb = String(r.received_by || '').trim();
            return UUID_RE.test(rb) ? rb : undefined;
          })
          .filter(Boolean) as string[],
      ].filter(Boolean) as string[]
    ),
  ];
  const profileMap = await fetchMapById(supabase, 'profiles', operatorIds, 'id, full_name, email');

  const techIds = [
    ...new Set(
      [...modelMap.values()]
        .map((m) => m.technology_id as string | undefined)
        .filter(Boolean) as string[]
    ),
  ];
  const techMap = await fetchMapById(supabase, 'technologies', techIds, TECHNOLOGY_SELECT);

  return items.map((item) => {
    const boxMeta = boxMetaMap.get(item.box_id);
    const brand = item.sample_brand_id ? brandMap.get(item.sample_brand_id) : undefined;
    const model = item.sample_model_id ? modelMap.get(item.sample_model_id) : undefined;
    const techId = (model?.technology_id as string | undefined) ?? null;
    const tech = techId ? techMap.get(techId) : undefined;

    const assignedId = (boxMeta?.assigned_operator_id as string | undefined) ?? null;
    const assignedProfile = assignedId ? profileMap.get(assignedId) : undefined;
    const movement = movementByBox.get(item.box_id);
    const movementProfile = movement?.userId ? profileMap.get(movement.userId) : undefined;
    const audit = auditByBox.get(item.box_id);
    const auditProfile = audit?.userId ? profileMap.get(audit.userId) : undefined;
    const receptionId = (boxMeta?.reception_id as string | undefined) ?? null;
    const reception = receptionId ? receptionMap.get(receptionId) : undefined;
    const receivedByRaw = String(reception?.received_by || '').trim();
    const receivedByProfile = UUID_RE.test(receivedByRaw) ? profileMap.get(receivedByRaw) : undefined;
    const receivedByName = UUID_RE.test(receivedByRaw)
      ? null
      : displayPersonName(receivedByRaw, null);
    const notesName = parseRecibidoPorFromNotes(reception?.notes as string | undefined);

    const ingresoUserName =
      displayPersonName(
        assignedProfile?.full_name as string | undefined,
        assignedProfile?.email as string | undefined
      ) ||
      displayPersonName(
        movementProfile?.full_name as string | undefined,
        movementProfile?.email as string | undefined
      ) ||
      displayPersonName(movement?.name, null) ||
      displayPersonName(
        auditProfile?.full_name as string | undefined,
        auditProfile?.email as string | undefined
      ) ||
      displayPersonName(
        receivedByProfile?.full_name as string | undefined,
        receivedByProfile?.email as string | undefined
      ) ||
      receivedByName ||
      notesName ||
      null;

    return {
      ...item,
      capacity: item.capacity ?? (boxMeta?.capacity as number | undefined) ?? null,
      equipos_count: item.equipos_count ?? null,
      deletion_status: (boxMeta?.deletion_status as string | undefined) ?? null,
      assigned_operator_id: assignedId,
      ingreso_user_name: ingresoUserName,
      created_at: (boxMeta?.created_at as string | undefined) ?? null,
      brand_name: (brand?.name as string | undefined) ?? null,
      model_name: (model?.name as string | undefined) ?? null,
      tech_name: (tech?.name as string | undefined) ?? null,
      technology_id: techId,
    };
  });
}
