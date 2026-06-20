import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatFetchError, withRetry } from "@/lib/fetchWithRetry";

export type DbReception = {
  id?: string;
  source: 'cac' | 'px';
  guide_number: string;
  sap_document?: string;
  carrier?: string;
  received_by?: string;
  reception_time?: string;
  expected_units?: number;
  received_units?: number;
  evidence_url?: string;
  notes?: string;
  status?: string;
  processed_guides?: string[];
  photo_urls?: string[];
  created_at?: string;
};

const PX_REC_MIN = 800000;

export function isDuplicatePxGuideError(message: string): boolean {
  const msg = (message || '').toLowerCase();
  return (
    msg.includes('receptions_source_guide_number_key') ||
    (msg.includes('duplicate key') && msg.includes('guide_number'))
  );
}

export function formatPxReceptionError(message: string): string {
  if (isDuplicatePxGuideError(message)) {
    return 'Este número de recepción (REC) ya está registrado. El sistema intentará asignar uno nuevo; si el error persiste, recargue la página e intente de nuevo.';
  }
  return message;
}

/** Siguiente REC-XXXXXX para PX — continúa la secuencia existente (ej. REC-10 → REC-11). */
export async function generateNextPxGuideNumber(): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return `REC-${PX_REC_MIN}`;

  const { data, error } = await supabase
    .from('receptions')
    .select('guide_number')
    .eq('source', 'px')
    .ilike('guide_number', 'REC-%');

  if (error) {
    console.error('generateNextPxGuideNumber:', error);
    return `REC-${PX_REC_MIN}`;
  }

  let maxNum = 0;
  let foundRec = false;
  for (const row of data || []) {
    const match = String(row.guide_number || '').match(/^REC-(\d+)$/i);
    if (!match) continue;
    foundRec = true;
    const num = parseInt(match[1], 10);
    if (!Number.isNaN(num) && num > maxNum) maxNum = num;
  }

  if (!foundRec) return `REC-${PX_REC_MIN}`;
  return `REC-${maxNum + 1}`;
}

const ACTIVE_PX_RECEPTION_STATUSES = ['CLASIFICADA', 'RECEPCIONADA', 'PENDIENTE_BACKOFFICE'] as const;

/** Recepción PX activa con el mismo pedido SAP (evita duplicados como REC-9 / REC-10). */
export async function findActivePxReceptionBySapDocument(sapDocument: string) {
  const sap = sapDocument?.trim();
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !sap || sap === 'SIN-PEDIDO') return null;

  const { data, error } = await supabase
    .from('receptions')
    .select('id, guide_number, sap_document, status, created_at')
    .eq('source', 'px')
    .eq('sap_document', sap)
    .in('status', [...ACTIVE_PX_RECEPTION_STATUSES])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('findActivePxReceptionBySapDocument:', error);
    return null;
  }

  return data;
}

/** Extrae DOC Ref de las notas de recepción PX. */
export function extractDocRefFromPxNotes(notes?: string | null): string | null {
  if (!notes) return null;
  const match = notes.match(/^DOC Ref:\s*(.+)$/m);
  if (!match) return null;
  const val = match[1].trim();
  return val === '---' || !val ? null : val;
}

/** Recepción PX activa con el mismo DOC Referencia (guardado en notes). */
export async function findActivePxReceptionByDocReference(docReference: string) {
  const doc = docReference?.trim();
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !doc) return null;

  const { data, error } = await supabase
    .from('receptions')
    .select('id, guide_number, sap_document, status, created_at, notes')
    .eq('source', 'px')
    .in('status', [...ACTIVE_PX_RECEPTION_STATUSES])
    .ilike('notes', `%DOC Ref:%`)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('findActivePxReceptionByDocReference:', error);
    return null;
  }

  const docLower = doc.toLowerCase();
  for (const row of data || []) {
    const existing = extractDocRefFromPxNotes(row.notes);
    if (existing && existing.toLowerCase() === docLower) return row;
  }

  return null;
}

export type PxHeaderUniquenessResult =
  | { ok: true }
  | { ok: false; field: 'sap' | 'docReferencia'; message: string };

/** Valida que pedido SAP y DOC Referencia no existan en otra recepción PX activa. */
export async function validatePxHeaderUniqueness(
  sapDocument: string,
  docReference: string
): Promise<PxHeaderUniquenessResult> {
  const sap = sapDocument?.trim();
  if (sap) {
    const existingSap = await findActivePxReceptionBySapDocument(sap);
    if (existingSap) {
      const when = existingSap.created_at
        ? new Date(existingSap.created_at).toLocaleString('es-GT')
        : 'fecha desconocida';
      return {
        ok: false,
        field: 'sap',
        message: `El pedido ${sap} ya está registrado en ${existingSap.guide_number} (${when}). Use otro número o elimine la recepción anterior desde Historial.`,
      };
    }
  }

  const doc = docReference?.trim();
  if (doc) {
    const existingDoc = await findActivePxReceptionByDocReference(doc);
    if (existingDoc) {
      const when = existingDoc.created_at
        ? new Date(existingDoc.created_at).toLocaleString('es-GT')
        : 'fecha desconocida';
      return {
        ok: false,
        field: 'docReferencia',
        message: `El DOC Referencia "${doc}" ya está registrado en ${existingDoc.guide_number} / pedido ${existingDoc.sap_document || 'N/A'} (${when}).`,
      };
    }
  }

  return { ok: true };
}

export async function isPxGuideNumberAvailable(guideNumber: string): Promise<boolean> {
  const supabase = getSupabaseBrowserClient();
  const normalized = guideNumber?.trim();
  if (!supabase || !normalized) return false;

  const { count, error } = await supabase
    .from('receptions')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'px')
    .eq('guide_number', normalized);

  if (error) {
    console.error('isPxGuideNumberAvailable:', error);
    return false;
  }

  return (count || 0) === 0;
}

/** REC único para PX; si `preferred` está ocupado devuelve el siguiente libre. */
export async function resolveUniquePxGuideNumber(preferred?: string): Promise<string> {
  const pref = preferred?.trim();
  if (pref && (await isPxGuideNumberAvailable(pref))) return pref;

  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = await generateNextPxGuideNumber();
    if (await isPxGuideNumberAvailable(candidate)) return candidate;
  }

  return `REC-${Date.now()}`;
}

const PX_BLOCKED_SERIES_STATUSES = new Set([
  'recepcionado_bodega_general',
  'in_central_warehouse',
  'clasificada',
  'received',
]);

const PX_INACTIVE_RECEPTION_STATUSES = new Set([
  'ELIMINADO POR BODEGA',
  'ELIMINADO',
  'ARCHIVADO',
  'DEVUELTO',
]);

function collectPxEquipmentSerials(
  scannedSeries: Array<{ sn: string; s2?: string; s3?: string; s4?: string }>
): string[] {
  const all = new Set<string>();
  for (const eq of scannedSeries) {
    for (const raw of [eq.sn, eq.s2, eq.s3, eq.s4]) {
      const sn = String(raw || '').trim().toUpperCase();
      if (sn) all.add(sn);
    }
  }
  return [...all];
}

/** Evita finalizar PX si las series ya pertenecen a otra recepción activa. */
export async function validatePxScannedSeriesForFinalize(
  scannedSeries: Array<{ sn: string; s2?: string; s3?: string; s4?: string }>
): Promise<{ error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured' };

  const serialList = collectPxEquipmentSerials(scannedSeries);
  if (serialList.length === 0) return { error: 'No hay series para registrar.' };

  const seen = new Set<string>();
  for (const sn of serialList) {
    if (seen.has(sn)) {
      return { error: `La serie ${sn} está repetida dentro de esta recepción.` };
    }
    seen.add(sn);
  }

  const conflicts: string[] = [];

  for (let i = 0; i < serialList.length; i += 80) {
    const chunk = serialList.slice(i, i + 80);
    const { data, error } = await supabase
      .from('series')
      .select(
        'serial_number, current_status, current_reception_id, receptions:current_reception_id(guide_number, status, source, sap_document)'
      )
      .in('serial_number', chunk);

    if (error) return { error: error.message };

    for (const row of data || []) {
      const rec = (row as any).receptions;
      const status = String(row.current_status || '').toLowerCase();
      const recStatus = String(rec?.status || '').toUpperCase();

      if (!rec || rec.source !== 'px') continue;
      if (PX_INACTIVE_RECEPTION_STATUSES.has(recStatus)) continue;
      if (!PX_BLOCKED_SERIES_STATUSES.has(status)) continue;

      conflicts.push(
        `${row.serial_number} → ${rec.guide_number || '---'} / SAP ${rec.sap_document || '---'}`
      );
    }
  }

  if (conflicts.length > 0) {
    const preview = conflicts.slice(0, 4).join('\n• ');
    const more = conflicts.length > 4 ? `\n… y ${conflicts.length - 4} más` : '';
    return {
      error:
        `No se puede finalizar: ${conflicts.length} serie(s) ya están en otra recepción PX activa.\n\n` +
        `• ${preview}${more}\n\n` +
        `Elimine la recepción duplicada en Historial antes de volver a guardar.`,
    };
  }

  return {};
}

export async function getReceptions(source?: 'cac' | 'px') {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  return withRetry(async () => {
    let query = supabase
      .from('receptions')
      .select('*')
      .order('created_at', { ascending: false });

    if (source) {
      query = query.eq('source', source);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return data || [];
  }).catch((err) => {
    console.error("Network or Fetch error in getReceptions:", err);
    throw new Error(formatFetchError(err, 'Error al cargar recepciones'));
  });
}

export async function createReception(reception: DbReception) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { data, error } = await supabase
    .from('receptions')
    .insert([reception])
    .select()
    .single();

  if (error) {
    console.error("Error creating reception:", error);
    return { error: error.message };
  }

  return { data };
}

export async function updateReceptionStatus(id: string, status: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { error } = await supabase
    .from('receptions')
    .update({ status })
    .eq('id', id);

  if (error) {
    console.error("Error updating reception status:", error);
    return { error: error.message };
  }

  return { success: true };
}

export async function updateProcessedGuides(id: string, processedGuides: string[]) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { error } = await supabase
    .from('receptions')
    .update({ processed_guides: processedGuides })
    .eq('id', id);

  if (error) {
    console.error("Error updating processed guides:", error);
    return { error: error.message };
  }

  return { success: true };
}

export async function createReceptionWithSeries(reception: DbReception, series: string[]) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  // 1. Create the reception
  const { data: recData, error: recError } = await supabase
    .from('receptions')
    .insert([reception])
    .select()
    .single();

  if (recError) return { error: recError.message };

  // 2. Prepare series data
  const seriesToInsert = series.map(sn => ({
    serial_number: sn,
    current_reception_id: recData.id,
    current_status: 'INGRESADO'
  }));

  // 3. Insert series
  const { error: seriesError } = await supabase
    .from('series')
    .upsert(seriesToInsert, { onConflict: 'serial_number' });

  if (seriesError) return { error: seriesError.message };

  return { data: recData };
}

export async function createReceptionWithGuides(reception: DbReception, guides: string[]) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  // 1. Create the reception
  const { data: recData, error: recError } = await supabase
    .from('receptions')
    .insert([reception])
    .select()
    .single();

  if (recError) return { error: recError.message };

  // 2. Insert guides into reception_guides
  const guidesToInsert = guides.map(guide => ({
    reception_id: recData.id,
    guide_number: guide,
    status: 'PENDIENTE'
  }));

  if (guidesToInsert.length > 0) {
    const { error: guidesError } = await supabase
      .from('reception_guides')
      .upsert(guidesToInsert, { onConflict: 'reception_id,guide_number', ignoreDuplicates: true });

    // 3. Tolerancia a fallos: mostramos el error en consola pero NO bloqueamos ni revertimos
    // el retorno de la recepción maestra, ya que la recepción principal sí se creó con éxito.
    if (guidesError) {
      console.error("Warning: Falló la inserción en reception_guides:", guidesError.message);
    }
  }

  return { data: recData };
}

export async function addSeriesToReception(receptionId: string, series: string[], modelId?: string, brandId?: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const seriesToInsert = series.map(sn => ({
    serial_number: sn,
    current_reception_id: receptionId,
    current_status: 'INGRESADO',
    ...(modelId ? { model_id: modelId } : {}),
    ...(brandId ? { brand_id: brandId } : {})
  }));

  const { error } = await supabase
    .from('series')
    .upsert(seriesToInsert, { onConflict: 'serial_number' });

  if (error) {
    console.error("Error inserting series:", error);
    return { error: error.message };
  }

  return { success: true };
}

export async function fixMissingOS(receptionId: string, unit: { main_serial: string, all_series: string[], model_id: string, brand_id: string }) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { count } = await supabase.from('service_orders').select('*', { count: 'exact', head: true }).eq('main_serial', unit.main_serial);
  const reentryCount = (count || 0) + 1;

  const { data: osData, error: osError } = await supabase.from('service_orders').insert([{
    reception_id: receptionId,
    model_id: unit.model_id,
    brand_id: unit.brand_id,
    main_serial: unit.main_serial,
    reentry_count: reentryCount,
    status: 'INGRESADO'
  }]).select().single();

  if (osError) return { error: osError.message };

  const seriesToUpsert = unit.all_series.map(sn => ({
    serial_number: sn,
    current_reception_id: receptionId,
    service_order_id: osData.id,
    current_status: 'RECEPCIONADO_BODEGA_GENERAL',
    model_id: unit.model_id,
    brand_id: unit.brand_id
  }));

  const { error: upsertError } = await supabase.from('series').upsert(seriesToUpsert, { onConflict: 'serial_number' });
  if (upsertError) return { error: upsertError.message };

  return { success: true };
}

export async function createServiceOrders(
  receptionId: string,
  units: { main_serial: string; model_id: string; brand_id: string; all_series: string[] }[],
  receptionGuideId?: string,
  sapTransferId?: string
) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const results = [];
  
  for (const unit of units) {
    // 1. Verificar cuántas veces ha ingresado esta serie (re-entry)
    const { count, error: countError } = await supabase
      .from('service_orders')
      .select('*', { count: 'exact', head: true })
      .eq('main_serial', unit.main_serial);

    const reentryCount = (count || 0) + 1;

    // 2. Crear la Orden de Servicio (OS)
    const { data: osData, error: osError } = await supabase
      .from('service_orders')
      .insert([{
        reception_id: receptionId,
        reception_guide_id: receptionGuideId || null,
        sap_transfer_id: sapTransferId || null,
        model_id: unit.model_id,
        brand_id: unit.brand_id,
        main_serial: unit.main_serial,
        reentry_count: reentryCount,
        status: 'INGRESADO'
      }])
      .select()
      .single();

    if (osError) {
      console.error("Error creating Service Order:", osError);
      continue;
    }

    // 3. Vincular todas las series de esta unidad a la OS
    if (osData) {
      const seriesToUpsert = unit.all_series.map(sn => ({
        serial_number: sn,
        current_reception_id: receptionId,
        service_order_id: osData.id,
        sap_transfer_id: sapTransferId || null,
        current_status: 'RECEPCIONADO_BODEGA_GENERAL',
        model_id: unit.model_id,
        brand_id: unit.brand_id
      }));

      const { data: upsertedSeries } = await supabase.from('series').upsert(seriesToUpsert, { onConflict: 'serial_number' }).select('id');
      
      if (upsertedSeries) {
        const { logAudit } = await import('@/lib/database/audit');
        for (const s of upsertedSeries) {
          await logAudit('series', s.id, 'RECEPCIÓN CAC', { status: 'RECEPCIONADO_BODEGA_GENERAL', source: 'cac' });
        }
      }

      results.push(osData);
    }
  }

  return { data: results };
}

export async function getSeriesByReceptionId(receptionId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('series')
    .select('serial_number, model_id, brand_id, current_status')
    .eq('current_reception_id', receptionId);

  if (error) {
    console.error("Error fetching series:", error);
    return [];
  }

  return data || [];
}

export async function updateReception(id: string, updates: Partial<DbReception>) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { error } = await supabase
    .from('receptions')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error("Error updating reception:", error);
    return { error: error.message };
  }

  return { success: true };
}

export const RECEPTIONS_WITH_SERIES_SELECT =
  '*, reception_guides(id, guide_number, category, agency, classified_at), sap_transfer_documents(id, reception_guide_id, sap_document_number, agency, status, created_at), series(id, serial_number, brand_id, model_id, current_status, current_box_id, sap_transfer_id, service_order_id, created_at, updated_at, service_orders(id, os_label, main_serial, reentry_count, created_at, reception_guide_id, sap_transfer_id, reception_guides(id, guide_number, agency)))';

/** Select más ligero para bandeja historial CAC (sin join anidado reception_guides en service_orders). */
export const CAC_HISTORY_SELECT =
  '*, reception_guides(id, guide_number, category, agency, classified_at), sap_transfer_documents(id, reception_guide_id, sap_document_number, agency, status, created_at), series(id, serial_number, brand_id, model_id, current_status, current_box_id, sap_transfer_id, service_order_id, created_at, updated_at, service_orders(id, os_label, main_serial, reentry_count, created_at, reception_guide_id, sap_transfer_id))';

export async function queryCacHistoryReceptions(supabase: { from: (table: string) => any }) {
  const { data, error } = await supabase
    .from('receptions')
    .select(CAC_HISTORY_SELECT)
    .eq('source', 'cac')
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) throw new Error(error.message);
  return data || [];
}

export async function queryReceptionsWithSeries(
  supabase: { from: (table: string) => any },
  source?: 'cac' | 'px'
) {
  let query = supabase
    .from('receptions')
    .select(RECEPTIONS_WITH_SERIES_SELECT)
    .order('created_at', { ascending: false })
    .limit(300);

  if (source) {
    query = query.eq('source', source);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getReceptionsWithSeries(source?: 'cac' | 'px') {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  return withRetry(async () => queryReceptionsWithSeries(supabase, source)).catch((err) => {
    console.error("Error in getReceptionsWithSeries:", err);
    throw new Error(formatFetchError(err, 'Error al cargar el historial'));
  });
}
export async function clearAllReceptions() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  // First clear series (cascade-like)
  const { error: seriesError } = await supabase.from('series').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (seriesError) console.error("Error clearing series:", seriesError);

  const { error } = await supabase.from('receptions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) {
    console.error("Error clearing receptions:", error);
    return { error: error.message };
  }
  return { success: true };
}

export async function createPxReceptionWithBoxes(
  reception: DbReception,
  boxes: { id: string; box_code: string; expected_units: number; brand_id: string; model_id: string; material?: string; }[],
  seriesByBox: Record<string, string[]>
) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  let guideNumber = reception.guide_number?.trim() || (await resolveUniquePxGuideNumber());
  let recData: DbReception | null = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error: recError } = await supabase
      .from('receptions')
      .insert([{ ...reception, guide_number: guideNumber }])
      .select()
      .single();

    if (!recError && data) {
      recData = data;
      break;
    }

    if (recError && isDuplicatePxGuideError(recError.message) && attempt < 4) {
      guideNumber = await resolveUniquePxGuideNumber();
      continue;
    }

    if (recError) {
      return { error: formatPxReceptionError(recError.message) };
    }
  }

  if (!recData) {
    return { error: 'No se pudo crear la recepción PX. Intente de nuevo.' };
  }

  // Generate consecutive BOX-xxx codes
  const { data: lastBoxes } = await supabase
    .from('boxes')
    .select('box_code')
    .like('box_code', 'BOX-%');

  let maxBoxNum = 0;
  if (lastBoxes && lastBoxes.length > 0) {
    for (const row of lastBoxes) {
      const match = row.box_code.match(/^BOX-(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxBoxNum) maxBoxNum = num;
      }
    }
  }

  const uiBoxToNewBox = new Map<string, string>();

  // 2. Prepare boxes data — solo cajas con equipos escaneados
  const boxesWithEquipment = boxes.filter((b) => (seriesByBox[b.id] || []).length > 0);
  if (boxesWithEquipment.length === 0) {
    return { error: 'No hay equipos escaneados para crear cajas en esta recepción PX.' };
  }

  const boxesToInsert = boxesWithEquipment.map(b => {
    maxBoxNum++;
    const newBoxCode = `BOX-${maxBoxNum}`;
    uiBoxToNewBox.set(b.box_code, newBoxCode);

    return {
      reception_id: recData.id,
      box_code: newBoxCode,
      brand_id: b.brand_id,
      model_id: b.model_id,
      capacity: b.expected_units,
      status: 'closed',
      rack_location: 'BODEGA_CENTRAL' // Ingreso automático a Bodega Central al finalizar recepción PX
    };
  });

  const { data: createdBoxes, error: boxError } = await supabase
    .from('boxes')
    .insert(boxesToInsert)
    .select();

  if (boxError) {
    console.error("Error creating boxes:", boxError);
    return { error: boxError.message };
  }

  // 3. Crear series y OS por caja — cada equipo obtiene su propia OS con código único
  for (const b of boxes) {
    const newCode = uiBoxToNewBox.get(b.box_code);
    const createdBox = createdBoxes.find(cb => cb.box_code === newCode);
    if (!createdBox) continue;

    const equipments = seriesByBox[b.id] || [];
    if (equipments.length === 0) continue;

    // Batch fetch reentry counts
    const countPromises = equipments.map((eq: any) =>
      supabase.from('service_orders').select('*', { count: 'exact', head: true }).eq('main_serial', eq.sn)
    );
    const countResults = await Promise.all(countPromises);

    // Cada equipo = 1 OS. El campo os_label es autogenerado por PostgreSQL.
    const osToInsert = equipments.map((eq: any, i: number) => ({
      reception_id: recData.id,
      model_id: b.model_id,
      brand_id: b.brand_id,
      main_serial: eq.sn,
      reentry_count: (countResults[i]?.count || 0) + 1,
      status: 'INGRESADO'
    }));

    const { data: createdOs, error: osError } = await supabase
      .from('service_orders')
      .insert(osToInsert)
      .select();

    if (osError || !createdOs) {
      console.error(`Error creating OS for box ${b.box_code}:`, osError);
      await supabase.from('boxes').update({ rack_location: 'ELIMINADO' }).eq('id', createdBox.id);
      continue;
    }

    // Vincular todas las series de cada equipo a su OS
    const seriesToUpsert: any[] = [];
    for (let i = 0; i < equipments.length; i++) {
      const eq: any = equipments[i];
      const os = createdOs.find(o => o.main_serial === eq.sn);
      if (!os) continue;

      const allSeries = [eq.sn, eq.s2, eq.s3, eq.s4].filter(Boolean);
      for (const sn of allSeries) {
        seriesToUpsert.push({
          serial_number: sn,
          brand_id: b.brand_id,
          model_id: b.model_id,
          material: b.material || eq.material,
          current_status: 'in_central_warehouse',
          current_box_id: createdBox.id,
          current_reception_id: recData.id,
          service_order_id: os.id
        });
      }
    }

    if (seriesToUpsert.length > 0) {
      const { data: upsertedSeries, error: seriesError } = await supabase
        .from('series')
        .upsert(seriesToUpsert, { onConflict: 'serial_number' })
        .select('id, serial_number');

      if (seriesError) {
        console.error(`Error upserting series para caja ${b.box_code}:`, seriesError);
        await supabase.from('boxes').update({ rack_location: 'ELIMINADO' }).eq('id', createdBox.id);
        continue;
      }
      
      if (upsertedSeries) {
        const { logAudit } = await import('@/lib/database/audit');
        for (const s of upsertedSeries) {
          await logAudit('series', s.id, 'INGRESO BODEGA', {
            status: 'in_central_warehouse',
            source: 'px',
            box: b.box_code,
          });
        }
      }
    }
  }

  return { data: recData };
}

/** Soft-delete PX reception and remove dependent series/OS so serials can be re-entered. */
export async function deletePxReceptionCascade(receptionId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured' };

  const { data: seriesList } = await supabase
    .from('series')
    .select('id, service_order_id')
    .eq('current_reception_id', receptionId);

  const soIds = new Set<string>();
  if (seriesList?.length) {
    for (const s of seriesList) {
      if (s.service_order_id) soIds.add(s.service_order_id);
    }
    if (soIds.size > 0) {
      const ids = [...soIds];
      await supabase.from('workshop_jobs').delete().in('service_order_id', ids);
      await supabase.from('qc_checks').delete().in('service_order_id', ids);
      await supabase.from('service_orders').delete().in('id', ids);
    }
    await supabase.from('series').delete().in(
      'id',
      seriesList.map((s) => s.id)
    );
  } else {
    const { data: osByRec } = await supabase.from('service_orders').select('id').eq('reception_id', receptionId);
    if (osByRec?.length) {
      const ids = osByRec.map((o) => o.id);
      await supabase.from('workshop_jobs').delete().in('service_order_id', ids);
      await supabase.from('qc_checks').delete().in('service_order_id', ids);
      await supabase.from('service_orders').delete().in('id', ids);
    }
  }

  await supabase.from('boxes').update({ rack_location: 'ELIMINADO' }).eq('reception_id', receptionId);
  const { error } = await supabase
    .from('receptions')
    .update({ status: 'ELIMINADO POR BODEGA' })
    .eq('id', receptionId);
  if (error) return { error: error.message };
  return { success: true };
}
