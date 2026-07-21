'use client';

import { Badge, Card } from '@/components/ui';
import type { HealthErrorSample } from '@/modules/system-health/types';

type Props = {
  syncFailures: number;
  outboxFailed: number;
  samples: HealthErrorSample[];
};

export function Errors24hTable({ syncFailures, outboxFailed, samples }: Props) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col gap-2 border-b border-[var(--border)] bg-[var(--surface-hover)] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-[var(--heading)]">
            Errores últimas 24 h
          </h3>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Sync jobs y outbox FAILED (no incluye 5xx HTTP de Vercel)
          </p>
        </div>
        <div className="flex gap-2">
          <Badge className="border-none bg-[var(--danger)]/15 text-[var(--danger)] text-[9px] font-black uppercase">
            Sync {syncFailures}
          </Badge>
          <Badge className="border-none bg-[var(--warning)]/15 text-[var(--warning)] text-[9px] font-black uppercase">
            Outbox {outboxFailed}
          </Badge>
        </div>
      </div>

      {samples.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm font-medium text-[var(--muted)]">
          Sin errores registrados en las últimas 24 horas.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-[var(--border)] bg-[var(--surface-hover)] text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Cuándo</th>
                <th className="px-4 py-3">Fuente</th>
                <th className="px-4 py-3">Proceso / Evento</th>
                <th className="px-4 py-3">Mensaje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {samples.map((s) => (
                <tr key={`${s.source}-${s.id}`} className="hover:bg-[var(--surface-hover)]">
                  <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-[var(--muted)]">
                    {new Date(s.at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className="border-none bg-[var(--surface-hover)] text-[var(--foreground)] text-[8px] font-black uppercase">
                      {s.source === 'sync_run_log' ? 'Sync' : 'Outbox'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-[var(--heading)]">
                    {s.processOrEvent}
                  </td>
                  <td className="max-w-md truncate px-4 py-3 text-xs text-[var(--muted)]" title={s.message}>
                    {s.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
