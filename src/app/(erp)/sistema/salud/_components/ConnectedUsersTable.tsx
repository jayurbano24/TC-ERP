'use client';

import { Badge, Card } from '@/components/ui';
import type { ConnectedUserPresence } from '@/modules/system-health/types';
import { formatClientIpForDisplay } from '@/lib/http/clientIp';

type Props = {
  users: ConnectedUserPresence[];
  idleMinutes: number;
  connected: number | null;
};

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function minutesAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'ahora';
  if (min === 1) return 'hace 1 min';
  return `hace ${min} min`;
}

export function ConnectedUsersTable({ users, idleMinutes, connected }: Props) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-[var(--border)] bg-[var(--surface-hover)] px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-[var(--heading)]">
              Usuarios conectados
            </h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Presencia ERP (`user_sessions.last_seen`). Sin uso &gt; {idleMinutes} min →
              expulsión automática.
            </p>
          </div>
          <Badge className="border-none bg-[var(--accent)]/15 text-[var(--accent)] text-[10px] font-black uppercase">
            {connected ?? users.length} activos
          </Badge>
        </div>
      </div>

      {users.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-[var(--muted)]">
          Nadie conectado en la ventana de {idleMinutes} minutos.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-[var(--border)] text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3">Conectado</th>
                <th className="px-4 py-3">Última actividad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {users.map((u) => (
                <tr key={u.sessionId} className="hover:bg-[var(--surface-hover)]">
                  <td className="px-4 py-3">
                    <p className="text-xs font-black text-[var(--heading)]">
                      {u.fullName || 'Sin nombre'}
                    </p>
                    <p className="font-mono text-[10px] text-[var(--muted)]">{u.email || u.userId}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)]">{u.role || '—'}</td>
                  <td
                    className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-[var(--muted)]"
                    title={u.ipAddress || undefined}
                  >
                    {formatClientIpForDisplay(u.ipAddress)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--muted)]">
                    {fmt(u.connectedAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <p className="text-xs font-semibold text-[var(--heading)]">
                      {minutesAgo(u.lastSeenAt)}
                    </p>
                    <p className="text-[10px] text-[var(--muted)]">{fmt(u.lastSeenAt)}</p>
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
