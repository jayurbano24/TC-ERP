import { ArrowLeft, DeleteIcon, Loader2 } from 'lucide-react';

type KioskCodePadProps = {
  value: string;
  statusMessage: string;
  isError: boolean;
  isVerifying: boolean;
  onChange: (value: string) => void;
  onBack: () => void;
  onSubmit: () => void;
};

export function KioskCodePad({
  value,
  statusMessage,
  isError,
  isVerifying,
  onChange,
  onBack,
  onSubmit,
}: KioskCodePadProps) {
  const append = (digit: string) => onChange(value + digit);
  const clear = () => onChange('');
  const backspace = () => onChange(value.slice(0, -1));

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 flex min-h-11 items-center gap-1.5 self-start text-xs font-semibold uppercase tracking-wide text-neutral-600 transition-colors hover:text-neutral-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Volver
      </button>
      <p className="mb-4 text-center text-sm font-medium leading-relaxed text-neutral-600">
        Ingrese su <span className="font-semibold text-neutral-900">Código de Empleado</span> y
        luego confirme con su rostro.
      </p>

      <label className="sr-only" htmlFor="kiosk-employee-code">
        Código de empleado
      </label>
      <input
        id="kiosk-employee-code"
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        placeholder="Código"
        autoFocus
        className="mb-4 w-full rounded-xl border-2 border-accent/50 bg-neutral-50 py-3 text-center text-3xl font-bold tracking-widest text-neutral-900 outline-none transition-colors focus:border-accent"
      />

      <div className="mb-4 grid w-full grid-cols-3 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => append(String(num))}
            className="min-h-14 rounded-xl border border-neutral-200 bg-neutral-100 text-xl font-bold text-neutral-900 transition-colors hover:bg-neutral-200 active:scale-[0.98]"
          >
            {num}
          </button>
        ))}
        <button
          type="button"
          onClick={clear}
          className="min-h-14 rounded-xl bg-danger/15 text-xs font-bold uppercase text-danger transition-colors hover:bg-danger/25"
        >
          Borrar
        </button>
        <button
          type="button"
          onClick={() => append('0')}
          className="min-h-14 rounded-xl border border-neutral-200 bg-neutral-100 text-xl font-bold text-neutral-900 transition-colors hover:bg-neutral-200 active:scale-[0.98]"
        >
          0
        </button>
        <button
          type="button"
          onClick={backspace}
          aria-label="Borrar último dígito"
          className="flex min-h-14 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-100 text-neutral-900 transition-colors hover:bg-neutral-200"
        >
          <DeleteIcon className="h-5 w-5" />
        </button>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={!value || isVerifying}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-lg font-bold tracking-wide text-accent-foreground transition-transform hover:bg-accent/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
      >
        {isVerifying ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Siguiente'}
      </button>

      {statusMessage ? (
        <p
          className={`mt-3 text-center text-xs font-semibold ${isError ? 'text-danger' : 'text-accent'}`}
          role="status"
        >
          {statusMessage}
        </p>
      ) : null}
    </>
  );
}
