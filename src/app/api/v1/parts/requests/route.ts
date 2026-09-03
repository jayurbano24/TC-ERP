import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO, ROLES_TALLER } from '@/shared/authz/roleGuard';
import { createPartRequest, listPartRequests } from '@/modules/parts/server/partsService';

const CreateBody = z.object({
  serviceOrderId: z.string().uuid(),
  seriesId: z.string().uuid().optional().nullable(),
  serialNumber: z.string().max(64).optional().nullable(),
  brandId: z.string().uuid().optional().nullable(),
  modelId: z.string().uuid().optional().nullable(),
  technicianName: z.string().max(120).optional().nullable(),
  priority: z.enum(['NORMAL', 'URGENTE']).optional(),
  reason: z.string().max(500).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  catalogId: z.string().uuid(),
  qty: z.number().int().positive(),
});

export const GET = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const status = new URL(req.url).searchParams.get('status') || undefined;
    const items = await listPartRequests(undefined, { status });
    return NextResponse.json({ items });
  },
  { module: 'parts', action: 'requests_list', roles: [...ROLES_BODEGA_DESPACHO, ...ROLES_TALLER] }
);

export const POST = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const parsed = CreateBody.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', issues: parsed.error.flatten() }, { status: 400 });
    }
    const result = await createPartRequest({
      ...parsed.data,
      technicianId: auth.user?.id ?? null,
    });
    return NextResponse.json(result);
  },
  { module: 'parts', action: 'requests_create', roles: [...ROLES_TALLER, ...ROLES_BODEGA_DESPACHO] }
);
