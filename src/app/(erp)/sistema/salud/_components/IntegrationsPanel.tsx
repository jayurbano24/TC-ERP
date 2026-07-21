'use client';

import { Badge, Card } from '@/components/ui';
import type { IntegrationHealth } from '@/modules/system-health/types';

type Props = {
  integrations: IntegrationHealth[];
};

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export function IntegrationsPanel({ integrations }: Props) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-[var(--border)] bg-[var(--surface-hover)] px-5 py-4">
        <h3 className="text-sm font-black uppercase tracking-widest text-[var(--heading)]">
          Integraciones
        </h3>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Solo servicios reales del stack TC-ERP (sin inventar Orderry/Firebase).
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="border-b border-[var(--border)] text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Servicio</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Último ping</th>
              <th className="px-4 py-3">Latencia</th>
              <th className="px-4 py-3">Último error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {integrations.map((i) => (
              <tr key={i.id} className="hover:bg-[var(--surface-hover)]">
                <td className="px-4 py-3">
                  <p className="text-xs font-black text-[var(--heading)]">{i.label}</p>
                  <p className="text-[10px] text-[var(--muted)]">{i.note}</p>
                </td>
                <td className="px-4 py-3">
                  <Badge className="border-none bg-[var(--surface-hover)] text-[9px] font-black uppercase">
                    {i.status}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--muted)]">
                  {fmt(i.lastPingAt)}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--muted)]">
                  {i.latencyMs == null ? '—' : `${i.latencyMs} ms`}
                </td>
                <td className="max-w-xs truncate px-4 py-3 text-xs text-[var(--muted)]">
                  {i.lastError || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
