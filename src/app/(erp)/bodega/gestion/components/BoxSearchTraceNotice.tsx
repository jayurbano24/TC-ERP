'use client';

import { ArrowRightLeft, Clock3, MapPin, PackageSearch, UserRound } from 'lucide-react';
import { Badge, Card } from '@/components/ui';
import type { ExternalBoxTrace } from '@/modules/inventario/domain/boxLocationTrace';

type Props = {
  trace: ExternalBoxTrace;
};

function outcomeBadgeVariant(
  outcome: ExternalBoxTrace['outcome'],
): 'red' | 'yellow' | 'blue' | 'slate' {
  if (outcome === 'ADMIN_DELETED' || outcome === 'SCRAP') return 'red';
  if (outcome === 'DISPATCHED' || outcome === 'OUTBOUND') return 'blue';
  if (outcome === 'TRANSFERRED') return 'yellow';
  return 'slate';
}

export function BoxSearchTraceNotice({ trace }: Props) {
  return (
    <Card className="border-l-4 border-l-amber-500 p-4" padding="none">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="shrink-0 rounded-xl bg-amber-500/10 p-2.5 text-amber-600">
            <PackageSearch className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-base font-bold text-[var(--heading)]">
                {trace.boxCode}
              </span>
              <Badge variant={outcomeBadgeVariant(trace.outcome)}>
                FUERA DE BODEGA CENTRAL
              </Badge>
              <Badge variant="slate">{trace.outcomeLabel}</Badge>
            </div>
            <p className="text-sm text-[var(--foreground)]">{trace.detail}</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--muted)]">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                Ubicación:{' '}
                <strong className="text-[var(--foreground)]">{trace.locationLabel}</strong>
              </span>
              {trace.destination ? (
                <span className="inline-flex items-center gap-1.5">
                  <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  Destino: <strong className="text-[var(--foreground)]">{trace.destination}</strong>
                </span>
              ) : null}
              {trace.reference ? (
                <span>
                  Referencia: <strong className="text-[var(--foreground)]">{trace.reference}</strong>
                </span>
              ) : null}
              {trace.movedAt ? (
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                  {new Date(trace.movedAt).toLocaleString('es-GT')}
                </span>
              ) : null}
              {trace.performedBy ? (
                <span className="inline-flex items-center gap-1.5">
                  <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                  {trace.performedBy}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {trace.statusCounts.length > 0 ? (
          <div className="min-w-64 rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
              Ubicación actual de {trace.currentUnits} equipos
            </p>
            <ul className="space-y-1.5">
              {trace.statusCounts.map((item) => (
                <li key={item.status} className="flex flex-col gap-0.5">
                  <Badge variant="slate" className="self-start">
                    {item.label}: {item.count}
                  </Badge>
                  {item.locations.length > 0 ? (
                    <span className="text-[11px] text-[var(--muted)]">
                      {item.locations.join(' · ')}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
