'use client';

import { Card } from '@/components/ui';
import { erpSoftStat } from '@/lib/design/tokens';
import type { SystemHealthReport } from '@/modules/system-health/types';
import {
  AlertCircle,
  Database,
  Gauge,
  ListTodo,
  Server,
  Timer,
  Users,
} from 'lucide-react';

type Props = {
  health: SystemHealthReport;
};

function toneForOk(ok: boolean) {
  return ok ? erpSoftStat.success : erpSoftStat.danger;
}

export function HealthKpiStrip({ health }: Props) {
  const outbox =
    (health.queues.outboxPending ?? 0) + (health.queues.outboxFailed ?? 0);
  const errorsTotal = health.errors24h.syncFailures + health.errors24h.outboxFailed;

  const items = [
    {
      label: 'API',
      value: health.api.status === 'ok' ? 'OK' : 'ERROR',
      detail: `${health.api.latencyMs} ms probe · v${health.api.version}`,
      icon: Server,
      tone: toneForOk(health.api.status === 'ok'),
    },
    {
      label: 'Supabase',
      value: health.supabase.reachable ? 'OK' : 'ERROR',
      detail: `${health.database.latencyMs} ms`,
      icon: Database,
      tone: toneForOk(health.supabase.reachable),
    },
    {
      label: 'Peticiones / min',
      value: health.traffic.requestsPerMinute == null ? '—' : String(health.traffic.requestsPerMinute),
      detail: 'Proxy audit (1 min)',
      icon: Gauge,
      tone: erpSoftStat.accent,
    },
    {
      label: 'Tiempo respuesta',
      value:
        health.traffic.avgResponseMs == null ? '—' : `${health.traffic.avgResponseMs} ms`,
      detail: 'Probe /api/health',
      icon: Timer,
      tone:
        (health.traffic.avgResponseMs ?? 0) > 1500
          ? erpSoftStat.warning
          : erpSoftStat.success,
    },
    {
      label: 'Usuarios conectados',
      value: health.users.connected == null ? '—' : String(health.users.connected),
      detail: 'user_sessions',
      icon: Users,
      tone: erpSoftStat.accent,
    },
    {
      label: 'Colas pendientes',
      value: String(outbox),
      detail: `Outbox P ${health.queues.outboxPending ?? '—'} · KPI ${health.queues.kpiInvalidationPending ?? '—'}`,
      icon: ListTodo,
      tone:
        (health.queues.outboxFailed ?? 0) > 0
          ? erpSoftStat.danger
          : outbox >= 100
            ? erpSoftStat.warning
            : erpSoftStat.success,
    },
    {
      label: 'Errores 24h',
      value: String(errorsTotal),
      detail: `Sync ${health.errors24h.syncFailures} · Outbox ${health.errors24h.outboxFailed}`,
      icon: AlertCircle,
      tone: errorsTotal > 0 ? erpSoftStat.danger : erpSoftStat.success,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label} className={`p-5 border-l-4 ${item.tone}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                  {item.label}
                </p>
                <p className="mt-2 text-2xl font-black text-[var(--heading)]">{item.value}</p>
                <p className="mt-1 text-[11px] font-medium text-[var(--muted)]">{item.detail}</p>
              </div>
              <div className="rounded-xl bg-[var(--surface)] p-2 shadow-sm">
                <Icon className="h-4 w-4" />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
