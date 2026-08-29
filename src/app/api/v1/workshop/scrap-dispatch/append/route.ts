import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { appendScrapSeriesToBox } from '@/modules/workshop/server/appendScrapSeriesToBox';
import { resolveSessionActor } from '@/shared/infrastructure/session/resolveSessionActor';
import { estimateJsonBytes, logEgress } from '@/shared/infrastructure/http/egressLog';
import { getCorrelationIdFromHeaders } from '@/shared/infrastructure/http/correlationId';

const BodySchema = z
  .object({
    box_id: z.string().uuid(),
    series_id: z.string().uuid().optional(),
    serial_number: z.string().trim().min(2).max(80).optional(),
  })
  .refine((b) => Boolean(b.series_id || b.serial_number), {
    message: 'series_id o serial_number requerido',
  });

export const POST = withErrorHandler(
  async (req: Request) => {
    const started = Date.now();
    const correlationId = getCorrelationIdFromHeaders(req.headers);
    const route = '/api/v1/workshop/scrap-dispatch/append';

    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const { user, supabase } = auth;
    if (!supabase) {
      return NextResponse.json({ error: 'SERVER_CLIENT_REQUIRED' }, { status: 500 });
    }

    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    const actor = await resolveSessionActor(user);

    try {
      const result = await appendScrapSeriesToBox(supabase, {
        boxId: parsed.data.box_id,
        seriesId: parsed.data.series_id,
        serialNumber: parsed.data.serial_number,
        userId: user.id,
        userRole: roleData?.role,
        operatorName: actor.fullName,
      });

      const responseBody = {
        success: true,
        box_id: result.boxId,
        box_code: result.boxCode,
        linked: result.linked,
        equipos_count: result.equiposCount,
        capacity: result.capacity,
        closed: result.closed,
        slots: result.slots,
        os_label: result.osLabel,
      };

      logEgress({
        route,
        module: 'bodega',
        action: 'scrap_append',
        correlationId,
        rowCount: result.linked,
        bytesEstimate: estimateJsonBytes(responseBody),
        durationMs: Date.now() - started,
        status: 200,
      });

      return NextResponse.json(responseBody);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'SCRAP_APPEND_FAILED';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  },
  { module: 'bodega', action: 'scrap_append', roles: ROLES_BODEGA_DESPACHO }
);
