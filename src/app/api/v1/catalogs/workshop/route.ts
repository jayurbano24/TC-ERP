import { NextResponse } from 'next/server';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_TALLER } from '@/shared/authz/roleGuard';
import { fetchWorkshopOperationCatalogs } from '@/modules/workshop/server/workshopTasksService';
import { estimateJsonBytes, logEgress } from '@/shared/infrastructure/http/egressLog';
import { getCorrelationIdFromHeaders } from '@/shared/infrastructure/http/correlationId';

export const GET = withErrorHandler(
  async (req: Request) => {
    const started = Date.now();
    const correlationId = getCorrelationIdFromHeaders(req.headers);
    const route = '/api/v1/catalogs/workshop';

    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const { supabase } = auth;

    if (!supabase) {
      return NextResponse.json({ error: 'SERVER_CLIENT_REQUIRED' }, { status: 500 });
    }

    const responseBody = await fetchWorkshopOperationCatalogs(supabase);

    logEgress({
      route,
      module: 'catalogs',
      action: 'workshop',
      correlationId,
      rowCount:
        responseBody.diagnostics.length +
        responseBody.repairs.length +
        responseBody.reacondicionadoTests.length,
      bytesEstimate: estimateJsonBytes(responseBody),
      durationMs: Date.now() - started,
      status: 200,
    });

    return NextResponse.json(responseBody, {
      headers: { 'Cache-Control': 'private, max-age=1800' },
    });
  },
  { module: 'catalogs', action: 'workshop', roles: ROLES_TALLER }
);
