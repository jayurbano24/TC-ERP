import { NextResponse } from 'next/server';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { estimateJsonBytes, logEgress } from '@/shared/infrastructure/http/egressLog';
import { getCorrelationIdFromHeaders } from '@/shared/infrastructure/http/correlationId';

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
        created_at,
        dispatched_by,
        dispatch_items(count)
      `
      )
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'QUERY_FAILED', detail: error.message }, { status: 500 });
    }

    const items = data ?? [];
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
