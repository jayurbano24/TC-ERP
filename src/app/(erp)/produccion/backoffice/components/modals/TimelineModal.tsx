'use client';

import { Badge, Card } from '@/components/ui';
import { Clock, History, Loader2, X } from 'lucide-react';
import { getAgenciaLabel } from '../../backofficeHelpers';
import type { CatalogAgency } from '../../types';

type Props = {
  reception: any;
  activeGuide: string | null;
  agencies: CatalogAgency[];
  loading?: boolean;
  onActiveGuideChange: (g: string | null) => void;
  onClose: () => void;
};

export function TimelineModal({
  reception,
  activeGuide,
  agencies,
  loading = false,
  onActiveGuideChange,
  onClose,
}: Props) {
  const statusLabel = reception.status || reception.unitStatusLabel || '—';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <Card className="w-full max-w-2xl bg-[var(--surface)] rounded-[2.5rem] shadow-2xl border border-[var(--border)] overflow-hidden animate-rise-in p-0">
        <div className="p-8 border-b border-[var(--border)] flex justify-between items-center bg-[var(--surface-hover)]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[var(--accent)]/15 rounded-2xl flex items-center justify-center text-[var(--accent)]">
              <History size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-[var(--heading)] uppercase tracking-tighter leading-none">
                Trazabilidad de la Guía
              </h3>
              <p className="text-[10px] font-bold text-[var(--muted)] uppercase mt-2 tracking-widest font-mono">
                {reception.guide_number}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onClose()}
            className="w-10 h-10 rounded-full bg-[var(--surface)] shadow-sm flex items-center justify-center text-[var(--muted)] hover:text-rose-500 transition-all border border-[var(--border)]"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-10 max-h-[60vh] overflow-y-auto custom-scrollbar bg-[var(--surface)]">
          {reception.processed_guides && reception.processed_guides.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-8">
              <button
                type="button"
                onClick={() => onActiveGuideChange(null)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  !activeGuide
                    ? 'bg-[var(--heading)] text-[var(--surface)] shadow-md'
                    : 'bg-[var(--surface-hover)] text-[var(--muted)] hover:text-[var(--foreground)]'
                }`}
              >
                Toda la Recepción
              </button>
              {Array.from(new Set(reception.processed_guides)).map((g: any) => (
                <button
                  type="button"
                  key={g}
                  onClick={() => onActiveGuideChange(g)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    activeGuide === g
                      ? 'bg-[var(--accent)] text-[var(--accent-foreground)] shadow-md'
                      : 'bg-[var(--surface-hover)] text-[var(--muted)] hover:text-[var(--foreground)]'
                  }`}
                >
                  Guía {g}
                </button>
              ))}
            </div>
          )}
          <div className="relative border-l-2 border-[var(--border)] ml-4 space-y-10">
            {(() => {
              if (loading) {
                return (
                  <div className="text-center py-20 text-[var(--muted)]">
                    <Loader2 size={40} className="mx-auto mb-4 animate-spin text-[var(--accent)]" />
                    <p className="text-xs font-black uppercase tracking-widest">Cargando eventos...</p>
                  </div>
                );
              }

              const notes = reception.notes || '';
              let timelinePart = '';
              if (notes.includes('--- LÍNEA DE TIEMPO (MATRIZ) ---')) {
                timelinePart = notes.split('--- LÍNEA DE TIEMPO (MATRIZ) ---').pop() || '';
              } else if (notes.includes('--- LÍNEA DE TIEMPO ---')) {
                timelinePart = notes.split('--- LÍNEA DE TIEMPO ---').pop() || '';
              }
              const events = timelinePart
                .trim()
                .split('\n')
                .filter((l: string) => l.trim() !== '');

              let filteredEvents = events;
              if (activeGuide) {
                filteredEvents = events.filter((event: string) => {
                  if (!event.includes('(Guía ')) return true;
                  return event.includes(activeGuide);
                });
              }

              if (filteredEvents.length === 0) {
                return (
                  <div className="text-center py-20 text-[var(--muted)] opacity-40">
                    <Clock size={48} className="mx-auto mb-4" />
                    <p className="text-xs font-black uppercase tracking-widest">Sin eventos registrados</p>
                  </div>
                );
              }

              let lastKnownTime = '';
              return filteredEvents.map((event: string, idx: number) => {
                let cleanTime = '';
                let content = '';

                if (event.includes('] ')) {
                  const [timeStr, ...rest] = event.split('] ');
                  cleanTime = (timeStr || '').replace('[', '');
                  lastKnownTime = cleanTime;
                  content = rest.join('] ');
                } else {
                  if (
                    event.includes('---') ||
                    event.toUpperCase().includes('BACKOFFICE_') ||
                    event.toUpperCase().includes('GUÍAS PROCESADAS')
                  ) {
                    return null;
                  }
                  content = event;
                  cleanTime = lastKnownTime;
                }

                const pipeParts = content.split(' | ');
                let meta = '';
                let body = content;
                if (pipeParts.length > 2) {
                  meta = pipeParts[0] + ' | ' + pipeParts[1];
                  body = pipeParts.slice(2).join(' | ');
                } else if (pipeParts.length === 2) {
                  meta = pipeParts[0];
                  body = pipeParts[1];
                }

                let action = '';
                let detail = '';

                if (body) {
                  const parts = body.split(': ');
                  if (parts.length > 1) {
                    action = parts[0];
                    detail = parts.slice(1).join(': ');
                  } else {
                    action = 'METADATO / EVENTO';
                    detail = body;
                  }
                } else if (content) {
                  const parts = content.split(': ');
                  if (parts.length > 1) {
                    action = parts[0];
                    detail = parts.slice(1).join(': ');
                  } else {
                    action = 'METADATO / EVENTO';
                    detail = content;
                  }
                }

                if (action.toUpperCase() === 'STATUS' && detail.toUpperCase() === 'RECIBIDO_BACKOFFICE') {
                  const agenciaNombre = getAgenciaLabel(reception, agencies);
                  if (agenciaNombre && agenciaNombre !== '---') {
                    detail = `${detail} - EN CAC / AGENCIA: ${agenciaNombre}`;
                  }
                }

                return (
                  <div key={idx} className="relative pl-10 group">
                    <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-[var(--surface)] border-2 border-[var(--accent)] group-hover:scale-125 transition-transform shadow-sm" />
                    <div className="flex justify-between items-start mb-1">
                      {cleanTime && (
                        <p className="text-[9px] font-black text-[var(--accent)] uppercase tracking-widest">
                          {cleanTime}
                        </p>
                      )}
                      <Badge className="bg-[var(--surface-hover)] text-[var(--muted)] border-none text-[7px] font-black tracking-tighter px-1.5 h-4">
                        {meta.replace(' | ', ' • ')}
                      </Badge>
                    </div>
                    <h4 className="text-sm font-black text-[var(--heading)] uppercase mb-1 tracking-tight">
                      {action}
                    </h4>
                    <p className="text-[11px] font-bold text-[var(--muted)] leading-relaxed uppercase">{detail}</p>
                  </div>
                );
              });
            })()}
          </div>
        </div>
        <div className="p-8 bg-[var(--surface-hover)] text-center border-t border-[var(--border)]">
          <span className="inline-flex items-center rounded-2xl bg-[var(--heading)] px-8 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--surface)] shadow-xl">
            Estatus Actual: {statusLabel}
          </span>
        </div>
      </Card>
    </div>
  );
}
