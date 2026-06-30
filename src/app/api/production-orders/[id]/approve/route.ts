import { ProductionOrderController } from '@/modules/production-order/interfaces/ProductionOrderController';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_PRODUCCION } from '@/shared/authz/roleGuard';

export const dynamic = 'force-dynamic';

const controller = new ProductionOrderController();

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withErrorHandler(
  async (request: Request, context: RouteContext) => {
    const { id } = await context.params;
    return controller.approve(id, request);
  },
  { module: 'production-orders', action: 'approve', roles: ROLES_PRODUCCION }
);
