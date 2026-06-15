import { injectable } from 'tsyringe';
import { IEventHandler } from '../../../../shared/events/IEventHandler';
import { RecepcionCreatedEvent } from '../../domain/events/RecepcionCreatedEvent';

@injectable()
export class RecepcionCreatedEventHandler implements IEventHandler<RecepcionCreatedEvent> {
  async handle(event: RecepcionCreatedEvent): Promise<void> {
    // Aquí iría la lógica reactiva (ej: notificar por email, actualizar dashboard en tiempo real, etc)
    // Por ahora solo logueamos para verificar el funcionamiento del Event Bus.
    console.log(`[EVENT BUS] Evento procesado: ${event.eventName}`, {
      ordenServicioId: event.id,
      tipoRecepcion: event.tipo,
      occurredAt: event.occurredAt
    });
  }
}
