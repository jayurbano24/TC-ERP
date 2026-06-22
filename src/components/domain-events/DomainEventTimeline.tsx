'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import {
  fetchCorrelationTimeline,
  fetchEntityTimeline,
  type DomainEventRow,
} from '@/lib/database/domainEvents';
import {
  domainEventAccent,
  filterDomainEventsByGuide,
  formatDomainEventDetail,
  formatDomainEventLabel,
} from '@/lib/domain-events/formatDomainEvent';

type Props = {
  correlationId?: string | null;
  aggregateType?: string;
  aggregateId?: string;
  title?: string;
  limit?: number;
  pollMs?: number;
  refreshKey?: string | number;
  compact?: boolean;
  className?: string;
  filterGuide?: string | null;
  onLoaded?: (meta: { visibleCount: number; totalCount: number }) => void;
  hideEmptyMessage?: boolean;
};

const ACCENT_DOT: Record<string, string> = {
  cyan: 'bg-[#2ec4f1]',
  navy: 'bg-[#181c3a]',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  slate: 'bg-slate-400',
};

export function DomainEventTimeline({
  correlationId,
  aggregateType,
  aggregateId,
  title = 'Línea de tiempo',
  limit = 50,
  pollMs,
  refreshKey,
  compact = false,
  className = '',
  filterGuide = null,
  onLoaded,
  hideEmptyMessage = false,
}: Props) {
  const [events, setEvents] = useState<DomainEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canLoad = Boolean(correlationId || (aggregateType && aggregateId));

  const load = useCallback(async () => {
    if (!canLoad) {
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const result = correlationId
      ? await fetchCorrelationTimeline(correlationId, limit)
      : await fetchEntityTimeline(aggregateType!, aggregateId!, limit);

    if (result.error) {
      setError(result.error);
      setEvents([]);
    } else {
      setEvents(result.data ?? []);
    }
    setLoading(false);
  }, [aggregateId, aggregateType, canLoad, correlationId, limit]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!pollMs || !canLoad) return;
    const timer = setInterval(() => {
      void load();
    }, pollMs);
    return () => clearInterval(timer);
  }, [canLoad, load, pollMs]);

  const sortedEvents = useMemo(() => {
    const filtered = filterDomainEventsByGuide(events, filterGuide);
    return [...filtered].sort(
      (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
    );
  }, [events, filterGuide]);

  useEffect(() => {
    if (loading || !onLoaded) return;
    onLoaded({
      visibleCount: sortedEvents.length,
      totalCount: events.length,
    });
  }, [events.length, loading, onLoaded, sortedEvents.length]);

  if (!canLoad) return null;

  return (
    <div className={`${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <History className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-[#2ec4f1]`} />
        <p className={`font-black uppercase tracking-widest text-[#181c3a] ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
          {title}
        </p>
        {!loading && (
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
            {sortedEvents.length} evento(s)
          </span>
        )}
      </div>

      {loading ? (
        <div className={`flex items-center gap-2 text-slate-400 ${compact ? 'py-3' : 'py-6'}`}>
          <Spinner size="sm" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Cargando timeline…</span>
        </div>
      ) : error ? (
        <p className="text-[11px] text-rose-500 font-bold">{error}</p>
      ) : sortedEvents.length === 0 ? (
        hideEmptyMessage ? null : (
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wide">
            Sin eventos estructurados aún
          </p>
        )
      ) : (
        <div className={`relative ${compact ? 'pl-5 space-y-3' : 'pl-6 space-y-4'}`}>
          <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-slate-200" />
          {sortedEvents.map((event) => {
            const accent = domainEventAccent(event.event_type);
            const dotClass = ACCENT_DOT[accent] ?? ACCENT_DOT.slate;
            return (
              <div key={event.id} className="relative flex items-start gap-3">
                <div
                  className={`absolute -left-[22px] ${compact ? 'w-4 h-4 border-2' : 'w-5 h-5 border-[3px]'} rounded-full border-slate-50 ${dotClass} z-10`}
                />
                <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 flex-1 min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className={`font-black uppercase tracking-wide text-[#181c3a] ${compact ? 'text-[10px]' : 'text-xs'}`}>
                      {formatDomainEventLabel(event.event_type)}
                    </p>
                    <p className="text-[9px] font-bold text-slate-400 whitespace-nowrap">
                      {new Date(event.occurred_at).toLocaleString('es-GT')}
                    </p>
                  </div>
                  <p className={`text-slate-500 mt-1 ${compact ? 'text-[10px]' : 'text-[11px]'} font-medium break-words`}>
                    {formatDomainEventDetail(event)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
