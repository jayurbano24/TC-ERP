import 'reflect-metadata';
import { container } from '../../../shared/di/container';
import { RecepcionController } from '../../../modules/recepcion/interfaces/RecepcionController';

export async function POST(req: Request) {
  return container.resolve(RecepcionController).handle(req);
}
