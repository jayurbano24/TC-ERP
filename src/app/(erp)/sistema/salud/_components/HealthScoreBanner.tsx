'use client';

import { Badge, Card } from '@/components/ui';
import type { DiagnosisHint, DeployMeta, HealthOverall, SystemHealthReport } from '@/modules/system-health/types';

type Props = {
  score: number;
  overall: HealthOverall;
  riskLabel: SystemHealthReport['riskLabel'];
  alertsCount: number;
  incidentsCritical: number;
  deploy: DeployMeta;
  diagnosis: DiagnosisHint;
  checkedAt: string;
};

function scoreTone(score: number, overall: HealthOverall) {
  if (overall === 'down' || score < 40) return 'text-[var(--danger)]';
  if (overall === 'degraded' || score < 85) return 'text-[var(--warning)]';
  return 'text-[var(--success)]';
}

function relativeChecked(iso: string) {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `hace ${sec}s`;
  const min = Math.floor(sec / 60);
  return `hace ${min} min`;
}

export function HealthScoreBanner({
  score,
  overall,
  riskLabel,
  alertsCount,
  incidentsCritical,
  deploy,
  diagnosis,
  checkedAt,
}: Props) {
  const width = Math.max(0, Math.min(100, score));
  return (
    <Card className="space-y-4 border-l-4 border-l-[var(--accent)] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
            Health Center · {deploy.environment}
          </p>
          <h2 className="mt-1 text-lg font-black uppercase tracking-tight text-[var(--heading)]">
            Health Score
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Actualizado {relativeChecked(checkedAt)} · Auto-refresh 15s
            {deploy.commitShort ? ` · ${deploy.commitShort}` : ''}
            {deploy.branch ? ` · ${deploy.branch}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="border-none bg-[var(--surface-hover)] text-[var(--heading)] text-[9px] font-black uppercase">
            v{deploy.version}
          </Badge>
          <Badge
            className={`border-none text-[9px] font-black uppercase ${
              overall === 'ok'
                ? 'bg-[var(--success)]/15 text-[var(--success)]'
                : overall === 'degraded'
                  ? 'bg-[var(--warning)]/15 text-[var(--warning)]'
                  : 'bg-[var(--danger)]/15 text-[var(--danger)]'
            }`}
          >
            {overall === 'ok' ? 'Online' : overall}
          </Badge>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className={`text-5xl font-black tabular-nums ${scoreTone(score, overall)}`}>
            {score}
            <span className="text-xl text-[var(--muted)]">%</span>
          </p>
          <div className="mt-3 h-2 w-full max-w-md overflow-hidden rounded-full bg-[var(--surface-hover)]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all"
              style={{ width: `${width}%` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { k: 'Disponibilidad', v: overall === 'ok' ? 'OK' : overall },
            { k: 'Incidentes', v: String(incidentsCritical) },
            { k: 'Alertas', v: String(alertsCount) },
            { k: 'Riesgo', v: riskLabel },
          ].map((item) => (
            <div
              key={item.k}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] px-3 py-2"
            >
              <p className="text-[9px] font-black uppercase tracking-widest text-[var(--muted)]">
                {item.k}
              </p>
              <p className="mt-1 text-sm font-black text-[var(--heading)]">{item.v}</p>
            </div>
          ))}
        </div>
      </div>

      <div
        className={`rounded-xl border px-4 py-3 text-sm ${
          diagnosis.needsIntervention
            ? 'border-[var(--danger)]/40 bg-[var(--danger)]/10 text-[var(--heading)]'
            : 'border-[var(--border)] bg-[var(--surface-hover)] text-[var(--muted)]'
        }`}
      >
        <p className="text-[10px] font-black uppercase tracking-widest">
          {diagnosis.needsIntervention ? 'Intervenir' : 'Sin intervención'}
        </p>
        <p className="mt-1 font-semibold text-[var(--heading)]">{diagnosis.summary}</p>
        <p className="mt-1 text-xs">{diagnosis.recommendedAction}</p>
      </div>
    </Card>
  );
}
