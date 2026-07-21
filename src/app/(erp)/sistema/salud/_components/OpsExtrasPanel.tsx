'use client';

import { Card } from '@/components/ui';
import type { SystemHealthReport } from '@/modules/system-health/types';

type Props = {
  health: SystemHealthReport;
};

export function OpsExtrasPanel({ health }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card className="space-y-2 p-5">
        <h3 className="text-sm font-black uppercase tracking-widest text-[var(--heading)]">
          Seguridad
        </h3>
        <p className="text-3xl font-black tabular-nums text-[var(--heading)]">
          {health.security.loginFailures24h ?? '—'}
        </p>
        <p className="text-xs text-[var(--muted)]">Login fallidos (proxy 24h)</p>
        <p className="text-[11px] text-[var(--muted)]">{health.security.note}</p>
      </Card>
      <Card className="space-y-2 p-5">
        <h3 className="text-sm font-black uppercase tracking-widest text-[var(--heading)]">
          Backups
        </h3>
        <p className="text-sm font-black uppercase text-[var(--heading)]">
          {health.backups.status}
        </p>
        <p className="text-xs text-[var(--muted)]">
          Último: {health.backups.lastBackupAt || 'Ver Supabase Dashboard'}
        </p>
        <p className="text-[11px] text-[var(--muted)]">{health.backups.note}</p>
      </Card>
      <Card className="space-y-2 p-5">
        <h3 className="text-sm font-black uppercase tracking-widest text-[var(--heading)]">
          Deploy
        </h3>
        <p className="text-sm font-black text-[var(--heading)]">v{health.deploy.version}</p>
        <p className="font-mono text-xs text-[var(--muted)]">
          {health.deploy.commitShort || 'commit N/D'}
          {health.deploy.branch ? ` · ${health.deploy.branch}` : ''}
        </p>
        <p className="text-[11px] text-[var(--muted)]">{health.deploy.environment}</p>
      </Card>
    </div>
  );
}
