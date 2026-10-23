import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import {
  createPartHarvestSession,
  createPartHarvestCase,
  listPartHarvestSessions,
  listHarvestUsageForSession,
} from '@/modules/parts/server/partsHarvestService';

const LineBody = z.object({
  catalogId: z.string().uuid(),
  qty: z.number().int().min(1).max(1),
  notes: z.string().max(200).optional().nullable(),
});

const PostBody = z.object({
  seriesId: z.string().uuid().optional(),
  donors: z.array(z.object({
    seriesId: z.string().uuid(),
    lines: z.array(LineBody).min(1).max(40),
  })).min(1).max(50).optional(),
  sessionNotes: z.string().max(500).optional().nullable(),
  lines: z.array(LineBody).min(1).max(40).optional(),
}).refine((data) => Boolean(data.donors?.length || (data.seriesId && data.lines?.length)), {
  message: 'Agregue al menos una serie donante con sus piezas.',
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
    const requestedLimit = Number(url.searchParams.get('limit') || 50);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 2000)
      : 50;
    const items = await listPartHarvestSessions(limit);
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
    const common = {
      sessionNotes: parsed.data.sessionNotes,
      userId: auth.user?.id ?? null,
      userName: profileName,
    };
    const result = parsed.data.donors?.length
      ? await createPartHarvestCase({ ...common, donors: parsed.data.donors })
      : await createPartHarvestSession({
          ...common,
          seriesId: parsed.data.seriesId!,
          lines: parsed.data.lines!,
        });
    return NextResponse.json({ success: true, ...result });
  },
  { module: 'parts', action: 'harvest_create', roles: ROLES_BODEGA_DESPACHO }
);
