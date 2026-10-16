import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { BusinessException, ValidationException } from '@/shared/errors/Exceptions';
import { adjustPartsInventory } from './partsService';

const DONOR_STATUSES = new Set(['irreparable', 'scrapped']);

function adminClient(db?: SupabaseClient): SupabaseClient {
  return db ?? getSupabaseServerClient();
}

function isScrapRack(rack: string | null | undefined): boolean {
  const r = String(rack ?? '')
    .trim()
    .toUpperCase();
  if (!r) return false;
  return r === 'SCRAP' || r === 'SCRAPS' || r.startsWith('SCRAP');
}

export type HarvestDonorRow = {
  series_id: string;
  serial_number: string;
  service_order_id: string;
  os_label: string | null;
  current_status: string;
  rack_location: string | null;
  model_name: string | null;
};

export async function searchHarvestDonors(q: string, db?: SupabaseClient): Promise<HarvestDonorRow[]> {
  const admin = adminClient(db);
  const term = q.trim();
  if (term.length < 2) return [];

  const { data: bySerial, error: e1 } = await admin
    .from('series')
    .select(
      'id, serial_number, service_order_id, current_status, current_box_id, service_orders(os_label), models(name), boxes:current_box_id(rack_location)'
    )
    .ilike('serial_number', `%${term}%`)
    .in('current_status', ['irreparable', 'scrapped'])
    .limit(40);

  if (e1) throw new BusinessException(e1.message);

  const { data: byOs, error: e2 } = await admin
    .from('series')
    .select(
      'id, serial_number, service_order_id, current_status, current_box_id, service_orders!inner(os_label), models(name), boxes:current_box_id(rack_location)'
    )
    .ilike('service_orders.os_label', `%${term}%`)
    .in('current_status', ['irreparable', 'scrapped'])
    .limit(40);

  if (e2) throw new BusinessException(e2.message);

  const merged = [...(bySerial ?? []), ...(byOs ?? [])];
  const seen = new Set<string>();
  const out: HarvestDonorRow[] = [];

  for (const row of merged) {
    const id = String((row as { id: string }).id);
    if (seen.has(id)) continue;
    seen.add(id);
    const status = String((row as { current_status?: string }).current_status ?? '');
    const boxes = (row as { boxes?: { rack_location?: string } | null }).boxes;
    const rack = boxes?.rack_location ?? null;
    if (!DONOR_STATUSES.has(status) && !isScrapRack(rack)) continue;

    out.push({
      series_id: id,
      serial_number: String((row as { serial_number?: string }).serial_number ?? ''),
      service_order_id: String((row as { service_order_id: string }).service_order_id),
      os_label: (row as { service_orders?: { os_label?: string } }).service_orders?.os_label ?? null,
      current_status: status,
      rack_location: rack,
      model_name: (row as { models?: { name?: string } | null }).models?.name ?? null,
    });
  }

  return out.slice(0, 25);
}

export type HarvestLineInput = {
  catalogId: string;
  qty: number;
  notes?: string | null;
};

export async function createPartHarvestSession(
  input: {
    seriesId: string;
    sessionNotes?: string | null;
    lines: HarvestLineInput[];
    userId?: string | null;
    userName?: string | null;
  },
  db?: SupabaseClient
) {
  const admin = adminClient(db);
  if (!input.seriesId) throw new ValidationException('Indique el equipo donante (serie).');
  if (!input.lines?.length) throw new ValidationException('Agregue al menos una pieza a recuperar.');

  const { data: series, error: sErr } = await admin
    .from('series')
    .select(
      'id, serial_number, service_order_id, current_status, boxes:current_box_id(rack_location), service_orders(os_label)'
    )
    .eq('id', input.seriesId)
    .maybeSingle();

  if (sErr) throw new BusinessException(sErr.message);
  if (!series) throw new BusinessException('Serie no encontrada.');
  const status = String(series.current_status ?? '');
  const rack = (series.boxes as { rack_location?: string } | null)?.rack_location ?? null;
  if (!DONOR_STATUSES.has(status) && !isScrapRack(rack)) {
    throw new BusinessException(
      'Solo equipos dictaminados Scrap/Irreparables (estatus irreparable/scrapped o caja SCRAP).'
    );
  }

  for (const line of input.lines) {
    if (!line.catalogId || !(line.qty > 0)) {
      throw new ValidationException('Cada línea requiere pieza del catálogo y cantidad > 0.');
    }
  }

  const { data: session, error: sessErr } = await admin
    .from('part_harvest_sessions')
    .insert({
      service_order_id: series.service_order_id,
      series_id: series.id,
      serial_number: series.serial_number,
      donor_status: status || (isScrapRack(rack) ? 'irreparable' : 'unknown'),
      rack_location: rack,
      os_label: (series.service_orders as { os_label?: string } | null)?.os_label ?? null,
      notes: input.sessionNotes?.trim() || null,
      created_by: input.userId ?? null,
      created_by_name: input.userName ?? null,
    })
    .select('id')
    .single();

  if (sessErr || !session) throw new BusinessException(sessErr?.message || 'No se pudo crear sesión harvesting');

  const lineRows = input.lines.map((l) => ({
    session_id: session.id,
    catalog_id: l.catalogId,
    qty: l.qty,
    notes: l.notes?.trim() || null,
  }));

  const { error: lineErr } = await admin.from('part_harvest_lines').insert(lineRows);
  if (lineErr) throw new BusinessException(lineErr.message);

  for (const line of input.lines) {
    const note =
      `Harvesting OS ${(series.service_orders as { os_label?: string } | null)?.os_label ?? series.service_order_id}` +
      ` · SN ${series.serial_number}` +
      (line.notes ? ` · ${line.notes}` : '');

    await adjustPartsInventory(
      {
        catalogId: line.catalogId,
        qtyDelta: line.qty,
        sourceType: 'RECOVERED',
        movementType: 'IN_HARVEST',
        notes: note,
        userId: input.userId ?? null,
        serviceOrderId: series.service_order_id,
        seriesId: series.id,
        refType: 'part_harvest',
        refId: session.id,
      },
      admin
    );
  }

  return { sessionId: session.id as string, lines: input.lines.length };
}

export async function listPartHarvestSessions(limit = 50, db?: SupabaseClient) {
  const admin = adminClient(db);
  const { data, error } = await admin
    .from('part_harvest_sessions')
    .select(
      `
      id,
      service_order_id,
      series_id,
      serial_number,
      donor_status,
      rack_location,
      os_label,
      notes,
      created_by_name,
      created_at,
      lines:part_harvest_lines(
        id,
        qty,
        notes,
        catalog:parts_catalog(id, sku, name)
      )
    `
    )
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 100));

  if (error) throw new BusinessException(error.message);
  return data ?? [];
}

export async function listHarvestUsageForSession(sessionId: string, db?: SupabaseClient) {
  const admin = adminClient(db);
  const { data: session, error: sErr } = await admin
    .from('part_harvest_sessions')
    .select('id, created_at, lines:part_harvest_lines(catalog_id)')
    .eq('id', sessionId)
    .maybeSingle();
  if (sErr) throw new BusinessException(sErr.message);
  if (!session) throw new BusinessException('Sesión no encontrada');

  const catalogIds = [...new Set((session.lines ?? []).map((l: { catalog_id: string }) => l.catalog_id))];
  if (catalogIds.length === 0) return [];

  const { data: movements, error: mErr } = await admin
    .from('part_movements')
    .select(
      'id, movement_type, qty, source_type, created_at, notes, service_order_id, service_orders(os_label), catalog:parts_catalog(sku, name)'
    )
    .in('catalog_id', catalogIds)
    .gte('created_at', session.created_at)
    .in('movement_type', ['DISPATCH', 'RESERVE', 'OUT_ADJUST', 'SCRAP'])
    .order('created_at', { ascending: false })
    .limit(80);

  if (mErr) throw new BusinessException(mErr.message);
  return movements ?? [];
}
