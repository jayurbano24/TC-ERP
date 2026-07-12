import { NextResponse } from 'next/server';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { estimateJsonBytes, logEgress } from '@/shared/infrastructure/http/egressLog';
import { getCorrelationIdFromHeaders } from '@/shared/infrastructure/http/correlationId';
import { resolveProfileDisplayNames } from '@/shared/infrastructure/profiles/resolveProfileDisplayNames';

function countEquiposByOs(
  items: Array<{ series?: { service_order_id?: string | null } | null; series_id?: string }> | null | undefined
): number {
  if (!items?.length) return 0;
  const keys = new Set<string>();
  for (const it of items) {
    const os = it.series?.service_order_id;
    if (os) keys.add(`os:${os}`);
    else if (it.series_id) keys.add(`s:${it.series_id}`);
  }
  return keys.size;
}

export const GET = withErrorHandler(
  async (req: Request) => {
    const started = Date.now();
    const correlationId = getCorrelationIdFromHeaders(req.headers);
    const route = '/api/v1/despacho/history';

    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const { supabase } = auth;

    if (!supabase) {
      return NextResponse.json({ error: 'SERVER_CLIENT_REQUIRED' }, { status: 500 });
    }

    const { data, error } = await supabase
      .from('dispatches')
      .select(
        `
        id,
        guide_number,
        dispatch_type,
        notes,
        dispatched_at,
        dispatched_by,
        box_id,
        boxes:box_id (
          id,
          box_code,
          brand_id,
          model_id,
          material,
          valuation,
          capacity
        ),
        dispatch_items (
          series_id,
          series:series_id (
            service_order_id
          )
        )
      `
      )
      .order('dispatched_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'QUERY_FAILED', detail: error.message }, { status: 500 });
    }

    const rows = data ?? [];
    const userIds = rows.map((r) => r.dispatched_by).filter(Boolean) as string[];
    const names = await resolveProfileDisplayNames(userIds);

    const items = rows.map((row: any) => {
      const box = Array.isArray(row.boxes) ? row.boxes[0] : row.boxes;
      return {
        id: row.id,
        guide_number: row.guide_number,
        dispatch_type: row.dispatch_type,
        notes: row.notes,
        dispatched_at: row.dispatched_at,
        created_at: row.dispatched_at,
        dispatched_by: row.dispatched_by,
        dispatched_by_name: (row.dispatched_by && names[row.dispatched_by]) || 'Sistema',
        box_id: row.box_id,
        box_code: box?.box_code ?? null,
        brand_id: box?.brand_id ?? null,
        model_id: box?.model_id ?? null,
        material: box?.material ?? null,
        valuation: box?.valuation ?? null,
        capacity: box?.capacity ?? null,
        equipos_count: countEquiposByOs(row.dispatch_items),
      };
    });

    const responseBody = { items };

    logEgress({
      route,
      module: 'despacho',
      action: 'history',
      correlationId,
      rowCount: items.length,
      bytesEstimate: estimateJsonBytes(responseBody),
      durationMs: Date.now() - started,
      status: 200,
    });

    return NextResponse.json(responseBody);
  },
  { module: 'despacho', action: 'history', roles: ROLES_BODEGA_DESPACHO }
);
