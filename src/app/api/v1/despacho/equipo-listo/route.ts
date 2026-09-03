import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { queryWorkshopTasksPage, fetchEquipoListoByTechnology } from '@/modules/workshop/server/workshopTasksService';
import { estimateJsonBytes, logEgress } from '@/shared/infrastructure/http/egressLog';
import { getCorrelationIdFromHeaders } from '@/shared/infrastructure/http/correlationId';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';
import { getWorkshopReadClient } from '@/shared/infrastructure/workshop/workshopReadClient';
import { WORKSHOP_SEARCH_Q_MAX_CHARS } from '@/modules/workshop/shared/workshopSearch';

const ListQuery = z.object({
  cursor: z.string().max(64).optional(),
  q: z.string().max(WORKSHOP_SEARCH_Q_MAX_CHARS).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(BATCH_LIMITS.API_PAGE_MAX)
    .default(BATCH_LIMITS.WORKSHOP_QUEUE_PAGE_OS),
});

/**
 * Cola Equipo Listo para Despacho (status in_central_warehouse vía Taller QC).
 * Reutiliza el SSOT de workshop listo; roles de Bodega/Despacho.
 */
export const GET = withErrorHandler(
  async (req: Request) => {
    const started = Date.now();
    const correlationId = getCorrelationIdFromHeaders(req.headers);
    const route = '/api/v1/despacho/equipo-listo';

    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;

    const parsed = ListQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { cursor, limit, q } = parsed.data;
    const db = getWorkshopReadClient();

    // KPIs por tecnología solo en primera página (sin cursor) — evita costo en paginación Excel.
    const [page, byTechnology] = await Promise.all([
      queryWorkshopTasksPage(db, 'listo', {
        cursor: cursor ?? null,
        limit,
        search: q,
      }),
      !cursor
        ? fetchEquipoListoByTechnology(db)
        : Promise.resolve([] as Awaited<ReturnType<typeof fetchEquipoListoByTechnology>>),
    ]);

    const responseBody = {
      ...page,
      byTechnology,
    };

    logEgress({
      route,
      module: 'despacho',
      action: 'list_equipo_listo',
      correlationId,
      rowCount: page.items.length,
      bytesEstimate: estimateJsonBytes(responseBody),
      durationMs: Date.now() - started,
      status: 200,
    });

    return NextResponse.json(responseBody);
  },
  { module: 'despacho', action: 'list_equipo_listo', roles: ROLES_BODEGA_DESPACHO }
);
