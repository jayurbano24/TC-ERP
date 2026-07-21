'use client';

import { Card } from '@/components/ui';
import type { SystemHealthReport } from '@/modules/system-health/types';

type Props = {
  consumption: SystemHealthReport['consumption'];
};

function fmt(n: number | null) {
  if (n == null) return '—';
  return n.toLocaleString();
}

export function ConsumptionCard({ consumption }: Props) {
  const rows = [
    { label: 'Recepciones 24h', value: fmt(consumption.receptions24h) },
    { label: 'Audit logs 24h', value: fmt(consumption.auditLogs24h) },
    { label: 'Domain events 7d', value: fmt(consumption.domainEvents7d) },
    { label: 'Outbox backlog', value: fmt(consumption.outboxBacklog) },
  ];

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h3 className="text-sm font-black uppercase tracking-widest text-[var(--heading)]">
          Consumos estimados
        </h3>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Conteos de actividad (no billing de Supabase/Vercel)
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface-hover)] p-4"
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
              {row.label}
            </p>
            <p className="mt-2 text-xl font-black text-[var(--heading)]">{row.value}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
