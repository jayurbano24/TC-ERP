'use client';

import { memo } from 'react';
import { Card, Button } from '@/components/ui';
import { Printer, QrCode, X } from 'lucide-react';

type Props = {
  box: any;
  onClose: () => void;
  onPrint: (mode: 'simple' | 'master') => void;
};

/**
 * C1: modal de impresión extraído del monolito bodega/gestion y memoizado.
 * El estado vive en el padre; aquí solo se reciben datos + callbacks.
 */
export const PrintBoxModal = memo(function PrintBoxModal({ box, onClose, onPrint }: Props) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <Card className="w-full max-w-md p-0 shadow-2xl rounded-3xl border border-[var(--border)] animate-in fade-in zoom-in duration-200 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/15">
              <Printer className="w-5 h-5 text-[var(--accent)]" />
            </div>
            <h3 className="text-lg font-black text-[var(--heading)]">Opciones de Impresión</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <div className="p-6">
        <p className="text-sm text-[var(--muted)] mb-6">Selecciona el formato de etiqueta que deseas imprimir para la caja <strong className="text-[var(--heading)]">{box.id}</strong>:</p>

        <div className="grid grid-cols-2 gap-4">
          <Button
            variant="outline"
            className="flex flex-col items-center justify-center h-32 gap-3 bg-[var(--surface)] border-2 border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/5 text-[var(--foreground)] hover:text-[var(--accent)] transition-all rounded-2xl"
            onClick={() => onPrint('simple')}
          >
            <Printer size={32} strokeWidth={1.5} />
            <div className="text-center">
              <span className="block font-black text-[12px]">Etiqueta Simple</span>
              <span className="block font-normal text-[10px] opacity-70 mt-1">Identificador Exterior</span>
            </div>
          </Button>
          <Button
            variant="outline"
            className="flex flex-col items-center justify-center h-32 gap-3 bg-[var(--surface)] border-2 border-[var(--border)] hover:border-[var(--heading)] hover:bg-[var(--surface-hover)] text-[var(--foreground)] hover:text-[var(--heading)] transition-all rounded-2xl"
            onClick={() => onPrint('master')}
          >
            <QrCode size={32} strokeWidth={1.5} />
            <div className="text-center">
              <span className="block font-black text-[12px]">Caja Master</span>
              <span className="block font-normal text-[10px] opacity-70 mt-1">Detalle de Series (Guía)</span>
            </div>
          </Button>
        </div>
        </div>
      </Card>
    </div>
  );
});
