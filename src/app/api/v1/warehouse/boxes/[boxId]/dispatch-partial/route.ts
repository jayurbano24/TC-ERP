import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { logOnlyRoleCheck, ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { warehouseBoxIdempotencyKey, asUuidOrNull } from '@/lib/database/warehouse';

const BodySchema = z.object({
  serialNumbers: z.array(z.string().trim().min(1)).min(1).max(500),
  destination: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(2000).optional().nullable(),
  dispatchBatchId: z.string().uuid().optional().nullable(),
});

/**
 * Despacho parcial por series (OS completo en RPC 180).
 * Usa service role tras auth para evitar cuelgues / RLS del browser RPC.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ boxId: string }> }
) {
  const auth = await requireApiUser(req);
  if (auth instanceof NextResponse) return auth;

  const roleCheck = await logOnlyRoleCheck(req, ROLES_BODEGA_DESPACHO, {
    module: 'bodega',
    action: 'dispatch_partial',
  });
  if (roleCheck) return roleCheck;

  const { boxId } = await params;
  if (!z.string().uuid().safeParse(boxId).success) {
    return NextResponse.json({ error: 'INVALID_BOX_ID' }, { status: 422 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', issues: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const uniqueSeries = [
    ...new Set(parsed.data.serialNumbers.map((s) => s.trim().toUpperCase()).filter(Boolean)),
  ];
  const destination = parsed.data.destination.trim();
  const db = getSupabaseServerClient();

  const { data: profile } = await db
    .from('profiles')
    .select('id, full_name')
    .eq('id', auth.user.id)
    .maybeSingle();

  const operatorId = asUuidOrNull(profile?.id ?? auth.user.id);
  const operatorName =
    (profile?.full_name as string | undefined) || auth.user.email || 'Operador';

  const idempotencyKey = warehouseBoxIdempotencyKey(
    boxId,
    'salida',
    `parcial:${destination}:${uniqueSeries.sort().join(',')}`
  );

  const { data, error } = await db.rpc('warehouse_salida_parcial_tx', {
    p_box_id: boxId,
    p_serial_numbers: uniqueSeries,
    p_destination: destination,
    p_guide_number: destination,
    p_operator_id: operatorId,
    p_operator_name: operatorName,
    p_notes: parsed.data.notes || null,
    p_idempotency_key: idempotencyKey,
    p_dispatch_batch_id: asUuidOrNull(parsed.data.dispatchBatchId),
  });

  if (error) {
    console.error('[dispatch-partial]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const payload = data as {
    success?: boolean;
    dispatch_id?: string;
    series_count?: number;
    equipos_remaining?: number;
    series_remaining?: number;
    capacity?: number;
    box_empty?: boolean;
  };

  if (!payload?.series_count || payload.series_count < 1) {
    return NextResponse.json(
      { error: 'Ninguna serie fue despachada. Verifique que pertenezcan a la caja.' },
      { status: 409 }
    );
  }

  // Cinturón: aunque el RPC ya sincroniza, forzar capacity = equipos restantes
  // para que ninguna salida parcial deje la caja en PARCIAL N/capacidad_vieja.
  let capacitySync: {
    equipos_remaining?: number;
    series_remaining?: number;
    capacity?: number;
    box_empty?: boolean;
  } | null = null;
  const { data: syncData, error: syncErr } = await db.rpc('warehouse_sync_box_capacity', {
    p_box_id: boxId,
  });
  if (syncErr) {
    console.warn('[dispatch-partial] capacity sync skipped:', syncErr.message);
  } else {
    capacitySync = syncData as typeof capacitySync;
  }

  return NextResponse.json({
    success: true,
    guideNumber: destination,
    ...payload,
    ...(capacitySync || {}),
  });
}
