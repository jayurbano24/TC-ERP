'use client';

import { Badge, Card } from '@/components/ui';
import type { CronJobHealth, CronJobStatus } from '@/modules/system-health/types';

type Props = {
  crons: CronJobHealth[];
};

function statusBadge(status: CronJobStatus) {
  if (status === 'ok') {
    return (
      <Badge className="border-none bg-[var(--success)]/15 text-[var(--success)] text-[8px] font-black uppercase">
        OK
      </Badge>
    );
  }
  if (status === 'error') {
    return (
      <Badge className="border-none bg-[var(--danger)]/15 text-[var(--danger)] text-[8px] font-black uppercase">
        Error
      </Badge>
    );
  }
  if (status === 'stale') {
    return (
      <Badge className="border-none bg-[var(--warning)]/15 text-[var(--warning)] text-[8px] font-black uppercase">
        Stale
      </Badge>
    );
  }
  return (
    <Badge className="border-none bg-[var(--surface-hover)] text-[var(--muted)] text-[8px] font-black uppercase">
      Desconocido
    </Badge>
  );
}

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export function CronStatusTable({ crons }: Props) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-[var(--border)] bg-[var(--surface-hover)] px-6 py-4">
        <h3 className="text-sm font-black uppercase tracking-widest text-[var(--heading)]">
          Crons Vercel
        </h3>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Schedule de vercel.json × heartbeat por job (sync_process_config /
          sync_run_log). Critical y standard ya no comparten estado.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="border-b border-[var(--border)] text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Job</th>
              <th className="px-4 py-3">Schedule</th>
              <th className="px-4 py-3">Último éxito</th>
              <th className="px-4 py-3">Último error</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {crons.map((c) => (
              <tr key={c.path} className="hover:bg-[var(--surface-hover)]">
                <td className="px-4 py-3">
                  <p className="text-xs font-black text-[var(--heading)]">{c.label}</p>
                  <p className="font-mono text-[10px] text-[var(--muted)]">{c.path}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-[var(--muted)]">
                  {c.schedule}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--muted)]">
                  {fmt(c.lastSuccessAt)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--muted)]">
                  {fmt(c.lastErrorAt)}
                </td>
                <td className="px-4 py-3">{statusBadge(c.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
