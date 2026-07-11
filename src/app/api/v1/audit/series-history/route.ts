import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { resolveReadClient } from '@/shared/infrastructure/http/resolveReadClient';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { querySeriesHistory } from '@/shared/infrastructure/audit/seriesHistoryServer';
import { estimateJsonBytes, logEgress } from '@/shared/infrastructure/http/egressLog';
import { getCorrelationIdFromHeaders } from '@/shared/infrastructure/http/correlationId';
import { ROLES_TALLER } from '@/shared/authz/roleGuard';

const HistoryQuery = z.object({
  ids: z
    .string()
    .min(1)
    .transform((s) =>
      s
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid()).min(1).max(50)),
});

export const GET = withErrorHandler(
  async (req: Request) => {
    const started = Date.now();
    const correlationId = getCorrelationIdFromHeaders(req.headers);
    const route = '/api/v1/audit/series-history';

    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;

    const parsed = HistoryQuery.safeParse(
      Object.fromEntries(new URL(req.url).searchParams)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { client: admin } = resolveReadClient(auth.supabase);
    const items = await querySeriesHistory(admin, parsed.data.ids);
    const responseBody = { items };

    logEgress({
      route,
      module: 'audit',
      action: 'series_history',
      correlationId,
      rowCount: items.length,
      bytesEstimate: estimateJsonBytes(responseBody),
      durationMs: Date.now() - started,
      status: 200,
    });

    return NextResponse.json(responseBody);
  },
  { module: 'audit', action: 'series_history', roles: ROLES_TALLER }
);
