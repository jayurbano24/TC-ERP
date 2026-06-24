import { ProductionOrderController } from '@/modules/production-order/interfaces/ProductionOrderController';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';

export const dynamic = 'force-dynamic';

const controller = new ProductionOrderController();

export const GET = withErrorHandler(async () => controller.list());

export const POST = withErrorHandler(async (request: Request) => controller.create(request));
