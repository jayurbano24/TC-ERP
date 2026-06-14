import { IEventBus } from '../../shared/events/IEventBus';
import { IEventHandler } from '../../shared/events/IEventHandler';
import { injectable } from 'tsyringe';

@injectable()
export class LocalEventBus implements IEventBus {
  private handlers: Map<string, IEventHandler<any>[]> = new Map();

  async publish(event: any): Promise<void> {
    const eventName = event.constructor.name;
    const eventHandlers = this.handlers.get(eventName) || [];
    
    // Ejecutar handlers asíncronamente pero no bloquear al publicador
    Promise.all(eventHandlers.map(handler => handler.handle(event))).catch(err => {
      console.error(`Error handling event ${eventName}:`, err);
    });
  }

  async publishAll(events: any[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  subscribe<T>(eventName: string, handler: IEventHandler<T>): void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }
    this.handlers.get(eventName)!.push(handler);
  }
}
