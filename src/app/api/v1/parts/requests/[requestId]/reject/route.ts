import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { rejectPartRequest } from '@/modules/parts/server/partsService';

type Ctx = { params: Promise<{ requestId: string }> };

const Body = z.object({
  reason: z.string().max(500).optional().nullable(),
});

export const POST = withErrorHandler(
  async (req: Request, context: Ctx) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const { requestId } = await context.params;
    if (!z.string().uuid().safeParse(requestId).success) {
      return NextResponse.json({ error: 'VALIDATION_ERROR' }, { status: 400 });
    }
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    const result = await rejectPartRequest({
      requestId,
      reason: parsed.success ? parsed.data.reason ?? undefined : undefined,
      userId: auth.user?.id ?? null,
    });
    return NextResponse.json(result);
  },
  { module: 'parts', action: 'request_reject', roles: ROLES_BODEGA_DESPACHO }
);
