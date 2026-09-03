import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO, ROLES_TALLER } from '@/shared/authz/roleGuard';
import {
  adjustPartsInventory,
  listPartsInventory,
  updatePartsLocation,
} from '@/modules/parts/server/partsService';

const PostBody = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('adjust').optional(),
    catalogId: z.string().uuid(),
    qtyDelta: z.number().int().refine((n) => n !== 0),
    stockType: z.enum(['NEW', 'RECOVERED']).optional(),
    notes: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal('location'),
    catalogId: z.string().uuid(),
    location: z.string().max(120).nullable(),
  }),
]);

export const GET = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const items = await listPartsInventory();
    return NextResponse.json({ items });
  },
  { module: 'parts', action: 'inventory_list', roles: [...ROLES_BODEGA_DESPACHO, ...ROLES_TALLER] }
);

export const POST = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const raw = await req.json();
    // Compat: body antiguo sin action = adjust
    const normalized =
      raw?.action === 'location'
        ? raw
        : { action: 'adjust' as const, ...raw, action_ignored: undefined };

    if (normalized.action === 'location') {
      const parsed = z
        .object({
          catalogId: z.string().uuid(),
          location: z.string().max(120).nullable(),
        })
        .safeParse(normalized);
      if (!parsed.success) {
        return NextResponse.json({ error: 'VALIDATION_ERROR', issues: parsed.error.flatten() }, { status: 400 });
      }
      const result = await updatePartsLocation(parsed.data);
      return NextResponse.json({ result });
    }

    const parsed = z
      .object({
        catalogId: z.string().uuid(),
        qtyDelta: z.number().int().refine((n) => n !== 0),
        stockType: z.enum(['NEW', 'RECOVERED']).optional(),
        notes: z.string().max(500).optional(),
      })
      .safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', issues: parsed.error.flatten() }, { status: 400 });
    }
    const result = await adjustPartsInventory({
      ...parsed.data,
      userId: auth.user?.id ?? null,
    });
    return NextResponse.json({ result });
  },
  { module: 'parts', action: 'inventory_write', roles: ROLES_BODEGA_DESPACHO }
);
