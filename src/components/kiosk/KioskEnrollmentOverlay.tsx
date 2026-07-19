type RegisterEmployee = {
  id: string;
  nombre_completo: string;
};

type KioskEnrollmentOverlayProps = {
  step: 'pin' | 'select' | 'capture';
  pinCode: string;
  employees: RegisterEmployee[];
  onPinChange: (value: string) => void;
  onCancel: () => void;
  onVerifyPin: () => void;
  onSelectEmployee: (employee: RegisterEmployee) => void;
};

export function KioskEnrollmentOverlay({
  step,
  pinCode,
  employees,
  onPinChange,
  onCancel,
  onVerifyPin,
  onSelectEmployee,
}: KioskEnrollmentOverlayProps) {
  if (step === 'capture') return null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[var(--sidebar)]/95 p-6 backdrop-blur-md animate-in zoom-in-95">
      {step === 'pin' && (
        <div className="w-full max-w-sm">
          <h2 className="mb-4 text-center text-2xl font-bold text-white">Autorización Kiosko</h2>
          <label className="sr-only" htmlFor="kiosk-enroll-pin">
            PIN de administración
          </label>
          <input
            id="kiosk-enroll-pin"
            type="password"
            inputMode="numeric"
            value={pinCode}
            onChange={(e) => onPinChange(e.target.value)}
            placeholder="PIN Admin"
            autoFocus
            className="mb-4 h-14 w-full rounded-xl border-2 border-white/15 bg-white/5 px-4 text-center text-2xl tracking-widest text-white outline-none focus:border-accent"
          />
          <div className="flex gap-4">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-14 flex-1 rounded-xl bg-white/10 font-bold text-white transition-colors hover:bg-white/15"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onVerifyPin}
              className="min-h-14 flex-1 rounded-xl bg-accent font-bold text-accent-foreground transition-colors hover:bg-accent/90"
            >
              Verificar
            </button>
          </div>
        </div>
      )}

      {step === 'select' && (
        <div className="w-full max-w-md">
          <h2 className="mb-4 text-center text-xl font-bold text-white">
            Seleccionar Empleado a Registrar
          </h2>
          <div className="mb-4 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-2">
            {employees.length > 0 ? (
              employees.map((emp) => (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => onSelectEmployee(emp)}
                  className="w-full rounded-lg border-b border-white/5 px-4 py-3 text-left font-bold text-white transition-colors last:border-0 hover:bg-accent/20 hover:text-accent"
                >
                  {emp.nombre_completo}
                </button>
              ))
            ) : (
              <p className="py-4 text-center text-white/50">Cargando empleados...</p>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-14 w-full rounded-xl bg-white/10 font-bold text-white transition-colors hover:bg-white/15"
          >
            Cancelar Registro
          </button>
        </div>
      )}
    </div>
  );
}
