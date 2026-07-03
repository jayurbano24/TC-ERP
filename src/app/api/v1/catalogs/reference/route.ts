import { NextResponse } from 'next/server';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { fetchReferenceCatalogs } from '@/shared/infrastructure/catalogs/fetchReferenceCatalogs';
import { estimateJsonBytes, logEgress } from '@/shared/infrastructure/http/egressLog';
import { getCorrelationIdFromHeaders } from '@/shared/infrastructure/http/correlationId';

export const GET = withErrorHandler(
  async (req: Request) => {
    const started = Date.now();
    const correlationId = getCorrelationIdFromHeaders(req.headers);
    const route = '/api/v1/catalogs/reference';

    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const { supabase } = auth;

    if (!supabase) {
      return NextResponse.json({ error: 'SERVER_CLIENT_REQUIRED' }, { status: 500 });
    }

    const payload = await fetchReferenceCatalogs(supabase);
    const responseBody = payload;

    logEgress({
      route,
      module: 'catalogs',
      action: 'reference',
      correlationId,
      rowCount:
        payload.technologies.length + payload.brands.length + payload.models.length,
      bytesEstimate: estimateJsonBytes(responseBody),
      durationMs: Date.now() - started,
      status: 200,
    });

    return NextResponse.json(responseBody, {
      headers: {
        'Cache-Control': 'private, max-age=1800',
      },
    });
  },
  { module: 'catalogs', action: 'reference' }
);
