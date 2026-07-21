'use client';

import { Badge, Card } from '@/components/ui';
import { erpSoftStat } from '@/lib/design/tokens';
import type { ExternalServiceStatus, SystemHealthReport } from '@/modules/system-health/types';
import { Database, Layers, Server, Workflow } from 'lucide-react';

type Props = {
  health: SystemHealthReport;
};

function statusTone(status: ExternalServiceStatus | 'ok' | 'error') {
  if (status === 'ok') return erpSoftStat.success;
  if (status === 'error') return erpSoftStat.danger;
  if (status === 'degraded') return erpSoftStat.warning;
  return erpSoftStat.muted;
}

function statusLabel(status: ExternalServiceStatus | 'ok' | 'error') {
  if (status === 'ok') return 'OK';
  if (status === 'error') return 'ERROR';
  if (status === 'degraded') return 'DEGRADED';
  return 'NO CONFIG';
}

export function ServicesStatusPanel({ health }: Props) {
  const items = [
    {
      label: 'API',
      status: health.api.status,
      detail:
        health.api.latencyMs != null
          ? `${health.api.latencyMs} ms · v${health.api.version}`
          : health.api.version,
      note: health.api.service,
      icon: Server,
    },
    {
      label: 'Supabase',
      status: health.supabase.reachable ? ('ok' as const) : ('error' as const),
      detail: `${health.supabase.latencyMs} ms · schema ${health.supabase.schema}`,
      note: health.supabase.error || 'Probe service role',
      icon: Database,
    },
    {
      label: 'Redis',
      status: health.redis.status,
      detail: 'N/D',
      note: health.redis.note || 'No configurado',
      icon: Layers,
    },
    {
      label: 'BullMQ',
      status: health.bullmq.status,
      detail:
        health.bullmq.queueBacklog != null
          ? `Backlog outbox ${health.bullmq.queueBacklog}`
          : 'N/D',
      note: health.bullmq.note || 'Cola Postgres',
      icon: Workflow,
    },
  ];

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h3 className="text-sm font-black uppercase tracking-widest text-[var(--heading)]">
          Estado de servicios
        </h3>
        <p className="mt-1 text-xs text-[var(--muted)]">
          API · Supabase · Redis · BullMQ (honestidad de stack)
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className={`rounded-2xl border border-l-4 p-4 ${statusTone(item.status)}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest">{item.label}</p>
                  <p className="mt-2 text-lg font-black text-[var(--heading)]">
                    {statusLabel(item.status)}
                  </p>
                  <p className="mt-1 text-[11px] font-medium text-[var(--muted)]">{item.detail}</p>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">{item.note}</p>
                </div>
                <div className="rounded-xl bg-[var(--surface)] p-2 shadow-sm">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <Badge className="mt-3 border-none bg-[var(--surface)] text-[8px] font-black uppercase tracking-widest text-[var(--heading)]">
                {item.status}
              </Badge>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
