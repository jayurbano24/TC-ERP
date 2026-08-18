import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_TALLER } from '@/shared/authz/roleGuard';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';
import { assertUuidArray } from '@/shared/infrastructure/http/batchLimit';
import { createScrapDispatchBox } from '@/modules/workshop/server/scrapDispatchService';
import { resolveSessionActor } from '@/shared/infrastructure/session/resolveSessionActor';
import { estimateJsonBytes, logEgress } from '@/shared/infrastructure/http/egressLog';
import { getCorrelationIdFromHeaders } from '@/shared/infrastructure/http/correlationId';

const ScrapDispatchBody = z.object({
  series_ids: z.array(z.string().uuid()).min(1),
  brand_id: z.string().uuid(),
  model_id: z.string().uuid(),
  capacity: z.coerce.number().int().min(1).max(500),
  /** Referencia opcional (no es el Nº de caja; el código BOX-N lo asigna el servidor). */
  reference: z.string().trim().max(80).optional().default(''),
  conduce: z.string().trim().max(80).optional().default(''),
  notes: z.string().max(2000).optional().default(''),
});

export const POST = withErrorHandler(
  async (req: Request) => {
    const started = Date.now();
    const correlationId = getCorrelationIdFromHeaders(req.headers);
    const route = '/api/v1/workshop/scrap-dispatch';

    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const { user, supabase } = auth;

    if (!supabase) {
      return NextResponse.json({ error: 'SERVER_CLIENT_REQUIRED' }, { status: 500 });
    }

    const raw = await req.json().catch(() => null);
    const parsed = ScrapDispatchBody.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { series_ids, brand_id, model_id, capacity, reference, conduce, notes } = parsed.data;

    if (series_ids.length > BATCH_LIMITS.WORKSHOP_SCRAP_DISPATCH_MAX_SERIES) {
      return NextResponse.json(
        {
          error: 'BATCH_TOO_LARGE',
          detail: `Máximo ${BATCH_LIMITS.WORKSHOP_SCRAP_DISPATCH_MAX_SERIES} series por caja SCRAPS; recibidos ${series_ids.length}`,
          max: BATCH_LIMITS.WORKSHOP_SCRAP_DISPATCH_MAX_SERIES,
        },
        { status: 400 }
      );
    }

    // Capacidad de caja SCRAPS > UUID_IN_CLAUSE; el service ya chunk-ea los updates.
    assertUuidArray(series_ids, 'series_ids', BATCH_LIMITS.WORKSHOP_SCRAP_DISPATCH_MAX_SERIES);

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    const actor = await resolveSessionActor(user);

    try {
      const result = await createScrapDispatchBox(supabase, {
        seriesIds: series_ids,
        brandId: brand_id,
        modelId: model_id,
        capacity,
        reference: reference || conduce || undefined,
        notes,
        userId: user.id,
        userRole: roleData?.role,
        operatorName: actor.fullName,
      });

      const responseBody = {
        success: true,
        box_id: result.boxId,
        box_code: result.boxCode,
        linked: result.linked,
        capacity: result.capacity,
      };

      logEgress({
        route,
        module: 'taller',
        action: 'scrap_ingress',
        correlationId,
        rowCount: result.linked,
        bytesEstimate: estimateJsonBytes(responseBody),
        durationMs: Date.now() - started,
        status: 200,
      });

      return NextResponse.json(responseBody);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'SCRAP_INGRESS_FAILED';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  },
  { module: 'taller', action: 'scrap_dispatch', roles: ROLES_TALLER }
);
