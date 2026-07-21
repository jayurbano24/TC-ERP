'use client';

import { Badge, Card } from '@/components/ui';
import type { SystemHealthReport } from '@/modules/system-health/types';

type Props = {
  health: SystemHealthReport;
};

function Row({
  label,
  status,
  detail,
}: {
  label: string;
  status: string;
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] px-4 py-3">
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-[var(--heading)]">{label}</p>
        {detail ? <p className="mt-1 text-[11px] text-[var(--muted)]">{detail}</p> : null}
      </div>
      <Badge className="border-none bg-[var(--surface)] text-[9px] font-black uppercase text-[var(--heading)]">
        {status}
      </Badge>
    </div>
  );
}

export function PlatformDeepPanel({ health }: Props) {
  const p = health.platform;
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card className="space-y-3 p-5">
        <h3 className="text-sm font-black uppercase tracking-widest text-[var(--heading)]">
          Supabase
        </h3>
        <Row
          label="REST / Data API"
          status={p.rest.status}
          detail={p.rest.note}
        />
        <Row label="Auth" status={p.auth.status} detail={`${p.auth.latencyMs ?? '—'} ms · ${p.auth.note ?? ''}`} />
        <Row
          label="Storage"
          status={p.storage.status}
          detail={`${p.storage.latencyMs ?? '—'} ms · ${p.storage.note ?? ''}`}
        />
        <Row label="Realtime" status={p.realtime.status} detail={p.realtime.note} />
        <Row
          label="Edge Functions"
          status={p.edgeFunctions.status}
          detail={p.edgeFunctions.note}
        />
      </Card>
      <Card className="space-y-3 p-5">
        <h3 className="text-sm font-black uppercase tracking-widest text-[var(--heading)]">
          PostgreSQL
        </h3>
        <Row
          label="Probe DB"
          status={health.database.status}
          detail={`${health.database.latencyMs} ms`}
        />
        <Row
          label="Conexiones activas"
          status={p.postgres.activeConnections == null ? 'N/D' : String(p.postgres.activeConnections)}
          detail={p.postgres.note}
        />
        <Row label="Schema" status={health.supabase.schema} detail="public" />
        <Row
          label="Cache (Redis)"
          status={health.redis.status}
          detail={health.redis.note}
        />
      </Card>
    </div>
  );
}
