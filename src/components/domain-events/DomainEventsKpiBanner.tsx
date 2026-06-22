'use client';

import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import {
  fetchDomainEventsKpiSummary,
  type DomainEventsKpiSummary,
} from '@/lib/database/domainEvents';

type Props = {
  days?: number;
  compact?: boolean;
  className?: string;
};

function toDisplayCount(value: number | undefined): number {
  return Number.isFinite(value) ? (value as number) : 0;
}

export function DomainEventsKpiBanner({ days = 30, compact = false, className = '' }: Props) {
  const [stats, setStats] = useState<DomainEventsKpiSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDomainEventsKpiSummary(days)
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (loading) {
    return (
      <Card className={`p-4 bg-slate-50 border border-slate-100 ${className}`}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Cargando trazabilidad estructurada…
        </p>
      </Card>
    );
  }

  if (!stats) return null;

  const equiposCac = toDisplayCount(stats.equiposClasificados);
  const equiposPx = toDisplayCount(stats.equiposCapturados);
  const equiposTotales = toDisplayCount(stats.equiposTotales) || equiposCac + equiposPx;
  const eventosCac = toDisplayCount(stats.eventosCac);
  const eventosPx = toDisplayCount(stats.eventosPx);
  const eventosTotales = toDisplayCount(stats.total);
  const hitosCac = toDisplayCount(stats.hitosCac) || Math.max(0, eventosCac - equiposCac);

  const equipmentItems = [
    {
      label: 'Equipos totales',
      value: equiposTotales,
      accent: 'text-[#181c3a]',
      hint: 'CAC + PX',
    },
    {
      label: 'Equipos CAC',
      value: equiposCac,
      accent: 'text-[#2ec4f1]',
      hint: 'Clasificados',
    },
    {
      label: 'Equipos PX',
      value: equiposPx,
      accent: 'text-emerald-600',
      hint: 'Capturados',
    },
  ];

  const eventItems = [
    {
      label: 'Eventos totales',
      value: eventosTotales,
      accent: 'text-slate-600',
      hint: 'Timeline',
    },
    {
      label: 'Eventos CAC',
      value: eventosCac,
      accent: 'text-indigo-500',
      hint: hitosCac > 0 ? `+${hitosCac} hitos` : 'Trazabilidad',
    },
    {
      label: 'Eventos PX',
      value: eventosPx,
      accent: 'text-teal-600',
      hint: 'Recepción',
    },
  ];

  const items = compact
    ? [...equipmentItems, eventItems[0]]
    : [...equipmentItems, ...eventItems];

  return (
    <Card
      className={`${compact ? 'p-4' : 'p-5'} bg-gradient-to-r from-[#181c3a]/5 to-[#2ec4f1]/5 border border-[#2ec4f1]/20 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <History className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} text-[#2ec4f1]`} />
          <p className={`font-black uppercase tracking-widest text-[#181c3a] ${compact ? 'text-[10px]' : 'text-xs'}`}>
            Trazabilidad estructurada · últimos {stats.days} días
          </p>
        </div>
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
          {toDisplayCount(stats.withAuditLink)} con enlace audit
        </p>
      </div>

      {!compact && (
        <p className="text-[9px] text-slate-500 mb-3 leading-relaxed">
          Los <strong>equipos</strong> son unidades físicas ({equiposCac} CAC + {equiposPx} PX).
          Los <strong>eventos CAC ({eventosCac})</strong> incluyen también hitos de SAP, guías y recepciones
          ({hitosCac} adicionales), no se suman a equipos.
        </p>
      )}

      <div
        className={`grid ${
          compact ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6'
        } gap-3`}
      >
        {items.map((item) => (
          <div key={item.label} className="bg-white/80 rounded-xl px-3 py-2 border border-white shadow-sm">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{item.label}</p>
            <p className={`text-xl font-black ${item.accent}`}>{item.value.toLocaleString('es-GT')}</p>
            <p className="text-[8px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">{item.hint}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
