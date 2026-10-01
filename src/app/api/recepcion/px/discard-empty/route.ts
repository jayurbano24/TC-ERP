import { NextResponse } from 'next/server';
import { z } from 'zod';
import { discardEmptyPxReceptions } from '@/modules/recepcion/server/pxCapture';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_RECEPCION } from '@/shared/authz/roleGuard';
import { parseJsonBody } from '@/shared/validation/parseRequest';

export const dynamic = 'force-dynamic';

const Body = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
});

export const POST = withErrorHandler(
  async (req: Request) => {
    const body = await parseJsonBody(req, Body);
    const result = await discardEmptyPxReceptions(body.ids);
    return NextResponse.json({ success: true, ...result });
  },
  { module: 'recepcion-px', action: 'discard-empty', roles: ROLES_RECEPCION }
);
