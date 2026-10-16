import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import {
  createPartHarvestSession,
  listPartHarvestSessions,
  listHarvestUsageForSession,
} from '@/modules/parts/server/partsHarvestService';

const PostBody = z.object({
  seriesId: z.string().uuid(),
  sessionNotes: z.string().max(500).optional().nullable(),
  lines: z
    .array(
      z.object({
        catalogId: z.string().uuid(),
        qty: z.number().int().positive(),
        notes: z.string().max(200).optional().nullable(),
      })
    )
    .min(1)
    .max(40),
});

export const GET = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');
    if (sessionId) {
      const usage = await listHarvestUsageForSession(sessionId);
      return NextResponse.json({ usage });
    }
    const items = await listPartHarvestSessions(50);
    return NextResponse.json({ items });
  },
  { module: 'parts', action: 'harvest_list', roles: ROLES_BODEGA_DESPACHO }
);

export const POST = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const raw = await req.json();
    const parsed = PostBody.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', issues: parsed.error.flatten() }, { status: 400 });
    }
    const profileName =
      typeof auth.user?.user_metadata?.full_name === 'string'
        ? auth.user.user_metadata.full_name
        : auth.user?.email ?? null;
    const result = await createPartHarvestSession({
      seriesId: parsed.data.seriesId,
      sessionNotes: parsed.data.sessionNotes,
      lines: parsed.data.lines,
      userId: auth.user?.id ?? null,
      userName: profileName,
    });
    return NextResponse.json({ success: true, ...result });
  },
  { module: 'parts', action: 'harvest_create', roles: ROLES_BODEGA_DESPACHO }
);
