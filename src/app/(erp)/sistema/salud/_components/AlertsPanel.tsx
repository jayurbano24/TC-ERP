'use client';

import { Badge, Card } from '@/components/ui';
import type { HealthAlert } from '@/modules/system-health/types';

type Props = {
  alerts: HealthAlert[];
};

function tone(sev: HealthAlert['severity']) {
  if (sev === 'critical') return 'bg-[var(--danger)]/15 text-[var(--danger)]';
  if (sev === 'warning') return 'bg-[var(--warning)]/15 text-[var(--warning)]';
  return 'bg-[var(--accent)]/15 text-[var(--accent)]';
}

export function AlertsPanel({ alerts }: Props) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-[var(--border)] bg-[var(--surface-hover)] px-5 py-4">
        <h3 className="text-sm font-black uppercase tracking-widest text-[var(--heading)]">
          Alertas
        </h3>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Reglas del Health Score · {alerts.length} activas
        </p>
      </div>
      {alerts.length === 0 ? (
        <div className="px-5 py-8 text-sm text-[var(--muted)]">Sin alertas. Sistema estable.</div>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {alerts.slice(0, 12).map((a) => (
            <li key={a.id} className="px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={`border-none text-[9px] font-black uppercase ${tone(a.severity)}`}>
                  {a.severity}
                </Badge>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
                  {a.service}
                </span>
              </div>
              <p className="mt-1 text-sm font-black text-[var(--heading)]">{a.title}</p>
              <p className="text-xs text-[var(--muted)]">{a.detail}</p>
              <p className="mt-1 text-[11px] text-[var(--muted)]">{a.actionHint}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
