import { IEventBus } from '../shared/events/IEventBus';
import { PrismaClient } from '@prisma/client';

export class OutboxPublisherWorker {
  private isRunning: boolean = false;
  
  constructor(
    private readonly prisma: PrismaClient,
    private readonly eventBus: IEventBus,
    private readonly batchSize: number = 50,
    private readonly maxAttempts: number = 3
  ) {}

  public async start(intervalMs: number = 5000): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    setInterval(async () => {
      await this.processOutbox();
    }, intervalMs);
  }

  public stop(): void {
    this.isRunning = false;
  }

  private async processOutbox(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // Obtener eventos pendientes o fallidos que deban reintentarse
      const events = await this.prisma.outboxEvent.findMany({
        where: {
          status: { in: ['PENDING', 'FAILED'] },
          attempts: { lt: this.maxAttempts },
          OR: [
            { next_retry: null },
            { next_retry: { lte: new Date() } }
          ]
        },
        take: this.batchSize,
        orderBy: { created_at: 'asc' }
      });

      if (events.length === 0) return;

      for (const event of events) {
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: { status: 'PROCESSING' }
        });

        try {
          const payload = JSON.parse(event.payload);
          // Reconstruir el evento (aquí se podría usar un EventFactory basado en event_name)
          const domainEvent = { ...payload }; 
          
          await this.eventBus.publish(domainEvent);

          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: { 
              status: 'COMPLETED', 
              processed_at: new Date() 
            }
          });
        } catch (error: any) {
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: { 
              status: 'FAILED',
              attempts: event.attempts + 1,
              last_error: error.message,
              next_retry: new Date(Date.now() + 1000 * 60 * Math.pow(2, event.attempts)) // Backoff exponencial
            }
          });
        }
      }
    } catch (error) {
      console.error('Error processing outbox events:', error);
    }
  }
}
