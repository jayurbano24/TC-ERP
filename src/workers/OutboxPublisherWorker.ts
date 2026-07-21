import { OUTBOX_EVENT_SELECT } from '@/shared/constants/dbProjections';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DomainEvent } from '../shared/events/DomainEvent';
import type { IEventBus } from '../shared/events/IEventBus';

export type OutboxBatchResult = {
  claimed: number;
  completed: number;
  failed: number;
};

export class OutboxPublisherWorker {
  private isRunning = false;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly eventBus: IEventBus,
    private readonly batchSize: number = 50,
    private readonly maxAttempts: number = 3
  ) {}

  /** Modo long-running (dev/local). En Vercel usar `processBatch` desde cron. */
  public async start(intervalMs: number = 5000): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    setInterval(() => {
      void this.processBatch();
    }, intervalMs);
  }

  public stop(): void {
    this.isRunning = false;
  }

  /**
   * Procesa un lote PENDING/FAILED. Idempotente para cron serverless.
   */
  public async processBatch(): Promise<OutboxBatchResult> {
    const result: OutboxBatchResult = { claimed: 0, completed: 0, failed: 0 };
    const now = new Date().toISOString();

    const { data: events, error } = await this.supabase
      .from('outbox_event')
      .select(OUTBOX_EVENT_SELECT)
      .in('status', ['PENDING', 'FAILED'])
      .lt('attempts', this.maxAttempts)
      .or(`next_retry.is.null,next_retry.lte.${now}`)
      .order('created_at', { ascending: true })
      .limit(this.batchSize);

    if (error) {
      throw new Error(error.message);
    }

    if (!events || events.length === 0) return result;
    result.claimed = events.length;

    for (const event of events) {
      const { error: claimError } = await this.supabase
        .from('outbox_event')
        .update({ status: 'PROCESSING' })
        .eq('id', event.id)
        .in('status', ['PENDING', 'FAILED']);

      if (claimError) {
        result.failed += 1;
        continue;
      }

      try {
        const rawPayload =
          typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
        const payload =
          rawPayload && typeof rawPayload === 'object'
            ? (rawPayload as Record<string, unknown>)
            : {};

        const eventName =
          (typeof payload.eventName === 'string' && payload.eventName) ||
          (typeof payload.event_name === 'string' && payload.event_name) ||
          (typeof event.event_name === 'string' && event.event_name) ||
          'unknown';

        const domainEvent = {
          ...payload,
          eventName,
          occurredAt:
            payload.occurredAt instanceof Date
              ? payload.occurredAt
              : typeof payload.occurredAt === 'string'
                ? new Date(payload.occurredAt)
                : new Date(event.created_at ?? Date.now()),
        } as DomainEvent;

        await this.eventBus.emit(domainEvent);

        const { error: completeError } = await this.supabase
          .from('outbox_event')
          .update({ status: 'COMPLETED', processed_at: new Date().toISOString() })
          .eq('id', event.id);

        if (completeError) {
          throw new Error(completeError.message);
        }
        result.completed += 1;
      } catch (err: unknown) {
        const attempts = Number(event.attempts ?? 0) + 1;
        const nextRetry = new Date(Date.now() + 1000 * 60 * Math.pow(2, attempts - 1)).toISOString();
        const message = err instanceof Error ? err.message : String(err);

        await this.supabase
          .from('outbox_event')
          .update({
            status: 'FAILED',
            attempts,
            last_error: message.slice(0, 1000),
            next_retry: nextRetry,
          })
          .eq('id', event.id);

        result.failed += 1;
      }
    }

    return result;
  }

  /**
   * Varios lotes hasta agotar cola o presupuesto de tiempo (cron Vercel).
   */
  public async processUntil(options?: {
    maxBatches?: number;
    timeBudgetMs?: number;
  }): Promise<OutboxBatchResult & { batches: number }> {
    const maxBatches = options?.maxBatches ?? 20;
    const timeBudgetMs = options?.timeBudgetMs ?? 50_000;
    const deadline = Date.now() + timeBudgetMs;
    const totals: OutboxBatchResult & { batches: number } = {
      claimed: 0,
      completed: 0,
      failed: 0,
      batches: 0,
    };

    for (let i = 0; i < maxBatches && Date.now() < deadline; i++) {
      const batch = await this.processBatch();
      totals.batches += 1;
      totals.claimed += batch.claimed;
      totals.completed += batch.completed;
      totals.failed += batch.failed;
      if (batch.claimed === 0) break;
    }

    return totals;
  }
}
