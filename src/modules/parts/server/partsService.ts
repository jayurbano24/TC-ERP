import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { BusinessException, ValidationException } from '@/shared/errors/Exceptions';
import { resolveProfileDisplayNames } from '@/shared/infrastructure/profiles/resolveProfileDisplayNames';

export type PartCatalogInput = {
  sku: string;
  name: string;
  description?: string | null;
  category?: string | null;
  brand_id?: string | null;
  model_id?: string | null;
  manufacturer?: string | null;
  part_number?: string | null;
  uom?: string;
  standard_cost?: number;
  internal_price?: number;
  stock_min?: number;
  stock_max?: number;
  reorder_point?: number;
  lead_time_days?: number;
  requires_return?: boolean;
  primary_supplier?: string | null;
  active?: boolean;
};

export type CreatePartRequestInput = {
  serviceOrderId: string;
  seriesId?: string | null;
  seriesIds?: string[];
  serialNumber?: string | null;
  serialNumbers?: string[];
  brandId?: string | null;
  modelId?: string | null;
  technicianId?: string | null;
  technicianName?: string | null;
  priority?: 'NORMAL' | 'URGENTE';
  reason?: string | null;
  notes?: string | null;
  catalogId: string;
  qty: number;
};

export type StockSourceType = 'NEW' | 'RECOVERED';

export type CreatePartRequestBatchInput = {
  catalogId: string;
  qtyPerOrder: number;
  priority?: 'NORMAL' | 'URGENTE';
  reason?: string | null;
  notes?: string | null;
  technicianId?: string | null;
  technicianName?: string | null;
  orders: Array<{
    serviceOrderId: string;
    seriesId?: string | null;
    seriesIds?: string[];
    serialNumber?: string | null;
    serialNumbers?: string[];
    brandId?: string | null;
    modelId?: string | null;
  }>;
};

function adminClient(db?: SupabaseClient): SupabaseClient {
  return db ?? getSupabaseServerClient();
}

function availableQty(onHand: number, reserved: number): number {
  return Math.max(0, onHand - reserved);
}

async function ensureInventoryRow(admin: SupabaseClient, catalogId: string) {
  const { data } = await admin
    .from('parts_inventory')
    .select(
      'id, catalog_id, qty_on_hand, qty_reserved, qty_new_on_hand, qty_recovered_on_hand, qty_new_reserved, qty_recovered_reserved, location'
    )
    .eq('catalog_id', catalogId)
    .maybeSingle();
  if (data) return data;
  const { data: created, error } = await admin
    .from('parts_inventory')
    .insert({
      catalog_id: catalogId,
      qty_on_hand: 0,
      qty_reserved: 0,
      qty_new_on_hand: 0,
      qty_recovered_on_hand: 0,
      qty_new_reserved: 0,
      qty_recovered_reserved: 0,
    })
    .select(
      'id, catalog_id, qty_on_hand, qty_reserved, qty_new_on_hand, qty_recovered_on_hand, qty_new_reserved, qty_recovered_reserved, location'
    )
    .single();
  if (error || !created) throw new BusinessException(error?.message || 'No se pudo crear inventario');
  return created;
}

async function writeMovement(
  admin: SupabaseClient,
  row: {
    catalog_id: string;
    movement_type: string;
    qty: number;
    source_type?: StockSourceType;
    unit_cost?: number;
    service_order_id?: string | null;
    series_id?: string | null;
    ref_type?: string | null;
    ref_id?: string | null;
    notes?: string | null;
    created_by?: string | null;
  }
) {
  const { error } = await admin.from('part_movements').insert({
    catalog_id: row.catalog_id,
    movement_type: row.movement_type,
    qty: row.qty,
    source_type: row.source_type ?? 'NEW',
    unit_cost: row.unit_cost ?? 0,
    service_order_id: row.service_order_id ?? null,
    series_id: row.series_id ?? null,
    ref_type: row.ref_type ?? null,
    ref_id: row.ref_id ?? null,
    notes: row.notes ?? null,
    created_by: row.created_by ?? null,
  });
  if (error) throw new BusinessException(error.message);
}

export async function listPartsCatalog(db?: SupabaseClient, opts?: { activeOnly?: boolean; modelId?: string; brandId?: string; q?: string }) {
  const admin = adminClient(db);
  let query = admin
    .from('parts_catalog')
    .select(
      '*, brands:brand_id(id, name), models:model_id(id, name), inventory:parts_inventory(qty_on_hand, qty_reserved, qty_new_on_hand, qty_recovered_on_hand, qty_new_reserved, qty_recovered_reserved, location)'
    )
    .order('sku');
  if (opts?.activeOnly !== false) query = query.eq('active', true);
  if (opts?.brandId) query = query.eq('brand_id', opts.brandId);
  if (opts?.modelId) query = query.eq('model_id', opts.modelId);
  if (opts?.q?.trim()) {
    const q = opts.q.trim();
    query = query.or(`sku.ilike.%${q}%,name.ilike.%${q}%,description.ilike.%${q}%`);
  }
  const { data, error } = await query;
  if (error) throw new BusinessException(error.message);
  return (data ?? []).map((row: any) => {
    const inv = Array.isArray(row.inventory) ? row.inventory[0] : row.inventory;
    const onHand = Number(inv?.qty_on_hand ?? 0);
    const reserved = Number(inv?.qty_reserved ?? 0);
    const onHandNew = Number(inv?.qty_new_on_hand ?? onHand);
    const onHandRecovered = Number(inv?.qty_recovered_on_hand ?? 0);
    const reservedNew = Number(inv?.qty_new_reserved ?? reserved);
    const reservedRecovered = Number(inv?.qty_recovered_reserved ?? 0);
    return {
      ...row,
      qty_on_hand: onHand,
      qty_reserved: reserved,
      qty_available: availableQty(onHand, reserved),
      qty_new_on_hand: onHandNew,
      qty_recovered_on_hand: onHandRecovered,
      qty_new_reserved: reservedNew,
      qty_recovered_reserved: reservedRecovered,
      qty_new_available: availableQty(onHandNew, reservedNew),
      qty_recovered_available: availableQty(onHandRecovered, reservedRecovered),
      brand_name: row.brands?.name ?? null,
      model_name: row.models?.name ?? null,
      location: inv?.location ?? null,
      inventory_id: inv?.id ?? null,
    };
  });
}

export async function upsertPartsCatalog(input: PartCatalogInput, db?: SupabaseClient) {
  const admin = adminClient(db);
  const sku = String(input.sku || '').trim().toUpperCase();
  if (!sku || !input.name?.trim()) {
    throw new ValidationException('SKU y nombre son obligatorios');
  }
  const payload = {
    sku,
    name: input.name.trim(),
    description: input.description ?? null,
    category: input.category ?? null,
    brand_id: input.brand_id || null,
    model_id: input.model_id || null,
    manufacturer: input.manufacturer ?? null,
    part_number: input.part_number ?? null,
    uom: input.uom || 'UN',
    standard_cost: Number(input.standard_cost ?? 0),
    internal_price: Number(input.internal_price ?? 0),
    stock_min: Number(input.stock_min ?? 0),
    stock_max: Number(input.stock_max ?? 0),
    reorder_point: Number(input.reorder_point ?? 0),
    lead_time_days: Number(input.lead_time_days ?? 0),
    requires_return: input.requires_return !== false,
    primary_supplier: input.primary_supplier ?? null,
    active: input.active !== false,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await admin
    .from('parts_catalog')
    .upsert(payload, { onConflict: 'sku' })
    .select('*')
    .single();
  if (error || !data) throw new BusinessException(error?.message || 'No se pudo guardar catálogo');
  await ensureInventoryRow(admin, String(data.id));
  return data;
}

export async function listPartsInventory(db?: SupabaseClient) {
  const rows = await listPartsCatalog(db, { activeOnly: true });
  return rows;
}

export async function adjustPartsInventory(opts: {
  catalogId: string;
  qtyDelta: number;
  sourceType?: StockSourceType;
  notes?: string;
  userId?: string | null;
  movementType?: 'IN_ADJUST' | 'OUT_ADJUST' | 'IN_PURCHASE';
  unitCost?: number;
}, db?: SupabaseClient) {
  const admin = adminClient(db);
  if (!opts.catalogId || !Number.isFinite(opts.qtyDelta) || opts.qtyDelta === 0) {
    throw new ValidationException('catalogId y qtyDelta distintos de 0 son requeridos');
  }
  const inv = await ensureInventoryRow(admin, opts.catalogId);
  const source: StockSourceType = opts.sourceType === 'RECOVERED' ? 'RECOVERED' : 'NEW';
  const currNewOnHand = Number(inv.qty_new_on_hand ?? inv.qty_on_hand ?? 0);
  const currRecOnHand = Number(inv.qty_recovered_on_hand ?? 0);
  const currNewReserved = Number(inv.qty_new_reserved ?? inv.qty_reserved ?? 0);
  const currRecReserved = Number(inv.qty_recovered_reserved ?? 0);

  let nextNewOnHand = currNewOnHand;
  let nextRecOnHand = currRecOnHand;
  if (source === 'NEW') nextNewOnHand += opts.qtyDelta;
  else nextRecOnHand += opts.qtyDelta;

  if (nextNewOnHand < currNewReserved) {
    throw new BusinessException('El ajuste dejaría stock NUEVO físico menor que el reservado');
  }
  if (nextRecOnHand < currRecReserved) {
    throw new BusinessException('El ajuste dejaría stock RECUPERADO físico menor que el reservado');
  }
  if (nextNewOnHand < 0 || nextRecOnHand < 0) {
    throw new BusinessException('Stock insuficiente para el ajuste en el tipo seleccionado');
  }

  const next = nextNewOnHand + nextRecOnHand;
  const nextReserved = currNewReserved + currRecReserved;
  if (next < nextReserved) {
    throw new BusinessException('El ajuste dejaría stock físico menor que el reservado');
  }
  const { error } = await admin
    .from('parts_inventory')
    .update({
      qty_on_hand: next,
      qty_reserved: nextReserved,
      qty_new_on_hand: nextNewOnHand,
      qty_recovered_on_hand: nextRecOnHand,
      qty_new_reserved: currNewReserved,
      qty_recovered_reserved: currRecReserved,
      updated_at: new Date().toISOString(),
    })
    .eq('id', inv.id);
  if (error) throw new BusinessException(error.message);
  const type =
    opts.movementType ||
    (opts.qtyDelta > 0 ? 'IN_ADJUST' : 'OUT_ADJUST');
  await writeMovement(admin, {
    catalog_id: opts.catalogId,
    movement_type: type,
    qty: Math.abs(opts.qtyDelta),
    source_type: source,
    unit_cost: opts.unitCost ?? 0,
    notes: opts.notes,
    created_by: opts.userId,
    ref_type: 'manual_adjust',
  });
  return { catalog_id: opts.catalogId, qty_on_hand: next, qty_reserved: nextReserved };
}

/** Solicitud desde Reparación: crea request + mueve series de la OS a waiting_parts. */
export async function createPartRequest(input: CreatePartRequestInput, db?: SupabaseClient) {
  const admin = adminClient(db);
  if (!input.serviceOrderId || !input.catalogId || !(input.qty > 0)) {
    throw new ValidationException('OS, pieza y cantidad son obligatorios');
  }
  const { data: catalog } = await admin
    .from('parts_catalog')
    .select('id, active, requires_return, standard_cost, name, sku')
    .eq('id', input.catalogId)
    .maybeSingle();
  if (!catalog?.active) throw new BusinessException('La pieza no está activa en el catálogo');

  const { data: reqNum } = await admin.rpc('next_part_request_number');
  const { data: request, error: reqErr } = await admin
    .from('part_requests')
    .insert({
      request_number: reqNum || null,
      service_order_id: input.serviceOrderId,
      series_id: input.seriesId || null,
      series_ids: input.seriesIds?.length
        ? [...new Set(input.seriesIds.filter(Boolean))]
        : input.seriesId
          ? [input.seriesId]
          : [],
      serial_number: input.serialNumber || null,
      serial_numbers: input.serialNumbers?.length
        ? [...new Set(input.serialNumbers.filter(Boolean))]
        : input.serialNumber
          ? [input.serialNumber]
          : [],
      brand_id: input.brandId || null,
      model_id: input.modelId || null,
      technician_id: input.technicianId || null,
      technician_name: input.technicianName || null,
      priority: input.priority || 'NORMAL',
      reason: input.reason || null,
      notes: input.notes || null,
      status: 'PENDING',
    })
    .select('*')
    .single();
  if (reqErr || !request) throw new BusinessException(reqErr?.message || 'No se pudo crear solicitud');

  const { data: item, error: itemErr } = await admin
    .from('part_request_items')
    .insert({
      request_id: request.id,
      catalog_id: input.catalogId,
      qty_requested: input.qty,
      status: 'PENDING',
    })
    .select('*')
    .single();
  if (itemErr || !item) throw new BusinessException(itemErr?.message || 'No se pudo crear ítem');

  // Mover todas las series de la OS a waiting_parts (si están en reparación)
  const { error: stErr } = await admin
    .from('series')
    .update({ current_status: 'waiting_parts', updated_at: new Date().toISOString() })
    .eq('service_order_id', input.serviceOrderId)
    .eq('current_status', 'in_qc');
  if (stErr) throw new BusinessException(stErr.message);

  return { request, item, catalog };
}

/** Crea una solicitud independiente por OS y las agrupa bajo un lote auditable. */
export async function createPartRequestBatch(
  input: CreatePartRequestBatchInput,
  db?: SupabaseClient
) {
  const admin = adminClient(db);
  const orders = [
    ...new Map(
      input.orders
        .filter((order) => order.serviceOrderId)
        .map((order) => [order.serviceOrderId, order])
    ).values(),
  ];
  if (!input.catalogId || !Number.isInteger(input.qtyPerOrder) || input.qtyPerOrder <= 0) {
    throw new ValidationException('Pieza y cantidad por OS son obligatorias');
  }
  if (orders.length < 2) {
    throw new ValidationException('El lote requiere al menos dos órdenes de servicio');
  }

  const now = new Date();
  const batchNumber = `PL-${now
    .toISOString()
    .replace(/\D/g, '')
    .slice(0, 14)}-${Math.floor(100 + Math.random() * 900)}`;
  const { data: batch, error: batchError } = await admin
    .from('part_request_batches')
    .insert({
      batch_number: batchNumber,
      catalog_id: input.catalogId,
      qty_per_order: input.qtyPerOrder,
      total_orders: orders.length,
      priority: input.priority || 'NORMAL',
      reason: input.reason || null,
      notes: input.notes || null,
      status: 'OPEN',
      requested_by: input.technicianId || null,
      requested_by_name: input.technicianName || null,
    })
    .select('*')
    .single();
  if (batchError || !batch) {
    throw new BusinessException(batchError?.message || 'No se pudo crear lote de solicitudes');
  }

  const created: Array<{ requestId: string; serviceOrderId: string }> = [];
  const errors: Array<{ serviceOrderId: string; message: string }> = [];
  for (const order of orders) {
    try {
      const result = await createPartRequest(
        {
          serviceOrderId: order.serviceOrderId,
          seriesId: order.seriesId || null,
          seriesIds: order.seriesIds || [],
          serialNumber: order.serialNumber || null,
          serialNumbers: order.serialNumbers || [],
          brandId: order.brandId || null,
          modelId: order.modelId || null,
          technicianId: input.technicianId || null,
          technicianName: input.technicianName || null,
          priority: input.priority || 'NORMAL',
          reason: input.reason || null,
          notes: input.notes || null,
          catalogId: input.catalogId,
          qty: input.qtyPerOrder,
        },
        admin
      );
      const { error } = await admin
        .from('part_requests')
        .update({ batch_id: batch.id })
        .eq('id', result.request.id);
      if (error) throw new BusinessException(error.message);
      created.push({
        requestId: String(result.request.id),
        serviceOrderId: order.serviceOrderId,
      });
    } catch (error) {
      errors.push({
        serviceOrderId: order.serviceOrderId,
        message: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  }

  await admin
    .from('part_request_batches')
    .update({
      status: errors.length > 0 ? (created.length > 0 ? 'PARTIAL' : 'CANCELLED') : 'OPEN',
      updated_at: new Date().toISOString(),
    })
    .eq('id', batch.id);

  if (created.length === 0) {
    throw new BusinessException(
      `No se pudo crear ninguna solicitud del lote: ${errors[0]?.message || 'error desconocido'}`
    );
  }
  return { batch, created, errors };
}

export async function listPartRequests(db?: SupabaseClient, opts?: { status?: string }) {
  const admin = adminClient(db);
  let q = admin
    .from('part_requests')
    .select(
      `*,
      service_orders:service_order_id(id, os_label),
      batch:batch_id(id, batch_number, total_orders, status),
      brands:brand_id(id, name),
      models:model_id(id, name),
      items:part_request_items(
        *,
        catalog:catalog_id(id, sku, name, requires_return, standard_cost, stock_min, lead_time_days)
      )`
    )
    .order('created_at', { ascending: false })
    .limit(200);
  if (opts?.status) q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) throw new BusinessException(error.message);
  return data ?? [];
}

export async function reservePartRequestItem(opts: {
  requestItemId: string;
  qty?: number;
  sourceType?: StockSourceType;
  userId?: string | null;
}, db?: SupabaseClient) {
  const admin = adminClient(db);
  const { data: item } = await admin
    .from('part_request_items')
    .select('*, request:request_id(id, service_order_id, status)')
    .eq('id', opts.requestItemId)
    .maybeSingle();
  if (!item) throw new BusinessException('Ítem de solicitud no encontrado');
  if (['DISPATCHED', 'REJECTED', 'CANCELLED'].includes(String(item.status))) {
    throw new BusinessException(`No se puede reservar: estado ${item.status}`);
  }
  const remaining =
    Number(item.qty_requested) - Number(item.qty_reserved) - Number(item.qty_dispatched);
  const qty = Math.min(opts.qty ?? remaining, remaining);
  if (qty <= 0) throw new BusinessException('No hay cantidad pendiente por reservar');

  const inv = await ensureInventoryRow(admin, String(item.catalog_id));
  const source: StockSourceType = opts.sourceType === 'RECOVERED' ? 'RECOVERED' : 'NEW';
  const avail =
    source === 'RECOVERED'
      ? availableQty(Number(inv.qty_recovered_on_hand ?? 0), Number(inv.qty_recovered_reserved ?? 0))
      : availableQty(
          Number(inv.qty_new_on_hand ?? inv.qty_on_hand ?? 0),
          Number(inv.qty_new_reserved ?? inv.qty_reserved ?? 0)
        );
  if (avail < qty) {
    throw new BusinessException(
      `Stock ${source === 'NEW' ? 'NUEVO' : 'RECUPERADO'} insuficiente (${avail}) para reservar ${qty}.`
    );
  }

  const { data: reservation, error: rErr } = await admin
    .from('part_reservations')
    .insert({
      request_item_id: item.id,
      catalog_id: item.catalog_id,
      qty,
      source_type: source,
      status: 'ACTIVE',
      created_by: opts.userId || null,
    })
    .select('*')
    .single();
  if (rErr || !reservation) throw new BusinessException(rErr?.message || 'No se pudo reservar');

  const { error: invErr } = await admin
    .from('parts_inventory')
    .update({
      qty_reserved: Number(inv.qty_reserved) + qty,
      qty_new_reserved:
        source === 'NEW'
          ? Number(inv.qty_new_reserved ?? inv.qty_reserved ?? 0) + qty
          : Number(inv.qty_new_reserved ?? inv.qty_reserved ?? 0),
      qty_recovered_reserved:
        source === 'RECOVERED'
          ? Number(inv.qty_recovered_reserved ?? 0) + qty
          : Number(inv.qty_recovered_reserved ?? 0),
      updated_at: new Date().toISOString(),
    })
    .eq('id', inv.id);
  if (invErr) throw new BusinessException(invErr.message);

  await admin
    .from('part_request_items')
    .update({
      qty_reserved: Number(item.qty_reserved) + qty,
      status: 'RESERVED',
    })
    .eq('id', item.id);

  await writeMovement(admin, {
    catalog_id: String(item.catalog_id),
    movement_type: 'RESERVE',
    qty,
    source_type: source,
    service_order_id: (item as any).request?.service_order_id,
    ref_type: 'part_reservation',
    ref_id: reservation.id,
    created_by: opts.userId,
  });

  return reservation;
}

export async function rejectPartRequest(opts: {
  requestId: string;
  reason?: string;
  userId?: string | null;
}, db?: SupabaseClient) {
  const admin = adminClient(db);
  const { data: request } = await admin
    .from('part_requests')
    .select('*, items:part_request_items(*)')
    .eq('id', opts.requestId)
    .maybeSingle();
  if (!request) throw new BusinessException('Solicitud no encontrada');

  // Liberar reservas activas
  for (const item of request.items || []) {
    const { data: reservations } = await admin
      .from('part_reservations')
      .select('*')
      .eq('request_item_id', item.id)
      .eq('status', 'ACTIVE');
    for (const res of reservations || []) {
      const inv = await ensureInventoryRow(admin, String(res.catalog_id));
      const source: StockSourceType = res.source_type === 'RECOVERED' ? 'RECOVERED' : 'NEW';
      const nextNewReserved =
        source === 'NEW'
          ? Math.max(0, Number(inv.qty_new_reserved ?? inv.qty_reserved ?? 0) - Number(res.qty))
          : Number(inv.qty_new_reserved ?? inv.qty_reserved ?? 0);
      const nextRecReserved =
        source === 'RECOVERED'
          ? Math.max(0, Number(inv.qty_recovered_reserved ?? 0) - Number(res.qty))
          : Number(inv.qty_recovered_reserved ?? 0);
      await admin
        .from('parts_inventory')
        .update({
          qty_reserved: Math.max(0, Number(inv.qty_reserved) - Number(res.qty)),
          qty_new_reserved: nextNewReserved,
          qty_recovered_reserved: nextRecReserved,
          updated_at: new Date().toISOString(),
        })
        .eq('id', inv.id);
      await admin
        .from('part_reservations')
        .update({ status: 'RELEASED', released_at: new Date().toISOString() })
        .eq('id', res.id);
      await writeMovement(admin, {
        catalog_id: String(res.catalog_id),
        movement_type: 'UNRESERVE',
        qty: Number(res.qty),
        source_type: source,
        service_order_id: request.service_order_id,
        ref_type: 'part_reservation',
        ref_id: res.id,
        created_by: opts.userId,
      });
    }
    await admin
      .from('part_request_items')
      .update({ status: 'REJECTED', qty_reserved: 0 })
      .eq('id', item.id);
  }

  await admin
    .from('part_requests')
    .update({
      status: 'REJECTED',
      rejected_reason: opts.reason || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', request.id);

  // Devolver OS a reparación
  await admin
    .from('series')
    .update({ current_status: 'in_qc', updated_at: new Date().toISOString() })
    .eq('service_order_id', request.service_order_id)
    .eq('current_status', 'waiting_parts');

  return { ok: true };
}

/** Despacha ítems reservados (o reserva+despacha qty pendiente). Vuelve OS a in_qc. */
export async function dispatchPartRequest(opts: {
  requestId: string;
  userId?: string | null;
  userName?: string | null;
  notes?: string | null;
  sourceType?: StockSourceType;
}, db?: SupabaseClient) {
  const admin = adminClient(db);
  const { data: request } = await admin
    .from('part_requests')
    .select(
      `*,
      items:part_request_items(*, catalog:catalog_id(id, sku, name, requires_return, standard_cost))`
    )
    .eq('id', opts.requestId)
    .maybeSingle();
  if (!request) throw new BusinessException('Solicitud no encontrada');
  if (['FULFILLED', 'REJECTED', 'CANCELLED'].includes(String(request.status))) {
    throw new BusinessException(`Solicitud en estado ${request.status}`);
  }

  // Reservar todo antes de crear el encabezado evita despachos vacíos si falta stock.
  for (const item of request.items || []) {
    const need = Number(item.qty_requested) - Number(item.qty_dispatched);
    if (need <= 0) continue;
    const reservedQty = Number(item.qty_reserved);
    if (reservedQty < need) {
      await reservePartRequestItem(
        {
          requestItemId: item.id,
          qty: need - reservedQty,
          userId: opts.userId,
          sourceType: opts.sourceType || 'NEW',
        },
        admin
      );
    }
  }

  const { data: dispNum } = await admin.rpc('next_part_dispatch_number');
  const { data: dispatch, error: dErr } = await admin
    .from('part_dispatches')
    .insert({
      dispatch_number: dispNum || null,
      request_id: request.id,
      batch_id: request.batch_id || null,
      service_order_id: request.service_order_id,
      series_id: request.series_id,
      dispatched_by: opts.userId || null,
      dispatched_by_name: opts.userName || null,
      notes: opts.notes || null,
    })
    .select('*')
    .single();
  if (dErr || !dispatch) throw new BusinessException(dErr?.message || 'No se pudo crear despacho');

  for (const item of request.items || []) {
    const need = Number(item.qty_requested) - Number(item.qty_dispatched);
    if (need <= 0) continue;

    const { data: reservations } = await admin
      .from('part_reservations')
      .select('*')
      .eq('request_item_id', item.id)
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: true });

    let toDispatch = need;
    for (const res of reservations || []) {
      if (toDispatch <= 0) break;
      const take = Math.min(Number(res.qty), toDispatch);
      const inv = await ensureInventoryRow(admin, String(item.catalog_id));
      const source: StockSourceType = res.source_type === 'RECOVERED' ? 'RECOVERED' : 'NEW';
      const currentNewOnHand = Number(inv.qty_new_on_hand ?? inv.qty_on_hand ?? 0);
      const currentRecOnHand = Number(inv.qty_recovered_on_hand ?? 0);
      const currentNewReserved = Number(inv.qty_new_reserved ?? inv.qty_reserved ?? 0);
      const currentRecReserved = Number(inv.qty_recovered_reserved ?? 0);
      const nextNewOnHand = source === 'NEW' ? currentNewOnHand - take : currentNewOnHand;
      const nextRecOnHand = source === 'RECOVERED' ? currentRecOnHand - take : currentRecOnHand;
      const nextNewReserved = source === 'NEW' ? currentNewReserved - take : currentNewReserved;
      const nextRecReserved = source === 'RECOVERED' ? currentRecReserved - take : currentRecReserved;
      const nextOnHand = nextNewOnHand + nextRecOnHand;
      const nextReserved = nextNewReserved + nextRecReserved;
      if (
        nextOnHand < 0 ||
        nextReserved < 0 ||
        nextNewOnHand < 0 ||
        nextRecOnHand < 0 ||
        nextNewReserved < 0 ||
        nextRecReserved < 0
      ) {
        throw new BusinessException('Inconsistencia de inventario al despachar');
      }
      await admin
        .from('parts_inventory')
        .update({
          qty_on_hand: nextOnHand,
          qty_reserved: nextReserved,
          qty_new_on_hand: nextNewOnHand,
          qty_recovered_on_hand: nextRecOnHand,
          qty_new_reserved: nextNewReserved,
          qty_recovered_reserved: nextRecReserved,
          updated_at: new Date().toISOString(),
        })
        .eq('id', inv.id);

      await admin
        .from('part_reservations')
        .update({ status: 'CONSUMED', released_at: new Date().toISOString() })
        .eq('id', res.id);

      const requiresReturn = Boolean((item as any).catalog?.requires_return);
      const unitCost = Number((item as any).catalog?.standard_cost ?? 0);
      const { data: dItem, error: diErr } = await admin
        .from('part_dispatch_items')
        .insert({
          dispatch_id: dispatch.id,
          request_item_id: item.id,
          reservation_id: res.id,
          catalog_id: item.catalog_id,
          qty: take,
          source_type: source,
          unit_cost: unitCost,
          return_required: requiresReturn,
          return_status: requiresReturn ? 'PENDING' : 'NOT_REQUIRED',
        })
        .select('*')
        .single();
      if (diErr || !dItem) throw new BusinessException(diErr?.message || 'No se pudo crear ítem despacho');

      await writeMovement(admin, {
        catalog_id: String(item.catalog_id),
        movement_type: 'DISPATCH',
        qty: take,
        source_type: source,
        unit_cost: unitCost,
        service_order_id: request.service_order_id,
        series_id: request.series_id,
        ref_type: 'part_dispatch_item',
        ref_id: dItem.id,
        created_by: opts.userId,
      });

      toDispatch -= take;
    }

    await admin
      .from('part_request_items')
      .update({
        qty_dispatched: Number(item.qty_dispatched) + need,
        qty_reserved: 0,
        status: 'DISPATCHED',
      })
      .eq('id', item.id);
  }

  await admin
    .from('part_requests')
    .update({ status: 'FULFILLED', updated_at: new Date().toISOString() })
    .eq('id', request.id);

  await admin
    .from('series')
    .update({ current_status: 'in_qc', updated_at: new Date().toISOString() })
    .eq('service_order_id', request.service_order_id)
    .eq('current_status', 'waiting_parts');

  return dispatch;
}

/** Despacha todas las solicitudes abiertas de un lote, una por OS. */
export async function dispatchPartRequestBatch(opts: {
  batchId: string;
  userId?: string | null;
  userName?: string | null;
  notes?: string | null;
  sourceType?: StockSourceType;
}, db?: SupabaseClient) {
  const admin = adminClient(db);
  const { data: batch } = await admin
    .from('part_request_batches')
    .select('id, batch_number, status')
    .eq('id', opts.batchId)
    .maybeSingle();
  if (!batch) throw new BusinessException('Lote de solicitudes no encontrado');

  const { data: requests, error } = await admin
    .from('part_requests')
    .select('id, service_order_id, status')
    .eq('batch_id', opts.batchId)
    .in('status', ['PENDING', 'PARTIAL'])
    .order('created_at', { ascending: true });
  if (error) throw new BusinessException(error.message);
  if (!requests?.length) throw new BusinessException('El lote no tiene solicitudes pendientes');

  const dispatched: Array<{ requestId: string; dispatchId: string; serviceOrderId: string }> = [];
  const errors: Array<{ requestId: string; serviceOrderId: string; message: string }> = [];
  for (const request of requests) {
    try {
      const dispatch = await dispatchPartRequest(
        {
          requestId: String(request.id),
          userId: opts.userId,
          userName: opts.userName,
          notes: opts.notes,
          sourceType: opts.sourceType,
        },
        admin
      );
      dispatched.push({
        requestId: String(request.id),
        dispatchId: String(dispatch.id),
        serviceOrderId: String(request.service_order_id),
      });
    } catch (dispatchError) {
      errors.push({
        requestId: String(request.id),
        serviceOrderId: String(request.service_order_id),
        message: dispatchError instanceof Error ? dispatchError.message : 'Error desconocido',
      });
    }
  }

  const status = errors.length > 0 ? 'PARTIAL' : 'FULFILLED';
  await admin
    .from('part_request_batches')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', opts.batchId);

  return { batchId: opts.batchId, batchNumber: batch.batch_number, status, dispatched, errors };
}

export async function listPartDispatches(db?: SupabaseClient) {
  const admin = adminClient(db);
  const { data, error } = await admin
    .from('part_dispatches')
    .select(
      `*,
      service_orders:service_order_id(id, os_label),
      items:part_dispatch_items(
        id, dispatch_id, request_item_id, reservation_id, catalog_id, qty, source_type, unit_cost, return_required, return_status, created_at,
        catalog:catalog_id(id, sku, name)
      )`
    )
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new BusinessException(error.message);
  return data ?? [];
}

export async function listPendingReturns(db?: SupabaseClient) {
  const admin = adminClient(db);
  const { data, error } = await admin
    .from('part_dispatch_items')
    .select(
      `*,
      catalog:catalog_id(id, sku, name),
      dispatch:dispatch_id(
        id, dispatch_number, created_at, dispatched_by_name,
        service_orders:service_order_id(id, os_label)
      )`
    )
    .eq('return_status', 'PENDING')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new BusinessException(error.message);
  return data ?? [];
}

export async function receivePartReturn(opts: {
  dispatchItemId: string;
  userId?: string | null;
  userName?: string | null;
  status?: 'RECEIVED' | 'EVALUATED' | 'SCRAP' | 'VENDOR';
  notes?: string | null;
}, db?: SupabaseClient) {
  const admin = adminClient(db);
  const { data: item } = await admin
    .from('part_dispatch_items')
    .select('*, dispatch:dispatch_id(service_order_id)')
    .eq('id', opts.dispatchItemId)
    .maybeSingle();
  if (!item) throw new BusinessException('Ítem de despacho no encontrado');
  if (item.return_status !== 'PENDING') {
    throw new BusinessException('Este ítem no tiene retorno pendiente');
  }

  const status = opts.status || 'RECEIVED';
  const { data: ret, error } = await admin
    .from('part_returns')
    .insert({
      dispatch_item_id: item.id,
      catalog_id: item.catalog_id,
      service_order_id: (item as any).dispatch?.service_order_id ?? null,
      qty: item.qty,
      status,
      received_by: opts.userId || null,
      received_by_name: opts.userName || null,
      evaluation_notes: opts.notes || null,
    })
    .select('*')
    .single();
  if (error || !ret) throw new BusinessException(error?.message || 'No se pudo registrar retorno');

  await admin
    .from('part_dispatch_items')
    .update({ return_status: status === 'RECEIVED' ? 'RECEIVED' : status })
    .eq('id', item.id);

  await writeMovement(admin, {
    catalog_id: String(item.catalog_id),
    movement_type: status === 'SCRAP' ? 'SCRAP' : status === 'VENDOR' ? 'VENDOR_RETURN' : 'RETURN_BAD',
    qty: Number(item.qty),
    source_type: item.source_type === 'RECOVERED' ? 'RECOVERED' : 'NEW',
    unit_cost: Number(item.unit_cost ?? 0),
    service_order_id: (item as any).dispatch?.service_order_id,
    ref_type: 'part_return',
    ref_id: ret.id,
    created_by: opts.userId,
    notes: opts.notes,
  });

  return ret;
}

export async function listPartReturns(db?: SupabaseClient) {
  const admin = adminClient(db);
  const { data, error } = await admin
    .from('part_returns')
    .select(
      `*,
      catalog:catalog_id(id, sku, name),
      service_orders:service_order_id(id, os_label)`
    )
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new BusinessException(error.message);
  return data ?? [];
}

export async function createPurchaseOrder(opts: {
  poNumber: string;
  supplier?: string | null;
  notes?: string | null;
  userId?: string | null;
  items: Array<{ catalogId: string; qty: number; unitCost: number }>;
}, db?: SupabaseClient) {
  const admin = adminClient(db);
  if (!opts.poNumber?.trim() || !opts.items?.length) {
    throw new ValidationException('PO y al menos un ítem son obligatorios');
  }
  const { data: po, error } = await admin
    .from('purchase_orders')
    .insert({
      po_number: opts.poNumber.trim().toUpperCase(),
      supplier: opts.supplier || null,
      notes: opts.notes || null,
      created_by: opts.userId || null,
      status: 'OPEN',
    })
    .select('*')
    .single();
  if (error || !po) throw new BusinessException(error?.message || 'No se pudo crear PO');

  const rows = opts.items.map((i) => ({
    po_id: po.id,
    catalog_id: i.catalogId,
    qty_ordered: i.qty,
    unit_cost: i.unitCost,
  }));
  const { error: iErr } = await admin.from('purchase_order_items').insert(rows);
  if (iErr) throw new BusinessException(iErr.message);
  return po;
}

export async function listPurchaseOrders(db?: SupabaseClient) {
  const admin = adminClient(db);
  const { data, error } = await admin
    .from('purchase_orders')
    .select(
      `*,
      items:purchase_order_items(*, catalog:catalog_id(id, sku, name))`
    )
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new BusinessException(error.message);
  return data ?? [];
}

export async function receivePurchaseOrder(opts: {
  poId: string;
  userId?: string | null;
  notes?: string | null;
  items?: Array<{ poItemId: string; qty: number }>;
}, db?: SupabaseClient) {
  const admin = adminClient(db);
  const { data: po } = await admin
    .from('purchase_orders')
    .select('*, items:purchase_order_items(*)')
    .eq('id', opts.poId)
    .maybeSingle();
  if (!po) throw new BusinessException('PO no encontrada');

  const { data: receipt, error: rErr } = await admin
    .from('purchase_receipts')
    .insert({
      po_id: po.id,
      received_by: opts.userId || null,
      notes: opts.notes || null,
    })
    .select('*')
    .single();
  if (rErr || !receipt) throw new BusinessException(rErr?.message || 'No se pudo crear recepción');

  const receiveMap = new Map(
    (opts.items || []).map((i) => [i.poItemId, i.qty])
  );

  for (const item of po.items || []) {
    const pending = Number(item.qty_ordered) - Number(item.qty_received);
    if (pending <= 0) continue;
    const qty = receiveMap.size > 0 ? (receiveMap.get(item.id) ?? 0) : pending;
    if (qty <= 0) continue;
    if (qty > pending) throw new BusinessException(`Cantidad excesiva para ítem ${item.id}`);

    await admin.from('purchase_receipt_items').insert({
      receipt_id: receipt.id,
      po_item_id: item.id,
      catalog_id: item.catalog_id,
      qty,
      unit_cost: item.unit_cost,
    });
    await admin
      .from('purchase_order_items')
      .update({ qty_received: Number(item.qty_received) + qty })
      .eq('id', item.id);

    await adjustPartsInventory(
      {
        catalogId: String(item.catalog_id),
        qtyDelta: qty,
        unitCost: Number(item.unit_cost),
        movementType: 'IN_PURCHASE',
        userId: opts.userId,
        notes: `Recepción PO ${po.po_number}`,
      },
      admin
    );
  }

  const { data: refreshed } = await admin
    .from('purchase_order_items')
    .select('qty_ordered, qty_received')
    .eq('po_id', po.id);
  const allReceived = (refreshed || []).every(
    (i) => Number(i.qty_received) >= Number(i.qty_ordered)
  );
  const anyReceived = (refreshed || []).some((i) => Number(i.qty_received) > 0);
  await admin
    .from('purchase_orders')
    .update({
      status: allReceived ? 'RECEIVED' : anyReceived ? 'PARTIAL' : 'OPEN',
      updated_at: new Date().toISOString(),
    })
    .eq('id', po.id);

  return receipt;
}

export async function getPartsAnalytics(db?: SupabaseClient) {
  const admin = adminClient(db);
  const [catalog, pendingReqs, pendingReturns, dispatches, purchases] = await Promise.all([
    listPartsCatalog(admin, { activeOnly: false }),
    admin.from('part_requests').select('id', { count: 'exact', head: true }).in('status', ['PENDING', 'PARTIAL']),
    admin.from('part_dispatch_items').select('id', { count: 'exact', head: true }).eq('return_status', 'PENDING'),
    admin
      .from('part_dispatch_items')
      .select('catalog_id, qty, unit_cost, created_at, catalog:catalog_id(sku, name)')
      .order('created_at', { ascending: false })
      .limit(500),
    admin
      .from('purchase_order_items')
      .select('catalog_id, qty_ordered, qty_received, unit_cost, catalog:catalog_id(sku, name), po:po_id(po_number, status, created_at)')
      .limit(500),
  ]);

  const consumptionMap = new Map<string, { sku: string; name: string; qty: number; cost: number }>();
  for (const row of dispatches.data || []) {
    const id = String(row.catalog_id);
    const prev = consumptionMap.get(id) || {
      sku: (row as any).catalog?.sku || id,
      name: (row as any).catalog?.name || '',
      qty: 0,
      cost: 0,
    };
    prev.qty += Number(row.qty);
    prev.cost += Number(row.qty) * Number(row.unit_cost || 0);
    consumptionMap.set(id, prev);
  }

  const purchaseMap = new Map<string, { sku: string; name: string; qty: number; cost: number }>();
  for (const row of purchases.data || []) {
    const id = String(row.catalog_id);
    const prev = purchaseMap.get(id) || {
      sku: (row as any).catalog?.sku || id,
      name: (row as any).catalog?.name || '',
      qty: 0,
      cost: 0,
    };
    prev.qty += Number(row.qty_received || row.qty_ordered || 0);
    prev.cost += Number(row.qty_received || row.qty_ordered || 0) * Number(row.unit_cost || 0);
    purchaseMap.set(id, prev);
  }

  const reorderAlerts = catalog
    .map((c: any) => {
      const available = Number(c.qty_available ?? 0);
      const min = Number(c.stock_min ?? 0);
      const reorder = Number(c.reorder_point ?? min);
      const max = Number(c.stock_max ?? 0);
      const lead = Number(c.lead_time_days ?? 0);
      const weeklyDemand = (consumptionMap.get(c.id)?.qty || 0) / 8; // approx 8 weeks window of last 500
      const suggested = Math.max(
        0,
        Math.ceil(weeklyDemand * (lead / 7) + reorder - available)
      );
      const below = available < reorder || available < min;
      return {
        catalog_id: c.id,
        sku: c.sku,
        name: c.name,
        qty_available: available,
        qty_on_hand: c.qty_on_hand,
        qty_reserved: c.qty_reserved,
        stock_min: min,
        reorder_point: reorder,
        stock_max: max,
        lead_time_days: lead,
        suggested_qty: suggested,
        below,
      };
    })
    .filter((a) => a.below);

  const noStockPending = (await admin
    .from('part_request_items')
    .select('id, catalog_id, qty_requested, catalog:catalog_id(sku, name), request:request_id!inner(status)')
    .eq('status', 'PENDING')
    .eq('request.status', 'PENDING')).data;

  const withoutStock = (noStockPending || []).filter((item: any) => {
    const cat = catalog.find((c: any) => c.id === item.catalog_id);
    return !cat || Number(cat.qty_available) < Number(item.qty_requested);
  });

  return {
    alerts: {
      os_waiting: pendingReqs.count ?? 0,
      returns_pending: pendingReturns.count ?? 0,
      below_min: reorderAlerts.length,
      requests_without_stock: withoutStock.length,
      reserved_skus: catalog.filter((c: any) => Number(c.qty_reserved) > 0).length,
    },
    consumption: [...consumptionMap.values()].sort((a, b) => b.cost - a.cost),
    purchases: [...purchaseMap.values()].sort((a, b) => b.cost - a.cost),
    reorderAlerts,
    inventory: catalog,
  };
}

export async function getOsPartStatus(serviceOrderId: string, db?: SupabaseClient) {
  const admin = adminClient(db);
  const { data: requests } = await admin
    .from('part_requests')
    .select(
      `*,
      items:part_request_items(*, catalog:catalog_id(sku, name)),
      dispatches:part_dispatches(
        id, dispatch_number, created_at,
        items:part_dispatch_items(id, return_required, return_status, catalog:catalog_id(sku, name), qty)
      )`
    )
    .eq('service_order_id', serviceOrderId)
    .order('created_at', { ascending: false });
  const openRequest = (requests || []).find((r) =>
    ['PENDING', 'PARTIAL'].includes(String(r.status))
  );
  const pendingReturns: any[] = [];
  for (const r of requests || []) {
    for (const d of (r as any).dispatches || []) {
      for (const it of d.items || []) {
        if (it.return_status === 'PENDING') pendingReturns.push(it);
      }
    }
  }
  return {
    requests: requests || [],
    hasOpenRequest: Boolean(openRequest),
    pendingReturns,
    // Solicitar piezas es opcional. Solo un retorno físico pendiente conserva
    // el bloqueo para evitar perder trazabilidad de la pieza reemplazada.
    canAdvance: pendingReturns.length === 0,
  };
}

export async function updatePartsLocation(opts: {
  catalogId: string;
  location: string | null;
}, db?: SupabaseClient) {
  const admin = adminClient(db);
  if (!opts.catalogId) throw new ValidationException('catalogId requerido');
  const inv = await ensureInventoryRow(admin, opts.catalogId);
  const location = opts.location?.trim() || null;
  const { error } = await admin
    .from('parts_inventory')
    .update({ location, updated_at: new Date().toISOString() })
    .eq('id', inv.id);
  if (error) throw new BusinessException(error.message);
  return { catalog_id: opts.catalogId, location };
}

/**
 * Elimina/desactiva pieza.
 * - Sin stock ni reservado: desactiva de inmediato.
 * - Con stock: crea solicitud pendiente en Autorizaciones.
 */
export async function deleteOrRequestPartDeletion(opts: {
  catalogId: string;
  reason: string;
  observations?: string | null;
  userId?: string | null;
}, db?: SupabaseClient) {
  const admin = adminClient(db);
  const reason = String(opts.reason || '').trim();
  if (!opts.catalogId) throw new ValidationException('catalogId requerido');
  if (reason.length < 5) {
    throw new ValidationException('Indique el motivo de eliminación (mín. 5 caracteres)');
  }

  const { data: catalog } = await admin
    .from('parts_catalog')
    .select('id, sku, name, active')
    .eq('id', opts.catalogId)
    .maybeSingle();
  if (!catalog) throw new BusinessException('Pieza no encontrada');

  const inv = await ensureInventoryRow(admin, opts.catalogId);
  const onHand = Number(inv.qty_on_hand);
  const reserved = Number(inv.qty_reserved);
  if (reserved > 0) {
    throw new BusinessException('No se puede eliminar: hay cantidad reservada. Libere reservas primero.');
  }

  const { data: pending } = await admin
    .from('part_deletion_requests')
    .select('id')
    .eq('catalog_id', opts.catalogId)
    .eq('status', 'pending')
    .maybeSingle();
  if (pending) {
    throw new BusinessException('Ya existe una solicitud de eliminación pendiente para esta pieza');
  }

  if (onHand <= 0) {
    const { error } = await admin
      .from('parts_catalog')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', opts.catalogId);
    if (error) throw new BusinessException(error.message);
    return {
      mode: 'deleted' as const,
      catalog_id: opts.catalogId,
      message: 'Pieza desactivada (sin stock).',
    };
  }

  const { data: req, error } = await admin
    .from('part_deletion_requests')
    .insert({
      catalog_id: opts.catalogId,
      sku: catalog.sku,
      part_name: catalog.name,
      qty_on_hand: onHand,
      reason,
      observations: opts.observations || null,
      requested_by: opts.userId || null,
      status: 'pending',
    })
    .select('*')
    .single();
  if (error || !req) throw new BusinessException(error?.message || 'No se pudo crear solicitud');

  // Notificar a Gerente General (si hay helper de usuarios)
  try {
    const { data: ggIds } = await admin.rpc('app_gerente_general_user_ids');
    const ids = Array.isArray(ggIds) ? ggIds : [];
    if (ids.length > 0) {
      await admin.from('erp_notifications').insert(
        ids.map((uid: string) => ({
          user_id: uid,
          title: 'Eliminación de pieza pendiente',
          body: `${catalog.sku} · ${catalog.name} (stock ${onHand})`,
          kind: 'part_deletion_request',
          link: '/autorizaciones',
          payload: { request_id: req.id, catalog_id: opts.catalogId },
        }))
      );
    }
  } catch {
    /* notificación opcional */
  }

  return {
    mode: 'authorization_required' as const,
    request: req,
    message: 'Solicitud enviada a Autorizaciones (hay stock).',
  };
}

export async function listPartDeletionRequests(
  status: string = 'pending',
  limit = 100,
  db?: SupabaseClient
) {
  const admin = adminClient(db);
  let q = admin
    .from('part_deletion_requests')
    .select('*')
    .order('requested_at', { ascending: false })
    .limit(limit);
  if (status && status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new BusinessException(error.message);
  return data ?? [];
}

export async function reviewPartDeletion(opts: {
  requestId: string;
  decision: 'approve' | 'reject';
  reviewNotes?: string | null;
  userId?: string | null;
}, db?: SupabaseClient) {
  const admin = adminClient(db);
  const { data: req } = await admin
    .from('part_deletion_requests')
    .select('*')
    .eq('id', opts.requestId)
    .maybeSingle();
  if (!req) throw new BusinessException('Solicitud no encontrada');
  if (req.status !== 'pending') throw new BusinessException(`Solicitud ya ${req.status}`);

  if (opts.decision === 'reject') {
    const { error } = await admin
      .from('part_deletion_requests')
      .update({
        status: 'rejected',
        reviewed_by: opts.userId || null,
        reviewed_at: new Date().toISOString(),
        review_notes: opts.reviewNotes || null,
      })
      .eq('id', req.id);
    if (error) throw new BusinessException(error.message);
    return { status: 'rejected', catalog_id: req.catalog_id };
  }

  const inv = await ensureInventoryRow(admin, String(req.catalog_id));
  if (Number(inv.qty_reserved) > 0) {
    throw new BusinessException('No se puede aprobar: hay cantidad reservada');
  }
  const onHand = Number(inv.qty_on_hand);
  if (onHand > 0) {
    await admin
      .from('parts_inventory')
      .update({
        qty_on_hand: 0,
        qty_reserved: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', inv.id);
    await writeMovement(admin, {
      catalog_id: String(req.catalog_id),
      movement_type: 'OUT_ADJUST',
      qty: onHand,
      notes: `Eliminación aprobada: ${req.reason}`,
      created_by: opts.userId,
      ref_type: 'part_deletion',
      ref_id: req.id,
    });
  }

  await admin
    .from('parts_catalog')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', req.catalog_id);

  const { error } = await admin
    .from('part_deletion_requests')
    .update({
      status: 'approved',
      reviewed_by: opts.userId || null,
      reviewed_at: new Date().toISOString(),
      review_notes: opts.reviewNotes || null,
    })
    .eq('id', req.id);
  if (error) throw new BusinessException(error.message);

  return { status: 'approved', catalog_id: req.catalog_id };
}

export type ListPartMovementsOpts = {
  q?: string;
  catalogId?: string;
  movementType?: string;
  limit?: number;
};

/** Historial de movimientos de bodega de partes (ajustes, ingresos, despachos, retornos). */
export async function listPartMovements(opts?: ListPartMovementsOpts, db?: SupabaseClient) {
  const admin = adminClient(db);
  const limit = Math.min(Math.max(opts?.limit ?? 300, 1), 500);

  let query = admin
    .from('part_movements')
    .select(
      `id, catalog_id, movement_type, qty, source_type, unit_cost, service_order_id, series_id,
       ref_type, ref_id, notes, created_by, created_at,
       catalog:catalog_id(id, sku, name),
       service_orders:service_order_id(id, os_label),
       series:series_id(id, serial_number)`
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (opts?.catalogId) query = query.eq('catalog_id', opts.catalogId);
  if (opts?.movementType) query = query.eq('movement_type', opts.movementType);

  const { data, error } = await query;
  if (error) throw new BusinessException(error.message);

  const rows = data ?? [];
  const userIds = rows.map((r: { created_by?: string | null }) => r.created_by).filter(Boolean) as string[];
  const names = await resolveProfileDisplayNames(userIds, admin);

  const mapped = rows.map((row: any) => {
    const catalog = Array.isArray(row.catalog) ? row.catalog[0] : row.catalog;
    const so = Array.isArray(row.service_orders) ? row.service_orders[0] : row.service_orders;
    const series = Array.isArray(row.series) ? row.series[0] : row.series;
    return {
      id: row.id,
      catalog_id: row.catalog_id,
      movement_type: row.movement_type,
      qty: Number(row.qty ?? 0),
      source_type: row.source_type ?? 'NEW',
      unit_cost: Number(row.unit_cost ?? 0),
      notes: row.notes ?? null,
      ref_type: row.ref_type ?? null,
      ref_id: row.ref_id ?? null,
      created_at: row.created_at,
      created_by: row.created_by ?? null,
      created_by_name: row.created_by ? names[row.created_by] || '—' : '—',
      sku: catalog?.sku ?? null,
      part_name: catalog?.name ?? null,
      service_order_id: row.service_order_id ?? null,
      os_label: so?.os_label ?? null,
      series_id: row.series_id ?? null,
      serial_number: series?.serial_number ?? null,
    };
  });

  const q = opts?.q?.trim().toLowerCase();
  if (!q) return mapped;
  return mapped.filter((r) =>
    [r.sku, r.part_name, r.os_label, r.serial_number, r.created_by_name, r.notes, r.movement_type, r.source_type]
      .filter(Boolean)
      .some((x) => String(x).toLowerCase().includes(q))
  );
}

