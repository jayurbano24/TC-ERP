'use client';

import { Card } from '@/components/ui';
import type { SystemHealthReport } from '@/modules/system-health/types';

type Props = {
  queues: SystemHealthReport['queues'];
};

function fmt(n: number | null) {
  return n == null ? '—' : String(n);
}

export function QueuesPanel({ queues }: Props) {
  const rows = [
    {
      label: 'Outbox PENDING',
      value: fmt(queues.outboxPending),
      hint: 'Eventos por publicar',
    },
    {
      label: 'Outbox FAILED',
      value: fmt(queues.outboxFailed),
      hint: 'Requiere atención',
    },
    {
      label: 'KPI invalidation',
      value: fmt(queues.kpiInvalidationPending),
      hint: 'Pendientes de reprocesar',
    },
  ];

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h3 className="text-sm font-black uppercase tracking-widest text-[var(--heading)]">
          Colas pendientes
        </h3>
        <p className="mt-1 text-xs text-[var(--muted)]">Outbox de eventos y cola KPI</p>
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface-hover)] px-4 py-3"
          >
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                {row.label}
              </p>
              <p className="text-[11px] text-[var(--muted)]">{row.hint}</p>
            </div>
            <p className="text-2xl font-black text-[var(--heading)]">{row.value}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
