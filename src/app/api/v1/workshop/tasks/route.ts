import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_TALLER } from '@/shared/authz/roleGuard';
import {
  queryWorkshopTasksPage,
  type WorkshopTabId,
} from '@/modules/workshop/server/workshopTasksService';
import { estimateJsonBytes, logEgress } from '@/shared/infrastructure/http/egressLog';
import { getCorrelationIdFromHeaders } from '@/shared/infrastructure/http/correlationId';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';
import { getWorkshopReadClient } from '@/shared/infrastructure/workshop/workshopReadClient';
import { WORKSHOP_SEARCH_Q_MAX_CHARS } from '@/modules/workshop/shared/workshopSearch';

const TasksQuery = z.object({
  tab: z
    .enum([
      'diagnostico',
      'reparacion',
      'esperando_partes',
      'qc',
      'reacondicionado',
      'l3',
      'scraps',
      'listo',
    ])
    .default('diagnostico'),
  cursor: z.string().max(64).optional(),
  q: z.string().max(WORKSHOP_SEARCH_Q_MAX_CHARS).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(BATCH_LIMITS.API_PAGE_MAX)
    .default(BATCH_LIMITS.WORKSHOP_QUEUE_PAGE_OS),
});

export const GET = withErrorHandler(
  async (req: Request) => {
    const started = Date.now();
    const correlationId = getCorrelationIdFromHeaders(req.headers);
    const route = '/api/v1/workshop/tasks';

    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;

    const db = getWorkshopReadClient();

    const parsed = TasksQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const tab = parsed.data.tab as WorkshopTabId;
    const { cursor, limit, q } = parsed.data;
    const page = await queryWorkshopTasksPage(db, tab, {
      cursor: cursor ?? null,
      limit,
      search: q,
    });
    const responseBody = page;

    logEgress({
      route,
      module: 'taller',
      action: 'list_tasks',
      correlationId,
      rowCount: page.items.length,
      bytesEstimate: estimateJsonBytes(responseBody),
      durationMs: Date.now() - started,
      status: 200,
    });

    return NextResponse.json(responseBody);
  },
  { module: 'taller', action: 'list_tasks', roles: ROLES_TALLER }
);
