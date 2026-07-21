'use client';

import { Badge, Card } from '@/components/ui';
import type { SystemHealthReport } from '@/modules/system-health/types';
import { Database } from 'lucide-react';

type Props = {
  supabase: SystemHealthReport['supabase'];
  database: SystemHealthReport['database'];
};

export function SupabaseStatusCard({ supabase, database }: Props) {
  const ok = supabase.reachable && database.status === 'ok';

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-[var(--heading)]">
            Estado Supabase
          </h3>
          <p className="mt-1 text-xs text-[var(--muted)]">Probe de conectividad (service role)</p>
        </div>
        <div className="rounded-xl bg-[var(--accent)]/15 p-2 text-[var(--accent)]">
          <Database className="h-5 w-5" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge
          className={`border-none text-[9px] font-black uppercase ${
            ok
              ? 'bg-[var(--success)]/15 text-[var(--success)]'
              : 'bg-[var(--danger)]/15 text-[var(--danger)]'
          }`}
        >
          {ok ? 'Reachable' : 'Unreachable'}
        </Badge>
        <span className="text-xs font-bold text-[var(--muted)]">{supabase.latencyMs} ms</span>
      </div>

      <dl className="space-y-2 text-xs">
        <div className="flex justify-between gap-4 border-b border-[var(--border)] pb-2">
          <dt className="font-black uppercase tracking-widest text-[var(--muted)]">Schema</dt>
          <dd className="font-mono font-bold text-[var(--heading)]">{supabase.schema}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-[var(--border)] pb-2">
          <dt className="font-black uppercase tracking-widest text-[var(--muted)]">DB probe</dt>
          <dd className="font-bold uppercase text-[var(--heading)]">{database.status}</dd>
        </div>
        {supabase.error && (
          <div className="rounded-xl bg-[var(--danger)]/10 p-3 text-[var(--danger)]">
            {supabase.error}
          </div>
        )}
      </dl>
    </Card>
  );
}
