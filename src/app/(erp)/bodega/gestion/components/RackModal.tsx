'use client';

import { memo } from 'react';
import { Card, Button } from '@/components/ui';
import { MapPin, X } from 'lucide-react';

type Props = {
  box: any;
  rackNum: string;
  setRackNum: (v: string) => void;
  rackNivel: string;
  setRackNivel: (v: string) => void;
  rackPosicion: string;
  setRackPosicion: (v: string) => void;
  loading: boolean;
  onClose: () => void;
  onSave: () => void;
  /** Si se asigna a varias cajas a la vez, número de cajas seleccionadas. */
  count?: number;
};

/**
 * C1: modal de ubicación (rack) extraído del monolito bodega/gestion y memoizado.
 * El estado vive en el padre; aquí solo se reciben valores + setters/callbacks.
 */
export const RackModal = memo(function RackModal({
  box,
  rackNum,
  setRackNum,
  rackNivel,
  setRackNivel,
  rackPosicion,
  setRackPosicion,
  loading,
  onClose,
  onSave,
  count,
}: Props) {
  const isBulk = typeof count === 'number' && count > 1;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <Card className="w-full max-w-md p-0 shadow-2xl rounded-3xl border border-[var(--border)] animate-in fade-in zoom-in duration-200 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/15">
              <MapPin className="w-5 h-5 text-[var(--accent)]" />
            </div>
            <h3 className="text-lg font-black text-[var(--heading)]">
              {isBulk ? 'Ubicación Masiva (Rack)' : 'Actualizar Ubicación (Rack)'}
            </h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <div className="p-6">
        <p className="text-sm text-[var(--muted)] mb-6">
          {isBulk ? (
            <>Ingrese las coordenadas que se aplicarán a las <strong className="text-[var(--heading)]">{count} cajas seleccionadas</strong>.</>
          ) : (
            <>Ingrese las coordenadas exactas de la ubicación para la caja <strong className="text-[var(--heading)]">{box?.id}</strong>.</>
          )}
        </p>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-2 block">
                No. Rack
              </label>
              <input
                type="text"
                autoFocus
                className="w-full h-12 px-3 bg-[var(--surface-hover)] border-2 border-[var(--border)] rounded-xl text-sm font-bold outline-none focus:border-[var(--accent)] focus:bg-[var(--surface)] transition-all uppercase"
                placeholder="Ej: A"
                value={rackNum}
                onChange={(e) => setRackNum(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-2 block">
                Nivel
              </label>
              <input
                type="text"
                className="w-full h-12 px-3 bg-[var(--surface-hover)] border-2 border-[var(--border)] rounded-xl text-sm font-bold outline-none focus:border-[var(--accent)] focus:bg-[var(--surface)] transition-all uppercase"
                placeholder="Ej: 2"
                value={rackNivel}
                onChange={(e) => setRackNivel(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)] mb-2 block">
                Posición
              </label>
              <input
                type="text"
                className="w-full h-12 px-3 bg-[var(--surface-hover)] border-2 border-[var(--border)] rounded-xl text-sm font-bold outline-none focus:border-[var(--accent)] focus:bg-[var(--surface)] transition-all uppercase"
                placeholder="Ej: A1"
                value={rackPosicion}
                onChange={(e) => setRackPosicion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSave();
                }}
              />
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              className="flex-1 h-12 font-black uppercase tracking-widest text-[10px]"
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              className="flex-1 h-12 font-black uppercase tracking-widest text-[10px]"
              onClick={onSave}
              disabled={loading}
            >
              {loading ? 'Guardando...' : 'Guardar Ubicación'}
            </Button>
          </div>
        </div>
        </div>
      </Card>
    </div>
  );
});
