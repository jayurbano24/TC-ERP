import { injectable } from 'tsyringe';
import type { IEventBus } from './IEventBus';
import type { DomainEvent } from './DomainEvent';
import { container } from '../di/container';

@injectable()
export class EventBus implements IEventBus {
  async emit(event: DomainEvent): Promise<void> {
    const handlerName = `${event.eventName}Handler`;
    
    try {
      // Usamos resolveAll por si hay múltiples módulos suscritos al mismo evento
      const handlers = container.resolveAll<any>(handlerName);
      for (const handler of handlers) {
        await handler.handle(event);
      }
    } catch (error) {
      // Si no hay handler registrado, tsyringe lanzará un error.
      console.warn(`No handler found for event or execution failed: ${event.eventName}`, error);
    }
  }
}
