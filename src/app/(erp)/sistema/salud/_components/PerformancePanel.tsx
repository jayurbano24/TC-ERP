'use client';

import { Card } from '@/components/ui';
import type { SystemHealthReport } from '@/modules/system-health/types';
import { Sparkline } from './Sparkline';

type Props = {
  health: SystemHealthReport;
};

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] px-4 py-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-xl font-black tabular-nums text-[var(--heading)]">{value}</p>
      {hint ? <p className="mt-1 text-[10px] text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}

export function PerformancePanel({ health }: Props) {
  const { latency, availability, traffic, httpStatus } = health;
  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-[var(--heading)]">
            Disponibilidad
          </h3>
          <p className="mt-1 text-xs text-[var(--muted)]">{availability.note}</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat
            label="Hoy (24h)"
            value={availability.todayPct == null ? '—' : `${availability.todayPct}%`}
          />
          <Stat
            label="7 días"
            value={availability.d7Pct == null ? '—' : `${availability.d7Pct}%`}
          />
          <Stat
            label="30 días"
            value={availability.d30Pct == null ? '—' : `${availability.d30Pct}%`}
          />
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-[var(--heading)]">
            Latencia API
          </h3>
          <p className="mt-1 text-xs text-[var(--muted)]">{latency.note}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Promedio" value={latency.avgMs == null ? '—' : `${latency.avgMs} ms`} />
          <Stat label="P95" value={latency.p95Ms == null ? '—' : `${latency.p95Ms} ms`} />
          <Stat label="P99" value={latency.p99Ms == null ? '—' : `${latency.p99Ms} ms`} />
          <Stat label="Máximo" value={latency.maxMs == null ? '—' : `${latency.maxMs} ms`} />
        </div>
        <Sparkline points={health.performanceSparks.latency} />
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-[var(--heading)]">
            Tráfico
          </h3>
          <p className="mt-1 text-xs text-[var(--muted)]">{traffic.note}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Req / min"
            value={traffic.requestsPerMinute == null ? '—' : String(traffic.requestsPerMinute)}
          />
          <Stat
            label="Req / seg"
            value={traffic.requestsPerSecond == null ? '—' : String(traffic.requestsPerSecond)}
          />
          <Stat
            label="Req / hora"
            value={traffic.requestsPerHour == null ? '—' : String(traffic.requestsPerHour)}
          />
          <Stat
            label="Pico 24h"
            value={traffic.peakRpm24h == null ? '—' : String(traffic.peakRpm24h)}
          />
        </div>
        <Sparkline points={health.performanceSparks.rpm} />
      </Card>

      <Card className="space-y-3 p-5">
        <h3 className="text-sm font-black uppercase tracking-widest text-[var(--heading)]">
          Distribución HTTP
        </h3>
        <p className="text-xs text-[var(--muted)]">{httpStatus.note}</p>
        {httpStatus.buckets.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Aún no hay muestras. Se llenan con el tráfico de API.
          </p>
        ) : (
          <div className="space-y-2">
            {httpStatus.buckets.map((b) => (
              <div key={b.code} className="flex items-center gap-3 text-xs">
                <span className="w-12 font-black text-[var(--heading)]">{b.code}</span>
                <div className="h-2 flex-1 rounded-full bg-[var(--surface-hover)]">
                  <div
                    className="h-2 rounded-full bg-[var(--accent)]"
                    style={{ width: `${Math.max(2, Math.min(100, b.pct))}%` }}
                  />
                </div>
                <span className="w-24 text-right tabular-nums text-[var(--muted)]">
                  {b.count} · {b.pct}%
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
