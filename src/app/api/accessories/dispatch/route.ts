import { AccessoriesDispatchController } from '@/modules/accessories-dispatch/interfaces/AccessoriesDispatchController';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';

export const dynamic = 'force-dynamic';

const controller = new AccessoriesDispatchController();

export const POST = withErrorHandler(
  async (request: Request) => controller.dispatchOut(request),
  { module: 'accessories-dispatch', action: 'dispatch-out', roles: ROLES_BODEGA_DESPACHO }
);
