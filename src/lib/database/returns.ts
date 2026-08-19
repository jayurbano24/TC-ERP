import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { logAdvancedAudit } from '@/lib/database/audit';
import { processBlockReturnBySapTransfer as sapTransferBlockReturn } from '@/modules/sap-transfer';
import {
  isHexagonalReturnsEnabled,
  processBlockReturnBySapTransferHex,
  registerIndividualReturnHex,
} from '@/modules/returns';
import { sanitizeCacAgencyRaw } from '@/lib/cacAgencyUtils';

import { COUNT_HEAD, RECEPTION_UNDO_SELECT } from '@/shared/constants/dbProjections';

export async function processBlockReturnBySapTransfer(
  sapTransferId: string,
  formData: { motivo: string; guiaSalida: string; observaciones?: string },
  currentUserFullName: string
) {
  if (isHexagonalReturnsEnabled()) {
    return processBlockReturnBySapTransferHex(sapTransferId, formData, currentUserFullName);
  }
  return sapTransferBlockReturn(sapTransferId, formData, currentUserFullName);
}

function isAtomicFullReceptionReturnEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_USE_ATOMIC_FULL_RECEPTION_RETURN === 'true') return true;
  const flags =
    process.env.NEXT_PUBLIC_FEATURE_FLAGS?.split(',').map((f) => f.trim()) ?? [];
  return flags.includes('USE_ATOMIC_FULL_RECEPTION_RETURN');
}

function formatReturnNetworkError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return 'No se pudo conectar con el servidor. Verifique su conexión e intente de nuevo.';
  }
  return msg || fallback;
}

/** Filas para módulo Logística → Devoluciones (equipos devueltos por bloque SAP) */
export async function getSapBlockReturnRows() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  const { data: seriesList, error } = await supabase
    .from('series')
    .select(`
      id,
      serial_number,
      notes,
      created_at,
      updated_at,
      service_order_id,
      sap_transfer_id,
      service_orders ( os_label, created_at ),
      sap_transfer_documents (
        id,
        sap_document_number,
        status,
        reception_id,
        created_at,
        updated_at,
        reception_guides ( guide_number, agency )
      ),
      receptions:current_reception_id ( guide_number, carrier, created_at, notes )
    `)
    .eq('current_status', 'returned')
    .not('sap_transfer_id', 'is', null)
    .order('updated_at', { ascending: false });

  if (error || !seriesList?.length) return [];

  const seenOs = new Set<string>();
  const rows: Array<{
    id: string;
    sn: string;
    cliente: string;
    motivo: string;
    fecha: string;
    timestamp: number;
    estatus: 'Pendiente' | 'Procesado';
    os: string;
    sapDocument: string;
    receptionId?: string;
    serviceOrderId?: string;
    seriesId?: string;
    sapTransferId?: string;
    category: string;
    isSapBlock: boolean;
    classifiedBy: string;
  }> = [];

  for (const s of seriesList as any[]) {
    const sapDoc = Array.isArray(s.sap_transfer_documents)
      ? s.sap_transfer_documents[0]
      : s.sap_transfer_documents;
    if (sapDoc?.status !== 'DEVUELTO_BLOQUE') continue;

    const osId = s.service_order_id as string | null;
    if (osId && seenOs.has(osId)) continue;
    if (osId) seenOs.add(osId);

    const notes = String(s.notes || '');
    const receptionNotes = String(s.receptions?.notes || '');
    const motivoMatch = notes.match(/Motivo:\s*([^\n]+)/);
    const guide =
      sapDoc?.reception_guides?.guide_number ||
      s.receptions?.guide_number ||
      '---';

    // Fecha FIJA del evento de devolución (notes), nunca updated_at (cambia con sync/SAP).
    const stableMs =
      extractStableReturnFechaFromNotes(notes) ??
      extractStableReturnFechaFromNotes(receptionNotes) ??
      (s.service_orders?.created_at
        ? new Date(s.service_orders.created_at).getTime()
        : NaN);
    const timestamp = Number.isFinite(stableMs)
      ? stableMs
      : new Date(s.created_at || Date.now()).getTime();

    const friendlyRef =
      s.service_orders?.os_label ||
      `${sapDoc?.sap_document_number || 'SAP'}-${String(s.id).slice(0, 6).toUpperCase()}`;

    const classifiedBy =
      extractReturnUserFromNotes(notes) ||
      extractReturnUserFromNotes(receptionNotes) ||
      'Sin registro';

    const agencyFromGuide = sanitizeCacAgencyRaw(
      sapDoc?.reception_guides?.agency,
      s.receptions?.carrier
    );
    const cliente = agencyFromGuide || 'S/D';

    rows.push({
      id: `SAP-BLK-${friendlyRef}`,
      sn: s.serial_number || guide,
      cliente,
      motivo: motivoMatch?.[1]?.trim() || `Devolución bloque SAP ${sapDoc?.sap_document_number || ''}`,
      fecha: formatStableDate(timestamp),
      timestamp,
      estatus: 'Pendiente',
      os: s.service_orders?.os_label || '---',
      sapDocument: sapDoc?.sap_document_number || '---',
      receptionId: sapDoc?.reception_id,
      serviceOrderId: osId || undefined,
      seriesId: s.id as string,
      sapTransferId: s.sap_transfer_id as string | undefined,
      category: 'DEVOLUCIÓN SAP BLOQUE',
      isSapBlock: true,
      classifiedBy,
    });
  }

  return rows.sort((a, b) => b.timestamp - a.timestamp);
}

const PROCESSED_RECEPTION_STATUSES = new Set(['DESPACHADO', 'DEVUELTO_A_AGENCIA', 'DEVUELTO']);

function extractGuiaEnvioFromNotes(notes: string | null | undefined): string | undefined {
  const match = String(notes || '').match(/Guía de Envío:\s*([^\n(]+)/i);
  return match?.[1]?.trim() || undefined;
}

/** Parsea timestamps de línea de tiempo tipo `16/8/2026, 8:40:31 p. m.` (toLocaleString). */
function parseTimelineStamp(raw: string): number | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  const iso = Date.parse(trimmed);
  if (!Number.isNaN(iso)) return iso;

  const m = trimmed.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/i
  );
  if (!m) return null;

  let hour = Number(m[4]);
  const min = Number(m[5]);
  const sec = Number(m[6] || 0);
  const ampm = String(m[7] || '')
    .toLowerCase()
    .replace(/\s+/g, '');
  if (ampm.startsWith('p') && hour < 12) hour += 12;
  if (ampm.startsWith('a') && hour === 12) hour = 0;

  const day = Number(m[1]);
  const month = Number(m[2]) - 1;
  const year = Number(m[3]);
  const d = new Date(year, month, day, hour, min, sec);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/**
 * Fecha/usuario del PRIMER movimiento a Bodega Devolución (estable; no cambia con eventos posteriores).
 * Formato: `[fecha] MOV-… | BOD-DEV | CLASIFICACIÓN (Guía X): Movido a BODEGA: DEVOLUCIÓN - Por: Nombre`
 */
function extractDevolucionMoveFromNotes(
  notes: string | null | undefined,
  guideNumber: string
): { at: number | null; by: string | null } {
  if (!notes) return { at: null, by: null };
  const guideKey = String(guideNumber || '')
    .trim()
    .toUpperCase();
  const lines = String(notes).split(/\r?\n/);

  let bestForGuide: { at: number; by: string | null } | null = null;
  let bestAny: { at: number; by: string | null } | null = null;

  for (const line of lines) {
    if (!/BOD-DEV|Movido a BODEGA:\s*DEVOLUCI/i.test(line)) continue;
    const stampMatch = line.match(/\[([^\]]+)\]/);
    if (!stampMatch) continue;
    const at = parseTimelineStamp(stampMatch[1]);
    if (at == null) continue;
    const byMatch = line.match(/Por:\s*(.+?)\s*$/i);
    const by = byMatch?.[1]?.trim() || null;
    const entry = { at, by };

    // Más antigua = fecha real de ingreso a devolución (no se “actualiza”).
    if (!bestAny || at < bestAny.at) bestAny = entry;

    if (guideKey) {
      const upper = line.toUpperCase();
      const guiaBlock = upper.match(/CLASIFICACI[OÓ]N\s*\(GU[IÍ]A\s*([^)]*)\)/i);
      const guidesInLine = (guiaBlock?.[1] || '')
        .split(/[,;/|]/)
        .map((g) => g.trim().toUpperCase())
        .filter(Boolean);
      const mentions =
        upper.includes(guideKey) ||
        guidesInLine.some((g) => g === guideKey || g.includes(guideKey) || guideKey.includes(g));
      if (mentions && (!bestForGuide || at < bestForGuide.at)) {
        bestForGuide = entry;
      }
    }
  }

  const best = bestForGuide || bestAny;
  return best ? { at: best.at, by: best.by } : { at: null, by: null };
}

/** Fecha fija escrita al devolver (bloque --- DEVOLUCIÓN --- / Fecha:), no updated_at. */
function extractStableReturnFechaFromNotes(notes: string | null | undefined): number | null {
  if (!notes) return null;
  const text = String(notes);

  const blockMatch = text.match(/---\s*DEVOLUCI[OÓ]N\s*---([\s\S]*?)(?=---\s*[A-ZÁÉÍÓÚ]|\[\d|$)/i);
  const block = blockMatch?.[1] || text;
  const fechaMatch = block.match(/Fecha:\s*([^\n]+)/i);
  if (fechaMatch?.[1]) {
    const parsed = parseTimelineStamp(fechaMatch[1]);
    if (parsed != null) return parsed;
  }

  return null;
}

/** Usuario que envió el equipo a Equipos Devueltos (bloque DEVOLUCIÓN / timeline). */
function extractReturnUserFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const text = String(notes);

  const blockMatch = text.match(/---\s*DEVOLUCI[OÓ]N\s*---([\s\S]*?)(?=---\s*[A-ZÁÉÍÓÚ]|\[\d|$)/i);
  const block = blockMatch?.[1] || text;

  const usuarioMatch = block.match(/Usuario:\s*([^\n]+)/i);
  if (usuarioMatch?.[1]?.trim()) return usuarioMatch[1].trim();

  const porMatch = block.match(/Por:\s*([^\n]+)/i);
  if (porMatch?.[1]?.trim()) return porMatch[1].trim();

  // Fallback: cualquier línea de auditoría de devolución en las notas.
  const globalUsuario = text.match(/Usuario:\s*([^\n]+)/i);
  if (globalUsuario?.[1]?.trim()) return globalUsuario[1].trim();

  return null;
}

function formatStableDate(ms: number): string {
  return new Date(ms).toLocaleDateString('es-GT');
}

function formatStableDateTime(ms: number): string {
  return new Date(ms).toLocaleString('es-GT');
}

function normalizeClassifyCategory(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function guideNotesIndicateSubBodega(
  notes: string,
  guideNumber: string
): boolean {
  const guide = guideNumber.trim();
  if (!guide || !notes) return false;
  const normGuide = guide.toLowerCase();
  const details = notes.includes('--- DETALLES BACKOFFICE ---')
    ? notes.split('--- DETALLES BACKOFFICE ---')[1]?.split('--- LÍNEA DE TIEMPO')[0] || ''
    : notes;
  const regex = /\[Guía ([^\]]+)\]([\s\S]*?)(?=\[Guía|---|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(details)) !== null) {
    const guidePart = match[1].split('|')[0];
    const guides = guidePart.split(',').map((g) => g.trim().toLowerCase());
    if (!guides.some((g) => g === normGuide)) continue;
    const block = match[2].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (block.includes('backoffice_category: accesorio')) return true;
    if (
      block.includes('backoffice_category: telefono') ||
      block.includes('backoffice_category: movil')
    ) {
      return true;
    }
  }

  const tl = notes.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const guideEsc = normGuide.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (
    new RegExp(`clasificaci[^\\n]*${guideEsc}[^\\n]*bodega:\\s*accesorio`, 'i').test(tl)
  ) {
    return true;
  }
  if (
    new RegExp(`clasificaci[^\\n]*${guideEsc}[^\\n]*bodega:\\s*(telefono|movil)`, 'i').test(tl)
  ) {
    return true;
  }
  return false;
}

/** True si la guía es Accesorio/Teléfono (no debe aparecer en Bodega Devolución). */
function isSubBodegaGuideCategory(rg: {
  category?: string | null;
  guide_number?: string | null;
  receptions?: { notes?: string | null } | null;
}): boolean {
  const cat = normalizeClassifyCategory(rg.category);
  if (cat === 'accesorio' || cat === 'telefono' || cat === 'movil') return true;
  if (cat !== 'devolucion') return true;
  return guideNotesIndicateSubBodega(
    String(rg.receptions?.notes || ''),
    String(rg.guide_number || '')
  );
}

/** Fila de caja en Bodega Devolución (desde clasificación Backoffice). */
export type BoxReturnRow = {
  id: string;
  sn: string;
  cliente: string;
  motivo: string;
  fecha: string;
  timestamp: number;
  estatus: 'Pendiente' | 'Procesado';
  dbId: string;
  receptionId: string;
  classifiedBy?: string;
  guiaEnvio?: string;
  isBoxReturn: true;
  os: string;
  processDate: string;
  processUser: string;
  transferNotes: string;
  agencyRaw?: string;
  carrier?: string;
  receptionNotes?: string;
};

/** Repara guías de devolución que quedaron solo en receptions (sin fila en reception_guides). */
async function backfillDevolucionGuidesFromReceptions(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>
) {
  const { data: recs } = await supabase
    .from('receptions')
    .select('id, notes, processed_guides, guide_number, status')
    .or('status.eq.BODEGA_DEVOLUCION,notes.ilike.%Movido a BODEGA: DEVOLUCI%')
    .not('status', 'in', '("ARCHIVADO","ELIMINADO","DEVUELTO")');

  if (!recs?.length) return;

  for (const rec of recs) {
    const guides = (rec.processed_guides?.length ? rec.processed_guides : [rec.guide_number])
      .map((g: unknown) => String(g || '').trim())
      .filter(Boolean);

    for (const guideNumber of guides) {
      const notes = String(rec.notes || '');
      const guideBlock = notes.includes(`[Guía ${guideNumber}`)
        ? notes.split(`[Guía ${guideNumber}`)[1]?.split('[Guía')[0] || ''
        : notes;
      const isDevolucionGuide =
        rec.status === 'BODEGA_DEVOLUCION' ||
        notes.includes('Movido a BODEGA: DEVOLUCI') ||
        guideBlock.toLowerCase().includes('backoffice_category: devoluc') ||
        guideBlock.includes('Motivo Devolución:');

      if (!isDevolucionGuide) continue;

      const motivo =
        guideBlock.split('Motivo Devolución: ')[1]?.split('\n')[0]?.trim() ||
        notes.split('Motivo Devolución: ')[1]?.split('\n')[0]?.trim() ||
        null;

      const move = extractDevolucionMoveFromNotes(notes, guideNumber);
      const moveIso = move.at != null ? new Date(move.at).toISOString() : null;

      const { data: existing } = await supabase
        .from('reception_guides')
        .select('id, classified_at, classified_by, category')
        .eq('reception_id', rec.id)
        .eq('guide_number', guideNumber)
        .maybeSingle();

      // Ya existe: no tocar classified_at ni updated_at (las fechas no deben cambiar).
      if (existing?.id) continue;

      await supabase.from('reception_guides').insert({
        reception_id: rec.id,
        guide_number: guideNumber,
        category: 'devolucion',
        status: 'CLASIFICADO',
        motivo,
        classified_at: moveIso || new Date().toISOString(),
        classified_by: move.by || null,
        updated_at: moveIso || new Date().toISOString(),
      });
    }
  }
}

function mapReceptionGuideToBoxReturnRow(rg: any): BoxReturnRow {
  const recStatus = rg.receptions?.status as string | undefined;
  const guideStatus = rg.status as string | undefined;
  const isProcessed =
    guideStatus === 'DESPACHADO' ||
    (recStatus ? PROCESSED_RECEPTION_STATUSES.has(recStatus) : false);

  const receptionNotes = rg.receptions?.notes as string | undefined;
  const move = extractDevolucionMoveFromNotes(receptionNotes, String(rg.guide_number || ''));

  // Fecha FIJA: primer BOD-DEV en notes (histórico) → classified_at → created_at recepción.
  // Nunca updated_at (cambia con sync / despacho / backfill).
  const classifiedMs = rg.classified_at ? new Date(rg.classified_at).getTime() : NaN;
  const movedAtMs =
    move.at ??
    (Number.isFinite(classifiedMs)
      ? classifiedMs
      : rg.receptions?.created_at
        ? new Date(rg.receptions.created_at).getTime()
        : Date.now());

  const processDate = formatStableDateTime(movedAtMs);
  // Clasificador Backoffice (no courier de recepción).
  const processUser =
    (rg.classified_by && String(rg.classified_by).trim()) ||
    (move.by && String(move.by).trim()) ||
    'Sin registro';
  const transferNotes =
    rg.motivo ||
    receptionNotes?.split('Motivo Devolución: ')[1]?.split('\n')[0]?.trim() ||
    receptionNotes?.split('Notas: ')[1]?.split('\n')[0]?.trim() ||
    '';

  const agencyRawClean = sanitizeCacAgencyRaw(rg.agency, rg.receptions?.carrier) || undefined;

  return {
    id: `CAJA-${rg.reception_id?.slice(0, 5).toUpperCase()}-${rg.guide_number}`,
    sn: rg.guide_number,
    cliente: agencyRawClean || 'S/D',
    motivo: rg.motivo || 'Devolución de caja',
    fecha: formatStableDate(movedAtMs),
    timestamp: movedAtMs,
    estatus: isProcessed ? ('Procesado' as const) : ('Pendiente' as const),
    dbId: rg.id as string,
    receptionId: rg.reception_id as string,
    classifiedBy: (rg.classified_by || move.by) as string | undefined,
    guiaEnvio: extractGuiaEnvioFromNotes(receptionNotes),
    isBoxReturn: true as const,
    os: '---',
    processDate,
    processUser,
    transferNotes,
    agencyRaw: agencyRawClean,
    carrier: rg.receptions?.carrier as string | undefined,
    receptionNotes,
  };
}

/** Filas para pestaña Bodega Devolución (guías clasificadas como devolución en Backoffice). */
export async function getBoxReturnRows(): Promise<BoxReturnRow[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  // No await backfill en el listado: bloqueaba la UI (spinner infinito).
  // Reparación opcional en background, sin retrasar la respuesta.
  void backfillDevolucionGuidesFromReceptions(supabase).catch((err) => {
    console.warn('backfillDevolucionGuidesFromReceptions:', err);
  });

  const { data, error } = await supabase
    .from('reception_guides')
    .select(`
      id,
      guide_number,
      category,
      agency,
      status,
      classified_by,
      classified_at,
      motivo,
      reception_id,
      receptions (
        id,
        created_at,
        carrier,
        status,
        notes
      )
    `)
    .eq('category', 'devolucion')
    .not('receptions.status', 'in', '("ARCHIVADO","ELIMINADO","DEVUELTO")')
    .order('classified_at', { ascending: false });

  if (error) {
    console.error('Error fetching box returns:', error.message);
    return [];
  }

  return (data || [])
    .filter((rg: any) => rg.receptions)
    .filter((rg: any) => !isSubBodegaGuideCategory(rg))
    .map(mapReceptionGuideToBoxReturnRow)
    .sort((a, b) => b.timestamp - a.timestamp);
}

export type BoxReturnDispatchTarget = {
  isBoxReturn: true;
  receptionGuideId: string;
  receptionId: string;
  guideNumber: string;
};

/** Despacha devolución de caja (sin series) hacia la agencia. */
export async function dispatchBoxReturns(
  targets: BoxReturnDispatchTarget[],
  guiaSalida: string,
  userName: string,
  destinationAgency?: string
): Promise<{ error?: string; dispatchedCount?: number }> {
  const guia = String(guiaSalida || '').trim();
  if (!guia) return { error: 'La guía de salida es obligatoria.' };
  if (!targets.length) return { error: 'No hay ítems seleccionados para despachar.' };

  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured' };

  const dispatchStamp = new Date().toISOString();
  let dispatchedCount = 0;

  try {
    for (const target of targets) {
      const { data: reception, error: recError } = await supabase
        .from('receptions')
        .select('notes, status')
        .eq('id', target.receptionId)
        .single();
      if (recError || !reception) return { error: 'Recepción no encontrada' };

      if (PROCESSED_RECEPTION_STATUSES.has(reception.status)) {
        continue;
      }

      const dispatchNote =
        `--- DESPACHO DEVOLUCIÓN CAJA ---\nGuía CAC: ${target.guideNumber}\nGuía Salida: ${guia}\nAgencia Destino: ${destinationAgency || 'N/A'}\nUsuario: ${userName}\nFecha: ${new Date().toLocaleString()}`;
      let notes = reception.notes || '';
      const timelineEvent = `\n[${new Date().toLocaleString()}] LOG-DEV-CAJA | DESPACHO | Guía ${target.guideNumber} despachada a agencia. Courier: ${guia} | Por: ${userName}`;
      if (notes.includes('--- LÍNEA DE TIEMPO (MATRIZ) ---')) {
        notes = notes.replace(
          '--- LÍNEA DE TIEMPO (MATRIZ) ---',
          `--- LÍNEA DE TIEMPO (MATRIZ) ---${timelineEvent}`
        );
      } else {
        notes += `\n\n--- LÍNEA DE TIEMPO (MATRIZ) ---\n${timelineEvent}`;
      }
      notes += `\n\n${dispatchNote}`;

      const { error: guideError } = await supabase
        .from('reception_guides')
        .update({
          status: 'DESPACHADO',
          updated_at: dispatchStamp,
          ...(destinationAgency ? { agency: destinationAgency } : {}),
        })
        .eq('id', target.receptionGuideId);
      if (guideError) return { error: guideError.message };

      const { error: recUpdateError } = await supabase
        .from('receptions')
        .update({
          status: 'DEVUELTO_A_AGENCIA',
          notes,
          updated_at: dispatchStamp,
        })
        .eq('id', target.receptionId);
      if (recUpdateError) return { error: recUpdateError.message };

      await logAdvancedAudit({
        module: 'Logística',
        tableName: 'reception_guides',
        recordId: target.receptionGuideId,
        action: 'DESPACHO_DEVOLUCION_CAJA',
        newValues: { guiaSalida: guia, guideNumber: target.guideNumber },
        observations: `Despacho de caja devuelta desde clasificación. Guía: ${target.guideNumber}`,
      });

      dispatchedCount++;
    }

    if (dispatchedCount === 0) {
      return { error: 'Los ítems seleccionados ya fueron despachados o no son válidos.' };
    }

    return { dispatchedCount };
  } catch (err) {
    return { error: formatReturnNetworkError(err, 'Error al despachar devolución de caja.') };
  }
}

/** Revierte devolución de caja y regresa la guía a Clasificación en Backoffice. */
export async function undoBoxReturnFromClassification(
  receptionGuideId: string,
  receptionId: string,
  guideNumber: string,
  userName: string
): Promise<{ error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured' };

  try {
    const { data: reception, error: recError } = await supabase
      .from('receptions')
      .select(RECEPTION_UNDO_SELECT)
      .eq('id', receptionId)
      .single();
    if (recError || !reception) return { error: 'Recepción no encontrada' };

    const newProcessed = (reception.processed_guides || []).filter(
      (g: string) => g !== guideNumber
    );

    let notes = reception.notes || '';
    const timelineEvent = `\n[${new Date().toLocaleString()}] LOG-DEV-CAJA | REVERSO | Guía ${guideNumber} regresada a Clasificación | Por: ${userName}`;
    if (notes.includes('--- LÍNEA DE TIEMPO (MATRIZ) ---')) {
      notes = notes.replace(
        '--- LÍNEA DE TIEMPO (MATRIZ) ---',
        `--- LÍNEA DE TIEMPO (MATRIZ) ---${timelineEvent}`
      );
    } else {
      notes += `\n\n--- LÍNEA DE TIEMPO (MATRIZ) ---\n${timelineEvent}`;
    }

    const { error: guideError } = await supabase
      .from('reception_guides')
      .update({
        category: null,
        status: 'PENDIENTE',
        motivo: null,
        classified_by: null,
        classified_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', receptionGuideId);
    if (guideError) return { error: guideError.message };

    const { error: recUpdateError } = await supabase
      .from('receptions')
      .update({
        processed_guides: newProcessed,
        status: 'PENDIENTE DE CLASIFICAR',
        notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', receptionId);
    if (recUpdateError) return { error: recUpdateError.message };

    await logAdvancedAudit({
      module: 'Logística',
      tableName: 'reception_guides',
      recordId: receptionGuideId,
      action: 'REVERSO_DEVOLUCION_CAJA',
      newValues: { guideNumber, status: 'PENDIENTE DE CLASIFICAR' },
      observations: `Reverso de devolución de caja. Guía ${guideNumber} regresada a clasificación.`,
    });

    return {};
  } catch (err) {
    return { error: formatReturnNetworkError(err, 'Error al revertir devolución de caja.') };
  }
}

export type ReturnDispatchTarget = {
  isSapBlock?: boolean;
  isReception?: boolean;
  serviceOrderId?: string;
  receptionId?: string;
  seriesId?: string;
  sapTransferId?: string;
};

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Despacha equipos devueltos (salida física con guía courier). */
export async function dispatchReturnItems(
  targets: ReturnDispatchTarget[],
  guiaSalida: string,
  userName: string
): Promise<{ error?: string; dispatchedCount?: number }> {
  const guia = String(guiaSalida || '').trim();
  if (!guia) return { error: 'La guía de salida es obligatoria.' };
  if (!targets.length) return { error: 'No hay ítems seleccionados para despachar.' };

  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured' };

  const dispatchedSeriesIds = new Set<string>();
  const sapTransferIds = new Set<string>();
  const serviceOrderIds = new Set<string>();
  const dispatchStamp = new Date().toISOString();
  const dispatchNote =
    `--- DESPACHO DEVOLUCIÓN ---\nGuía Salida: ${guia}\nUsuario: ${userName}\nFecha: ${new Date().toLocaleString()}`;

  try {
    for (const target of targets) {
      let seriesIds: string[] = [];

      if (target.isSapBlock && target.serviceOrderId) {
        const { data, error } = await supabase
          .from('series')
          .select('id, notes, sap_transfer_id')
          .eq('service_order_id', target.serviceOrderId)
          .eq('current_status', 'returned');
        if (error) return { error: error.message };
        seriesIds = (data || []).map((s) => s.id);
        for (const row of data || []) {
          if (row.sap_transfer_id) sapTransferIds.add(row.sap_transfer_id);
        }
      } else if (target.isReception && target.receptionId) {
        const { data, error } = await supabase
          .from('series')
          .select('id, notes, sap_transfer_id')
          .eq('current_reception_id', target.receptionId)
          .eq('current_status', 'returned');
        if (error) return { error: error.message };
        seriesIds = (data || []).map((s) => s.id);
        for (const row of data || []) {
          if (row.sap_transfer_id) sapTransferIds.add(row.sap_transfer_id);
        }
        await supabase
          .from('receptions')
          .update({ status: 'DESPACHADO' })
          .eq('id', target.receptionId);
      } else if (target.seriesId) {
        const { data, error } = await supabase
          .from('series')
          .select('id, notes, sap_transfer_id')
          .eq('id', target.seriesId)
          .eq('current_status', 'returned')
          .maybeSingle();
        if (error) return { error: error.message };
        if (data) {
          seriesIds = [data.id];
          if (data.sap_transfer_id) sapTransferIds.add(data.sap_transfer_id);
        }
      }

      if (seriesIds.length === 0) {
        return {
          error: 'No se encontraron equipos en estado devuelto para despachar. Verifique que la orden aún esté pendiente.',
        };
      }

      const { data: seriesRows } = await supabase
        .from('series')
        .select('id, notes, service_order_id')
        .in('id', seriesIds);

      for (const chunk of chunkArray(seriesRows || [], 50)) {
        await Promise.all(
          chunk.map((row) =>
            supabase
              .from('series')
              .update({
                current_status: 'dispatched',
                notes: `${dispatchNote}\n\n${row.notes || ''}`.trim(),
                updated_at: dispatchStamp,
              })
              .eq('id', row.id)
          )
        );
        chunk.forEach((row) => dispatchedSeriesIds.add(row.id));
      }

      const osIds = [
        ...new Set((seriesRows || []).map((s) => s.service_order_id).filter(Boolean)),
      ] as string[];
      if (osIds.length) {
        const { error: osError } = await supabase
          .from('service_orders')
          .update({ status: 'DESPACHADO' })
          .in('id', osIds);
        if (osError) return { error: `Error actualizando orden de servicio: ${osError.message}` };
        osIds.forEach((id) => serviceOrderIds.add(id));
      }

      if (target.sapTransferId) sapTransferIds.add(target.sapTransferId);
    }

    for (const sapId of sapTransferIds) {
      const { count } = await supabase
        .from('series')
        .select(COUNT_HEAD, { count: 'exact', head: true })
        .eq('sap_transfer_id', sapId)
        .eq('current_status', 'returned');
      if ((count || 0) === 0) {
        await supabase
          .from('sap_transfer_documents')
          .update({ status: 'DESPACHADO', updated_at: dispatchStamp })
          .eq('id', sapId);
      }
    }

    for (const osId of serviceOrderIds) {
      const { error: trayError } = await supabase.rpc('upsert_cac_tray_unit_from_os', {
        p_os_id: osId,
      });
      if (trayError) {
        console.warn('No se pudo refrescar cac_tray_units para OS', osId, trayError.message);
      }
    }

    await logAdvancedAudit({
      module: 'Logística',
      tableName: 'series',
      recordId: [...dispatchedSeriesIds][0] || 'batch',
      action: 'DESPACHO_DEVOLUCION',
      newValues: {
        guiaSalida: guia,
        series_count: dispatchedSeriesIds.size,
        targets: targets.length,
      },
      observations: `Despacho de devolución (${dispatchedSeriesIds.size} serie(s)). Guía: ${guia}`,
    });

    return { dispatchedCount: dispatchedSeriesIds.size };
  } catch (err) {
    return { error: formatReturnNetworkError(err, 'Error al despachar devolución.') };
  }
}

export async function getReturns() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  // In our schema, returns can be tracked in series with status 'returned'
  // Or we can have a specific returns table if needed.
  // For now, let's assume we use 'series' with a 'returned' status for simplicity
  // or a specific table if the user wants more detail.
  
  const { data, error } = await supabase
    .from('series')
    .select(`
      id,
      serial_number,
      current_status,
      updated_at,
      current_reception_id,
      receptions (guide_number, carrier),
      service_orders (os_label)
    `)
    .eq('current_status', 'returned');

  if (error) return [];
  return data;
}

export async function registerNewReturn(returnEntry: any) {
  if (isHexagonalReturnsEnabled()) {
    return registerIndividualReturnHex(returnEntry);
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const serialNumber = String(returnEntry.sn || '').trim();
  if (!serialNumber) {
    return { error: 'El número de serie es obligatorio.' };
  }

    const { data: existing, error: fetchError } = await supabase
    .from('series')
    .select('id, serial_number, current_status, current_reception_id, service_order_id, sap_transfer_id')
    .eq('serial_number', serialNumber)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };

  if (!existing) {
    return {
      error: 'Serie no encontrada en el sistema. Una devolución no puede registrar equipos que no existen. Verifique el número de serie o registre el equipo mediante recepción.'
    };
  }

  if (returnEntry.originalGuide && existing.current_reception_id) {
    const { data: reception } = await supabase
      .from('receptions')
      .select('guide_number')
      .eq('id', existing.current_reception_id)
      .maybeSingle();

    const guide = String(returnEntry.originalGuide).trim();
    if (reception?.guide_number && reception.guide_number !== guide) {
      return {
        error: `La guía ingresada (${guide}) no coincide con la recepción del equipo (${reception.guide_number}).`
      };
    }
  }

  const prevStatus = existing.current_status;

  if (existing.current_status !== 'RECEPCIONADO_BODEGA_GENERAL') {
    return {
      error: `El equipo no está en estado Pendiente de Ingreso a Bodega General (estado actual: ${existing.current_status}).`,
    };
  }

  // Bloque obligatorio ANTES de mutar — misma regla que devolución aislada
  if (existing.sap_transfer_id) {
    const { data: pendingSeries, error: pendingError } = await supabase
      .from('series')
      .select('service_order_id')
      .eq('sap_transfer_id', existing.sap_transfer_id)
      .eq('current_status', 'RECEPCIONADO_BODEGA_GENERAL');

    if (pendingError) return { error: pendingError.message };

    const pendingOsCount = new Set(
      (pendingSeries || []).map((s) => s.service_order_id).filter(Boolean)
    ).size;

    if (pendingOsCount > 1) {
      const { data: sapDoc } = await supabase
        .from('sap_transfer_documents')
        .select('sap_document_number')
        .eq('id', existing.sap_transfer_id)
        .maybeSingle();

      return {
        error: `Devolución aislada no permitida. Este equipo pertenece al Documento SAP ${sapDoc?.sap_document_number || ''} con ${pendingOsCount} equipos. Debe procesar la devolución en bloque por documento SAP.`,
        sapTransferId: existing.sap_transfer_id,
        requiresBlockReturn: true,
      };
    }
  }

  const returnNote = `--- DEVOLUCIÓN ---\nMotivo: ${returnEntry.motivo}\nGuía Salida: ${returnEntry.guiaSalida}\nCat: ${returnEntry.category || 'BODEGA DEVOLUCIÓN'}\nFecha: ${new Date().toLocaleString()}\nUsuario: ${returnEntry.usuario || returnEntry.classifiedBy || 'SISTEMA'}`;

  const { error: updateError } = await supabase
    .from('series')
    .update({
      current_status: 'returned',
      notes: returnNote,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id);

  if (updateError) return { error: updateError.message };

  if (existing.service_order_id) {
    await supabase
      .from('service_orders')
      .update({ status: 'DEVUELTO' })
      .eq('id', existing.service_order_id);
  }

  // Devolución individual permitida (1 solo equipo en el documento SAP)
  if (existing.sap_transfer_id) {
    const { count: remaining } = await supabase
      .from('series')
      .select(COUNT_HEAD, { count: 'exact', head: true })
      .eq('sap_transfer_id', existing.sap_transfer_id)
      .eq('current_status', 'RECEPCIONADO_BODEGA_GENERAL');

    if ((remaining || 0) === 0) {
      await supabase
        .from('sap_transfer_documents')
        .update({ status: 'DEVUELTO_BLOQUE', updated_at: new Date().toISOString() })
        .eq('id', existing.sap_transfer_id);
    }
  }

  await logAdvancedAudit({
    module: 'Logística',
    tableName: 'series',
    recordId: existing.id,
    action: 'DEVOLUCION_EQUIPO',
    oldValues: {
      current_status: prevStatus,
      current_reception_id: existing.current_reception_id,
      service_order_id: existing.service_order_id
    },
    newValues: {
      current_status: 'returned',
      current_reception_id: existing.current_reception_id,
      service_order_id: existing.service_order_id,
      motivo: returnEntry.motivo,
      guiaSalida: returnEntry.guiaSalida
    },
    observations: `Devolución individual registrada. SN: ${serialNumber}`
  });

  return { success: true };
}

export async function processFullReceptionReturn(
  receptionId: string,
  formData: { motivo: string; guiaSalida: string; observaciones: string },
  currentUserFullName: string
) {
  if (isAtomicFullReceptionReturnEnabled()) {
    return processFullReceptionReturnRpc(receptionId, formData, currentUserFullName);
  }
  return processFullReceptionReturnLegacy(receptionId, formData, currentUserFullName);
}

async function processFullReceptionReturnRpc(
  receptionId: string,
  formData: { motivo: string; guiaSalida: string; observaciones: string },
  currentUserFullName: string
) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured' };

  try {
    const { data, error } = await supabase.rpc('full_reception_return_tx', {
      p_reception_id: receptionId,
      p_motivo: formData.motivo,
      p_guia_salida: formData.guiaSalida,
      p_user: currentUserFullName,
      p_observaciones: formData.observaciones?.trim() || null,
    });

    if (error) return { error: error.message };

    const payload = (data || {}) as {
      series_count?: number;
      reception_id?: string;
      guide_number?: string;
    };

    const { data: seriesList } = await supabase
      .from('series')
      .select('id')
      .eq('current_reception_id', receptionId)
      .eq('current_status', 'returned');

    const seriesIds = (seriesList || []).map((s) => s.id);

    await Promise.allSettled(
      seriesIds.map((seriesId) =>
        logAdvancedAudit({
          module: 'Logística',
          tableName: 'series',
          recordId: seriesId,
          action: 'DEVOLUCION_EQUIPO',
          newValues: {
            status: 'returned',
            motivo: formData.motivo,
            guiaSalida: formData.guiaSalida,
            atomic: true,
          },
          observations: `Equipo devuelto forzosamente junto con su lote. Motivo: ${formData.motivo}`,
        })
      )
    );

    await logAdvancedAudit({
      module: 'Logística',
      tableName: 'receptions',
      recordId: receptionId,
      action: 'DEVOLUCION_LOTE',
      newValues: {
        status: 'DEVUELTO',
        series_count: payload.series_count ?? seriesIds.length,
        atomic: true,
      },
      observations: `Lote devuelto completo (atómico, ${payload.series_count ?? seriesIds.length} equipos). Motivo: ${formData.motivo}`,
    });

    return { success: true };
  } catch (err) {
    return { error: formatReturnNetworkError(err, 'Error en devolución de lote.') };
  }
}

async function processFullReceptionReturnLegacy(
  receptionId: string,
  formData: { motivo: string; guiaSalida: string; observaciones: string },
  currentUserFullName: string
) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  try {
    // 1. Get the reception details
    const { data: reception, error: recError } = await supabase
      .from('receptions')
      .select(RECEPTION_UNDO_SELECT)
      .eq('id', receptionId)
      .single();
      
    if (recError || !reception) return { error: 'Recepción no encontrada' };

    // 2. Get all series for this reception
    const { data: seriesList, error: seriesError } = await supabase
      .from('series')
      .select('id, serial_number, current_status, notes')
      .eq('current_reception_id', receptionId);
      
    if (seriesError) return { error: 'Error obteniendo equipos (series)' };

    if (!seriesList || seriesList.length === 0) {
      return { error: 'No se encontraron equipos registrados para esta recepción. Solo se pueden devolver recepciones con equipos clasificados.' };
    }

    const seriesIds = seriesList.map(s => s.id);

    // 3. Prepare notes
    const newNotes = `--- DEVOLUCIÓN ---\nMotivo: ${formData.motivo}\nGuía de Salida: ${formData.guiaSalida}\nFecha: ${new Date().toLocaleString()}\nUsuario: ${currentUserFullName}\nObservaciones: ${formData.observaciones || 'N/A'}`;

    // 4. Update all series to 'returned' and prepend notes so it shows up in Devoluciones grid
    const updateSeriesPromises = seriesList.map(s => {
      const newSeriesNotes = `--- DEVOLUCIÓN ---\nMotivo: ${formData.motivo}\nGuía Salida: ${formData.guiaSalida}\nCat: BODEGA DEVOLUCIÓN\nFecha: ${new Date().toLocaleString()}\nUsuario: ${currentUserFullName}\n\n${s.notes || ''}`;
      return supabase.from('series').update({
        current_status: 'returned',
        notes: newSeriesNotes,
        updated_at: new Date().toISOString()
      }).eq('id', s.id);
    });

    await Promise.all(updateSeriesPromises);

    // 5. Update Reception
    const recNotes = (reception.notes || '') + `\n\n${newNotes}`;
    const { error: updateRecError } = await supabase
      .from('receptions')
      .update({
        status: 'DEVUELTO',
        notes: recNotes
      })
      .eq('id', receptionId);

    if (updateRecError) return { error: `Error actualizando estado del lote: ${updateRecError.message}` };

    // 6. Log Audit for each series
    const auditPromises = seriesList.map(s => logAdvancedAudit({
      module: 'Logística',
      tableName: 'series',
      recordId: s.id,
      action: 'DEVOLUCION_EQUIPO',
      newValues: { status: 'returned', motivo: formData.motivo, guiaSalida: formData.guiaSalida },
      observations: `Equipo devuelto forzosamente junto con su lote. Motivo: ${formData.motivo}`
    }));

    await Promise.allSettled(auditPromises);

    // 7. Log Audit for Reception
    await logAdvancedAudit({
      module: 'Logística',
      tableName: 'receptions',
      recordId: receptionId,
      action: 'DEVOLUCION_LOTE',
      newValues: { status: 'DEVUELTO' },
      observations: `Lote devuelto completo (todos sus equipos). Motivo: ${formData.motivo}`
    });

    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function undoFullReceptionReturn(receptionId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  try {
    // 1. Get the reception
    const { data: reception, error: recError } = await supabase
      .from('receptions')
      .select(RECEPTION_UNDO_SELECT)
      .eq('id', receptionId)
      .single();
      
    if (recError || !reception) return { error: 'Recepción no encontrada' };

    // 2. Get all series in 'returned' state for this reception
    const { data: seriesList, error: seriesError } = await supabase
      .from('series')
      .select('id, current_status, notes')
      .eq('current_reception_id', receptionId)
      .eq('current_status', 'returned');

    if (seriesError) return { error: 'Error obteniendo equipos devueltos' };

    // 3. Revert each series
    const updateSeriesPromises = seriesList.map(s => {
      let prevStatus = 'CLASIFICADA'; // Fallback
      let newNotes = s.notes || '';
      
      if (newNotes.includes('PrevStatus: ')) {
        const match = newNotes.match(/PrevStatus:\s*([^\n]+)/);
        if (match && match[1]) {
          prevStatus = match[1].trim();
        }
      }

      // Remove the Devolución block
      newNotes = newNotes.replace(/--- DEVOLUCIÓN ---[\s\S]*?Cat: BODEGA DEVOLUCIÓN\s*(PrevStatus:[^\n]+\n+)?/, '');

      return supabase.from('series').update({
        current_status: prevStatus,
        notes: newNotes.trim(),
        updated_at: new Date().toISOString()
      }).eq('id', s.id);
    });

    await Promise.all(updateSeriesPromises);

    // 4. Update Reception status
    const { error: updateRecError } = await supabase
      .from('receptions')
      .update({
        status: 'PENDIENTE_BACKOFFICE',
        notes: reception.notes ? reception.notes.replace(/--- DEVOLUCIÓN ---[\s\S]*?Observaciones:[^\n]+/, '').trim() : ''
      })
      .eq('id', receptionId);

    if (updateRecError) return { error: `Error actualizando lote: ${updateRecError.message}` };

    // 5. Log Audits
    const auditPromises = seriesList.map(s => logAdvancedAudit({
      module: 'Logística',
      tableName: 'series',
      recordId: s.id,
      action: 'REVERSO_DEVOLUCION_EQUIPO',
      newValues: { status: 'reverted' },
      observations: `Reverso de devolución masiva. Regresado a estado anterior.`
    }));
    await Promise.allSettled(auditPromises);

    await logAdvancedAudit({
      module: 'Logística',
      tableName: 'receptions',
      recordId: receptionId,
      action: 'REVERSO_DEVOLUCION_LOTE',
      newValues: { status: 'PENDIENTE_BACKOFFICE' },
      observations: `Reverso de devolución de lote completo.`
    });

    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export type ReturnsReportRankRow = { name: string; count: number };

export type ReturnsReportStats = {
  total: number;
  agencies: ReturnsReportRankRow[];
  reasons: ReturnsReportRankRow[];
  topAgency: ReturnsReportRankRow | null;
  topReason: ReturnsReportRankRow | null;
  refreshedAt: string | null;
  source: string;
};

function normalizeReportStats(raw: unknown): ReturnsReportStats {
  const data = (raw && typeof raw === 'object' ? raw : {}) as {
    total?: number;
    agencies?: ReturnsReportRankRow[];
    reasons?: ReturnsReportRankRow[];
    refreshed_at?: string | null;
    source?: string;
  };
  const agencies = Array.isArray(data.agencies)
    ? data.agencies
        .map((r) => ({ name: String(r?.name || 'Sin asignar'), count: Number(r?.count) || 0 }))
        .filter((r) => r.count > 0)
        .sort((a, b) => b.count - a.count)
    : [];
  const reasons = Array.isArray(data.reasons)
    ? data.reasons
        .map((r) => ({ name: String(r?.name || 'Sin motivo'), count: Number(r?.count) || 0 }))
        .filter((r) => r.count > 0)
        .sort((a, b) => b.count - a.count)
    : [];
  return {
    total: Number(data.total) || 0,
    agencies,
    reasons,
    topAgency: agencies[0] || null,
    topReason: reasons[0] || null,
    refreshedAt: data.refreshed_at ? String(data.refreshed_at) : null,
    source: String(data.source || 'returns_report_etl'),
  };
}

/**
 * ETL de reporte de devoluciones: refresca snapshot y devuelve cantidades
 * agregadas (total / agencia / motivo). Requiere migración 210.
 */
export async function getReturnsReportStats(): Promise<ReturnsReportStats> {
  const empty: ReturnsReportStats = {
    total: 0,
    agencies: [],
    reasons: [],
    topAgency: null,
    topReason: null,
    refreshedAt: null,
    source: 'empty',
  };

  const supabase = getSupabaseBrowserClient();
  if (!supabase) return empty;

  const { error: refreshError } = await supabase.rpc('refresh_returns_report_etl');
  if (refreshError) {
    console.error('refresh_returns_report_etl:', refreshError.message);
    throw new Error(
      refreshError.message.includes('Could not find the function') ||
      refreshError.message.includes('does not exist')
        ? 'Aplique la migración 210_returns_report_etl.sql en Supabase para generar el reporte.'
        : `No se pudo refrescar el ETL de devoluciones: ${refreshError.message}`
    );
  }

  const { data, error } = await supabase.rpc('get_returns_report_stats');
  if (error) {
    console.error('get_returns_report_stats:', error.message);
    throw new Error(`No se pudieron leer las cantidades del reporte: ${error.message}`);
  }

  return normalizeReportStats(data);
}
