import { OutboundDispatchController } from '@/modules/outbound-dispatch/interfaces/OutboundDispatchController';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';

export const dynamic = 'force-dynamic';

const controller = new OutboundDispatchController();

export const GET = withErrorHandler(async () => controller.listOpen());

export const POST = withErrorHandler(
  async (request: Request) => controller.open(request),
  { module: 'dispatch-batches', action: 'open', roles: ROLES_BODEGA_DESPACHO }
);
