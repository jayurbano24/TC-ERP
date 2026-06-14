import type { DomainEvent } from './DomainEvent';

export interface IEventBus {
  emit(event: DomainEvent): Promise<void>;
}
