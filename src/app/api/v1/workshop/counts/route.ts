import { NextResponse } from 'next/server';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_TALLER } from '@/shared/authz/roleGuard';
import { estimateJsonBytes, logEgress } from '@/shared/infrastructure/http/egressLog';
import { getCorrelationIdFromHeaders } from '@/shared/infrastructure/http/correlationId';

export const GET = withErrorHandler(
  async (req: Request) => {
    const started = Date.now();
    const correlationId = getCorrelationIdFromHeaders(req.headers);
    const route = '/api/v1/workshop/counts';

    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const { supabase } = auth;

    if (!supabase) {
      return NextResponse.json({ error: 'SERVER_CLIENT_REQUIRED' }, { status: 500 });
    }

    const { data, error } = await supabase.rpc('count_workshop_os_all_tabs');

    if (error?.code === '42883' || error?.code === 'PGRST202') {
      return NextResponse.json(
        { error: 'RPC_NOT_DEPLOYED', detail: 'Aplicar migración 087 en Supabase' },
        { status: 503 }
      );
    }

    if (error) {
      return NextResponse.json({ error: 'QUERY_FAILED', detail: error.message }, { status: 500 });
    }

    const counts = (data ?? {}) as Record<string, number>;
    const responseBody = { counts };

    logEgress({
      route,
      module: 'taller',
      action: 'counts',
      correlationId,
      rowCount: Object.keys(counts).length,
      bytesEstimate: estimateJsonBytes(responseBody),
      durationMs: Date.now() - started,
      status: 200,
    });

    return NextResponse.json(responseBody);
  },
  { module: 'taller', action: 'counts', roles: ROLES_TALLER }
);
