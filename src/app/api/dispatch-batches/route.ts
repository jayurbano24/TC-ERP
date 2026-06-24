import { OutboundDispatchController } from '@/modules/outbound-dispatch/interfaces/OutboundDispatchController';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';

export const dynamic = 'force-dynamic';

const controller = new OutboundDispatchController();

export const GET = withErrorHandler(async () => controller.listOpen());

export const POST = withErrorHandler(async (request: Request) => controller.open(request));
