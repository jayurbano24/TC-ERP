import type { DomainEvent } from './DomainEvent';

export interface IEventHandler<TEvent extends DomainEvent> {
  handle(event: TEvent): Promise<void>;
}
