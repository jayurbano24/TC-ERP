import { SupabaseClient } from '@supabase/supabase-js';
import { IEventBus } from '../shared/events/IEventBus';

export class OutboxPublisherWorker {
  private isRunning: boolean = false;

  constructor(
    private readonly supabase: SupabaseClient,
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
      const now = new Date().toISOString();

      const { data: events } = await this.supabase
        .from('outbox_event')
        .select('*')
        .in('status', ['PENDING', 'FAILED'])
        .lt('attempts', this.maxAttempts)
        .or(`next_retry.is.null,next_retry.lte.${now}`)
        .order('created_at', { ascending: true })
        .limit(this.batchSize);

      if (!events || events.length === 0) return;

      for (const event of events) {
        await this.supabase
          .from('outbox_event')
          .update({ status: 'PROCESSING' })
          .eq('id', event.id);

        try {
          const payload = JSON.parse(event.payload);
          const domainEvent = { ...payload };

          await this.eventBus.emit(domainEvent);

          await this.supabase
            .from('outbox_event')
            .update({ status: 'COMPLETED', processed_at: new Date().toISOString() })
            .eq('id', event.id);
        } catch (error: any) {
          const nextRetry = new Date(
            Date.now() + 1000 * 60 * Math.pow(2, event.attempts)
          ).toISOString();

          await this.supabase
            .from('outbox_event')
            .update({
              status: 'FAILED',
              attempts: event.attempts + 1,
              last_error: error.message,
              next_retry: nextRetry,
            })
            .eq('id', event.id);
        }
      }
    } catch (error) {
      console.error('Error processing outbox events:', error);
    }
  }
}
