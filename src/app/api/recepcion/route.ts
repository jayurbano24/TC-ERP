import 'reflect-metadata';
import { container } from '../../../shared/di/container';
import { RecepcionController } from '../../../modules/recepcion/interfaces/RecepcionController';
import { withErrorHandler } from '../../../shared/infrastructure/http/apiHandler';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async (req: Request) => {
  return container.resolve(RecepcionController).handle(req);
});
