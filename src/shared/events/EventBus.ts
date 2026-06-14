import { injectable } from 'tsyringe';
import type { IEventBus } from './IEventBus';
import type { DomainEvent } from './DomainEvent';
import { container } from '../di/container';

@injectable()
export class EventBus implements IEventBus {
  async emit(event: DomainEvent): Promise<void> {
    const handlerName = `${event.eventName}Handler`;
    
    try {
      const handler = container.resolve<any>(handlerName);
      await handler.handle(event);
    } catch (error) {
      // Si no hay handler registrado, tsyringe lanzará un error.
      // Por ahora, simplemente lo ignoramos o lo logueamos si no hay suscriptor.
      // Dependiendo de la regla de negocio, podríamos no fallar si un evento no tiene handler.
      console.warn(`No handler found for event or execution failed: ${event.eventName}`, error);
    }
  }
}
