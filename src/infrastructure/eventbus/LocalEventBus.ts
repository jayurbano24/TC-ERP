import { IEventBus } from '../../shared/events/IEventBus';
import { IEventHandler } from '../../shared/events/IEventHandler';
import { DomainEvent } from '../../shared/events/DomainEvent';
import { injectable } from 'tsyringe';

@injectable()
export class LocalEventBus implements IEventBus {
  private handlers: Map<string, IEventHandler<any>[]> = new Map();

  async emit(event: any): Promise<void> {
    const eventName = event.constructor.name || event.eventName;
    const eventHandlers = this.handlers.get(eventName) || [];
    
    // Ejecutar handlers asíncronamente pero no bloquear al publicador
    Promise.all(eventHandlers.map(handler => handler.handle(event))).catch(err => {
      console.error(`Error handling event ${eventName}:`, err);
    });
  }

  async publishAll(events: any[]): Promise<void> {
    for (const event of events) {
      await this.emit(event);
    }
  }

  subscribe<T extends DomainEvent>(eventName: string, handler: IEventHandler<T>): void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }
    this.handlers.get(eventName)!.push(handler);
  }
}
