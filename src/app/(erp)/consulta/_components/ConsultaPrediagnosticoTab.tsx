'use client';

import { User, ClipboardList } from 'lucide-react';
import type { ConsultaPrediagnosticoRow } from '@/modules/traceability/client/consultaPrediagnostico';
type IngresoCyclePick = {
  id: string;
  os_label: string | null;
  reentry_count: number;
};

type Props = {
  ingresoHistory: IngresoCyclePick[];
  prediagnosticoByOs: Record<string, ConsultaPrediagnosticoRow>;
  selectedOsId: string | null;
  onSelectOsId: (id: string) => void;
  formatDate: (iso: string) => string;
  formatTime: (iso: string) => string;
};

export function ConsultaPrediagnosticoTab({
  ingresoHistory,
  prediagnosticoByOs,
  selectedOsId,
  onSelectOsId,
  formatDate,
  formatTime,
}: Props) {
  const cyclesWithPrediag = ingresoHistory.filter((c) => prediagnosticoByOs[c.id]);
  const active =
    (selectedOsId && prediagnosticoByOs[selectedOsId]) ||
    (cyclesWithPrediag[0] ? prediagnosticoByOs[cyclesWithPrediag[0].id] : null);

  if (cyclesWithPrediag.length === 0) {
    return (
      <div className="text-center py-12">
        <ClipboardList className="h-12 w-12 text-[var(--muted)] mx-auto mb-4" />
        <p className="text-[var(--muted)] text-lg">
          No hay pre-diagnóstico registrado para los ingresos de este equipo.
        </p>
      </div>
    );
  }

  const activeCycle = ingresoHistory.find((c) => c.id === active?.serviceOrderId);
  const checkEntries = active
    ? Object.entries(active.checkCells).filter(([key]) => key !== 'Clase' || active.checkCells.Clase)
    : [];

  return (
    <div className="space-y-4">
      {cyclesWithPrediag.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {cyclesWithPrediag.map((cycle) => (
            <button
              key={cycle.id}
              type="button"
              onClick={() => onSelectOsId(cycle.id)}
              className={`rounded-lg border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-colors ${
                active?.serviceOrderId === cycle.id
                  ? 'border-violet-500/50 bg-violet-500/15 text-violet-300'
                  : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]'
              }`}
            >
              {cycle.os_label || 'OS'} · {formatIngresoShort(cycle.reentry_count)}
            </button>
          ))}
        </div>
      )}

      {active && (
        <>
          <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-4 space-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
              <span className="font-mono font-bold text-[var(--accent)]">
                {activeCycle?.os_label || '—'}
              </span>
              <span className="text-[var(--muted)]">·</span>
              <span className="inline-flex items-center gap-1.5 text-[var(--foreground)]">
                <User className="h-3.5 w-3.5 text-violet-400" />
                <span className="text-[10px] uppercase tracking-widest text-[var(--muted)] mr-1">
                  Pre-diagnosticado por
                </span>
                <span className="font-bold">{active.operatorName}</span>
              </span>
              {active.performedAt && (
                <>
                  <span className="text-[var(--muted)]">·</span>
                  <span className="text-[var(--muted)]">
                    {formatDate(active.performedAt)} {formatTime(active.performedAt)}
                  </span>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <Badge label="Dictamen" value={active.dictamenLabel || '—'} accent />
              <Badge label="Clase carcasa" value={active.checkCells.Clase || active.claseCarcasa || '—'} />
            </div>
          </div>

          {checkEntries.filter(([k]) => k !== 'Clase').length > 0 && (
            <div className="border border-[var(--border)] rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm text-[var(--foreground)]">
                <thead className="bg-[var(--surface-hover)] text-xs uppercase font-bold text-[var(--muted)] border-b border-[var(--border)]">
                  <tr>
                    <th className="px-4 py-3">Ítem</th>
                    <th className="px-4 py-3 w-28 text-center">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] bg-[var(--surface)]">
                  {checkEntries
                    .filter(([key]) => key !== 'Clase')
                    .map(([key, value]) => (
                      <tr key={key} className="hover:bg-[var(--surface-hover)]">
                        <td className="px-4 py-2.5 font-medium">{key}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span
                            className={`inline-block min-w-[2.5rem] px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                              value === 'Si'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : value === 'No'
                                  ? 'bg-rose-500/15 text-rose-400'
                                  : 'bg-[var(--surface-hover)] text-[var(--muted)]'
                            }`}
                          >
                            {value || '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-1">
              Comentarios / Observaciones
            </p>
            {active.observacionesDisplay.trim() ? (
              <p className="text-sm text-[var(--foreground)] whitespace-pre-wrap">
                {active.observacionesDisplay}
              </p>
            ) : (
              <p className="text-sm text-[var(--muted)] italic">Sin comentarios del operador.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Badge({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        accent ? 'border-violet-500/40 bg-violet-500/10' : 'border-[var(--border)] bg-[var(--surface)]'
      }`}
    >
      <p className="text-[9px] font-black uppercase tracking-widest text-[var(--muted)]">{label}</p>
      <p className="text-sm font-bold text-[var(--foreground)] mt-0.5">{value}</p>
    </div>
  );
}

function formatIngresoShort(reentry: number): string {
  if (reentry <= 1) return '1° ingreso';
  if (reentry === 2) return '2° ingreso';
  return `${reentry}° ingreso`;
}
