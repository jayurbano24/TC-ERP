'use client';

import { Card } from '@/components/ui';
import type { SystemHealthReport } from '@/modules/system-health/types';
import { Gauge, Timer, Users } from 'lucide-react';

type Props = {
  traffic: SystemHealthReport['traffic'];
  users: SystemHealthReport['users'];
};

function fmt(n: number | null) {
  return n == null ? '—' : n.toLocaleString();
}

export function TrafficUsersPanel({ traffic, users }: Props) {
  const rows = [
    {
      label: 'Peticiones / min',
      value: fmt(traffic.requestsPerMinute),
      hint: 'Proxy: audit logs último minuto',
      icon: Gauge,
    },
    {
      label: 'Tiempo resp. (probe)',
      value: traffic.avgResponseMs != null ? `${traffic.avgResponseMs} ms` : '—',
      hint: 'Latencia /api/health',
      icon: Timer,
    },
    {
      label: 'Usuarios conectados',
      value: fmt(users.connected),
      hint: `Activos (last_seen < ${users.idleMinutes ?? 45} min)`,
      icon: Users,
    },
  ];

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h3 className="text-sm font-black uppercase tracking-widest text-[var(--heading)]">
          Tráfico y usuarios
        </h3>
        <p className="mt-1 text-xs text-[var(--muted)]">{traffic.note}</p>
      </div>
      <div className="space-y-3">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div
              key={row.label}
              className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface-hover)] px-4 py-3"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-[var(--surface)] p-2 text-[var(--accent)] shadow-sm">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                    {row.label}
                  </p>
                  <p className="text-[11px] text-[var(--muted)]">{row.hint}</p>
                </div>
              </div>
              <p className="text-xl font-black text-[var(--heading)]">{row.value}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
