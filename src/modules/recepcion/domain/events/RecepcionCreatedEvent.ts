import type { DomainEvent } from '../../../../shared/events/DomainEvent';

export interface RecepcionItem {
  sku: string;
  cantidad: number;
}

export class RecepcionCreatedEvent implements DomainEvent {
  readonly eventName = 'RecepcionCreatedEvent';
  readonly occurredAt: Date;

  constructor(
    public readonly id: string, // ordenServicioId
    public readonly tipo: 'CAC' | 'PX',
    public readonly items: RecepcionItem[], // En un futuro si hay detalle
    public readonly tenant: string,
    public readonly branch: string
  ) {
    this.occurredAt = new Date();
  }
}
