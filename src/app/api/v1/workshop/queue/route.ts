import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_TALLER } from '@/shared/authz/roleGuard';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';
import { estimateJsonBytes, logEgress } from '@/shared/infrastructure/http/egressLog';
import { getCorrelationIdFromHeaders } from '@/shared/infrastructure/http/correlationId';

const TAB_STATUS: Record<string, string> = {
  diagnostico: 'in_workshop',
  reparacion: 'in_qc',
  qc: 'in_validation',
  reacondicionado: 'ready_to_dispatch',
  l3: 'in_control_warehouse',
  scraps: 'irreparable',
};

const QueueQuery = z.object({
  tab: z
    .enum(['diagnostico', 'reparacion', 'qc', 'reacondicionado', 'l3', 'scraps'])
    .default('diagnostico'),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(BATCH_LIMITS.API_PAGE_MAX).default(BATCH_LIMITS.API_PAGE_DEFAULT),
});

export const GET = withErrorHandler(
  async (req: Request) => {
    const started = Date.now();
    const correlationId = getCorrelationIdFromHeaders(req.headers);
    const route = '/api/v1/workshop/queue';

    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const { supabase } = auth;

    if (!supabase) {
      return NextResponse.json({ error: 'SERVER_CLIENT_REQUIRED' }, { status: 500 });
    }

    const parsed = QueueQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { tab, cursor, limit } = parsed.data;
    const status = TAB_STATUS[tab];

    const [{ data: items, error }, { data: totalOs, error: countError }] = await Promise.all([
      supabase.rpc('workshop_list_os_queue_page', {
        p_status: status,
        p_cursor: cursor ?? null,
        p_limit: limit + 1,
      }),
      supabase.rpc('count_workshop_os_by_status', { p_status: status }),
    ]);

    if (error?.code === '42883' || error?.code === 'PGRST202') {
      return NextResponse.json(
        { error: 'RPC_NOT_DEPLOYED', detail: 'Aplicar migración 087 en Supabase' },
        { status: 503 }
      );
    }

    if (error) {
      return NextResponse.json({ error: 'QUERY_FAILED', detail: error.message }, { status: 500 });
    }

    if (countError && countError.code !== '42883' && countError.code !== 'PGRST202') {
      console.warn('[workshop/queue] count RPC failed:', countError.message);
    }

    const rows = items ?? [];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, -1) : rows;

    const responseBody = {
      items: page,
      totalOs: totalOs ?? null,
      nextCursor: hasMore ? page[page.length - 1]?.service_order_id : null,
    };

    logEgress({
      route,
      module: 'taller',
      action: 'list_queue',
      correlationId,
      rowCount: page.length,
      bytesEstimate: estimateJsonBytes(responseBody),
      durationMs: Date.now() - started,
      status: 200,
    });

    return NextResponse.json(responseBody);
  },
  { module: 'taller', action: 'list_queue', roles: ROLES_TALLER }
);
