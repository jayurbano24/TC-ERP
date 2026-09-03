import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';
import { assertUuidArray } from '@/shared/infrastructure/http/batchLimit';

const BodySchema = z.object({
  os_ids: z.array(z.string().uuid()).min(1).max(200),
});

/**
 * Series hermanas por OS (para hidratar S1–S4 en detalle de caja).
 * No filtra por current_box_id: solo aporta seriales para slots.
 */
export const POST = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;

    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    assertUuidArray(parsed.data.os_ids, 'os_ids', 200);

    const db = getSupabaseServerClient();
    const items: Array<Record<string, unknown>> = [];
    const chunkSize = BATCH_LIMITS.UUID_IN_CLAUSE;

    for (let i = 0; i < parsed.data.os_ids.length; i += chunkSize) {
      const chunk = parsed.data.os_ids.slice(i, i + chunkSize);
      const { data, error } = await db
        .from('series')
        .select(
          'id, serial_number, s2, s3, s4, current_status, current_reception_id, service_order_id, model_id, brand_id, material, valuation, notes, sap_status, created_at'
        )
        .in('service_order_id', chunk)
        .order('created_at', { ascending: true });
      if (error) {
        return NextResponse.json({ error: 'QUERY_FAILED', detail: error.message }, { status: 500 });
      }
      items.push(...(data || []));
    }

    const osIds = [...new Set(items.map((s) => s.service_order_id).filter(Boolean))] as string[];
    const osMap = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < osIds.length; i += chunkSize) {
      const chunk = osIds.slice(i, i + chunkSize);
      const { data } = await db
        .from('service_orders')
        .select('id, os_label, reentry_count, main_serial, sap_integration_status')
        .in('id', chunk);
      for (const row of data || []) {
        osMap.set(String(row.id), row as Record<string, unknown>);
      }
    }

    const enriched = items.map((s) => ({
      ...s,
      service_orders: s.service_order_id
        ? osMap.get(String(s.service_order_id)) || null
        : null,
    }));

    return NextResponse.json({ items: enriched });
  },
  { module: 'bodega', action: 'series_by_os', roles: ROLES_BODEGA_DESPACHO }
);
