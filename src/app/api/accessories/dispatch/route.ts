import { AccessoriesDispatchController } from '@/modules/accessories-dispatch/interfaces/AccessoriesDispatchController';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';

export const dynamic = 'force-dynamic';

const controller = new AccessoriesDispatchController();

export const POST = withErrorHandler(async (request: Request) => controller.dispatchOut(request));
