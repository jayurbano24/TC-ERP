import { Info } from 'lucide-react';

type KioskJustificationPanelProps = {
  employeeName?: string;
  prompt: string;
  action: string;
  specialDirection: string;
  selectedReason: string;
  otherReason: string;
  options: string[];
  onSpecialDirectionChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onOtherReasonChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export function KioskJustificationPanel({
  employeeName,
  prompt,
  action,
  specialDirection,
  selectedReason,
  otherReason,
  options,
  onSpecialDirectionChange,
  onReasonChange,
  onOtherReasonChange,
  onCancel,
  onSubmit,
}: KioskJustificationPanelProps) {
  const eventLabel =
    action === 'MARCAJE_ESPECIAL'
      ? specialDirection === 'SALIDA_FINAL'
        ? 'Retiro (Salida)'
        : 'Entrada (Ingreso)'
      : action.replace(/_/g, ' ');

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[var(--sidebar)]/95 p-6 text-center backdrop-blur-md animate-in zoom-in-95">
      <Info className="mb-4 h-16 w-16 text-warning" aria-hidden />
      <h2 className="mb-2 text-2xl font-bold text-white">Justificación Requerida</h2>
      {employeeName ? (
        <p className="mb-1 text-lg font-semibold capitalize text-accent">{employeeName}</p>
      ) : null}
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
        Evento: <span className="text-white/80">{eventLabel}</span>
      </p>
      <p className="mb-8 max-w-md text-sm text-white/70">{prompt}</p>

      <div className="mb-8 w-full max-w-md space-y-4">
        {action === 'MARCAJE_ESPECIAL' && (
          <select
            value={specialDirection}
            onChange={(e) => onSpecialDirectionChange(e.target.value)}
            aria-label="Dirección del marcaje especial"
            className="h-14 w-full rounded-xl border-2 border-accent/40 bg-white/5 px-4 text-left font-bold text-white outline-none"
          >
            <option value="INGRESO">Registrar como: Entrada (Ingreso)</option>
            <option value="SALIDA_FINAL">Registrar como: Retiro (Salida)</option>
          </select>
        )}

        <select
          value={selectedReason}
          onChange={(e) => onReasonChange(e.target.value)}
          aria-label="Motivo de justificación"
          className="h-14 w-full rounded-xl border-2 border-white/15 bg-white/5 px-4 font-bold text-white outline-none focus:border-warning"
        >
          <option value="" disabled>
            Seleccione una justificación...
          </option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>

        {selectedReason === 'Otros' && (
          <input
            type="text"
            value={otherReason}
            onChange={(e) => onOtherReasonChange(e.target.value)}
            placeholder="Escriba el motivo brevemente..."
            maxLength={80}
            aria-label="Motivo personalizado"
            className="h-14 w-full rounded-xl border-2 border-white/15 bg-white/5 px-4 font-medium text-white outline-none focus:border-warning"
          />
        )}
      </div>

      <div className="flex w-full max-w-md gap-4">
        <button
          type="button"
          onClick={onCancel}
          className="h-14 flex-1 rounded-xl bg-white/10 font-bold text-white transition-colors hover:bg-white/15"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSubmit}
          className="h-14 flex-1 rounded-xl bg-warning font-bold text-[var(--sidebar)] transition-colors hover:bg-warning/90"
        >
          Registrar
        </button>
      </div>
    </div>
  );
}
