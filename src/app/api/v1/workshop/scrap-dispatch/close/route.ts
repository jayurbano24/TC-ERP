import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { closeScrapBox } from '@/modules/workshop/server/closeScrapBox';
import { resolveSessionActor } from '@/shared/infrastructure/session/resolveSessionActor';
import { estimateJsonBytes, logEgress } from '@/shared/infrastructure/http/egressLog';
import { getCorrelationIdFromHeaders } from '@/shared/infrastructure/http/correlationId';

const BodySchema = z.object({
  box_id: z.string().uuid(),
  /** Ajusta capacity = equipos actuales (cierra parciales cuando ya se pistoleó todo). */
  resize_capacity_to_contents: z.boolean().optional().default(false),
});

export const POST = withErrorHandler(
  async (req: Request) => {
    const started = Date.now();
    const correlationId = getCorrelationIdFromHeaders(req.headers);
    const route = '/api/v1/workshop/scrap-dispatch/close';

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
      const result = await closeScrapBox(supabase, {
        boxId: parsed.data.box_id,
        resizeCapacityToContents: parsed.data.resize_capacity_to_contents,
        userId: user.id,
        userRole: roleData?.role,
        operatorName: actor.fullName,
      });

      const responseBody = {
        success: true,
        box_id: result.boxId,
        box_code: result.boxCode,
        equipos_count: result.equiposCount,
        capacity: result.capacity,
        resized: result.resized,
      };

      logEgress({
        route,
        module: 'bodega',
        action: 'scrap_close',
        correlationId,
        rowCount: result.equiposCount,
        bytesEstimate: estimateJsonBytes(responseBody),
        durationMs: Date.now() - started,
        status: 200,
      });

      return NextResponse.json(responseBody);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'SCRAP_CLOSE_FAILED';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  },
  { module: 'bodega', action: 'scrap_close', roles: ROLES_BODEGA_DESPACHO }
);
