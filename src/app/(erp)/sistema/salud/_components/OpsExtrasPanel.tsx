'use client';

import { Card } from '@/components/ui';
import type { SystemHealthReport } from '@/modules/system-health/types';

type Props = {
  health: SystemHealthReport;
};

function fmtBytes(n: number | null) {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function OpsExtrasPanel({ health }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card className="space-y-3 p-5">
        <h3 className="text-sm font-black uppercase tracking-widest text-[var(--heading)]">
          Seguridad
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="text-[9px] font-black uppercase text-[var(--muted)]">Login fail</p>
            <p className="text-xl font-black tabular-nums text-[var(--heading)]">
              {health.security.loginFailures24h ?? '—'}
            </p>
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-[var(--muted)]">401</p>
            <p className="text-xl font-black tabular-nums text-[var(--heading)]">
              {health.security.unauthorized24h ?? '—'}
            </p>
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-[var(--muted)]">429</p>
            <p className="text-xl font-black tabular-nums text-[var(--heading)]">
              {health.security.rateLimited24h ?? '—'}
            </p>
          </div>
        </div>
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
          Último:{' '}
          {health.backups.lastBackupAt
            ? new Date(health.backups.lastBackupAt).toLocaleString()
            : '—'}
        </p>
        <p className="text-xs text-[var(--muted)]">
          Tamaño: {fmtBytes(health.backups.sizeBytes ?? null)}
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
