'use client';

import { Card } from '@/components/ui';
import type { QueueDeep } from '@/modules/system-health/types';

type Props = {
  queue: QueueDeep;
};

function Bar({ label, value, tone }: { label: string; value: number | null; tone: string }) {
  const n = value ?? 0;
  const width = Math.min(100, n === 0 ? 2 : 8 + Math.log10(n + 1) * 25);
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="font-black uppercase tracking-wide text-[var(--heading)]">{label}</span>
        <span className="font-black tabular-nums text-[var(--heading)]">
          {value == null ? '—' : value.toLocaleString()}
        </span>
      </div>
      <div className="h-2 rounded-full bg-[var(--surface-hover)]">
        <div className={`h-2 rounded-full ${tone}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function QueueDeepPanel({ queue }: Props) {
  return (
    <Card className="space-y-4 p-5">
      <div>
        <h3 className="text-sm font-black uppercase tracking-widest text-[var(--heading)]">
          Cola outbox (Postgres)
        </h3>
        <p className="mt-1 text-xs text-[var(--muted)]">{queue.note}</p>
      </div>
      <div className="space-y-3">
        <Bar label="Pendientes" value={queue.pending} tone="bg-[var(--warning)]" />
        <Bar label="Procesando" value={queue.processing} tone="bg-[var(--accent)]" />
        <Bar label="Fallidos" value={queue.failed} tone="bg-[var(--danger)]" />
        <Bar label="Dead letter (≥3)" value={queue.deadLetter} tone="bg-[var(--heading)]" />
      </div>
    </Card>
  );
}
