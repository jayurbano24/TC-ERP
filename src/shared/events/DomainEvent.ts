export interface DomainEvent {
  eventName: string;
  occurredAt: Date;
  payload?: any;
}
