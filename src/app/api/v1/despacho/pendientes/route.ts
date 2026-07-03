import 'reflect-metadata';
import { NextResponse } from 'next/server';
import { GetDespachosPendientesQuery } from '@/modules/despacho/application/queries/GetDespachosPendientesQuery';
import { RequestContextBuilder } from '@/shared/context/RequestContextBuilder';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { estimateJsonBytes, logEgress } from '@/shared/infrastructure/http/egressLog';
import { getCorrelationIdFromHeaders } from '@/shared/infrastructure/http/correlationId';
import { container } from '@/shared/di/container';

export const GET = withErrorHandler(
  async (req: Request) => {
    const started = Date.now();
    const correlationId = getCorrelationIdFromHeaders(req.headers);
    const route = '/api/v1/despacho/pendientes';

    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;

    const query = container.resolve(GetDespachosPendientesQuery);
    const ctx = new RequestContextBuilder()
      .withTenant('tenant-1')
      .withBranch('branch-1')
      .withUser(auth.user.id)
      .build();

    const items = await query.execute(ctx);
    const responseBody = { items };

    logEgress({
      route,
      module: 'despacho',
      action: 'pendientes',
      correlationId,
      rowCount: items.length,
      bytesEstimate: estimateJsonBytes(responseBody),
      durationMs: Date.now() - started,
      status: 200,
    });

    return NextResponse.json(responseBody);
  },
  { module: 'despacho', action: 'pendientes', roles: ROLES_BODEGA_DESPACHO }
);
