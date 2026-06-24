import { OutboundDispatchController } from '@/modules/outbound-dispatch/interfaces/OutboundDispatchController';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';

export const dynamic = 'force-dynamic';

const controller = new OutboundDispatchController();

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withErrorHandler(async (request: Request, context: RouteContext) => {
  const { id } = await context.params;
  return controller.close(id, request);
});
