'use client';

import { useState } from 'react';
import { Card, Button } from '@/components/ui';
import { AlertCircle, Trash2 } from 'lucide-react';

type Props = {
  boxLabel: string;
  submitting?: boolean;
  onSubmit: (reason: string, observations: string) => void | Promise<void>;
  onCancel: () => void;
};

export function DeleteBoxAuthorizationModal({ boxLabel, submitting, onSubmit, onCancel }: Props) {
  const [reason, setReason] = useState('');
  const [observations, setObservations] = useState('');

  const canSubmit = reason.trim().length >= 5 && !submitting;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#181c3a]/45 backdrop-blur-sm p-4">
      <Card className="w-full max-w-lg p-0 overflow-hidden shadow-2xl animate-rise-in">
        <div className="bg-[#181c3a] px-6 py-4 text-white flex items-center gap-3">
          <div className="bg-rose-500/20 p-2 rounded-xl">
            <Trash2 className="w-5 h-5 text-rose-300" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Solicitar eliminación</h3>
            <p className="text-[11px] text-white/60 font-medium">{boxLabel}</p>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900 space-y-1">
              <p className="font-bold">Esta acción requiere autorización del Gerente General.</p>
              <p className="text-[13px] text-amber-800/90">
                La caja será marcada como <strong>Pendiente de Aprobación</strong> hasta que el
                Gerente General la autorice en el módulo <strong>Autorizaciones</strong>.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Motivo de eliminación <span className="text-rose-500">*</span>
            </label>
            <textarea
              className="w-full min-h-[88px] rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium outline-none focus:border-[#2ec4f1] focus:bg-white"
              placeholder="Explique por qué debe eliminarse esta caja…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Observaciones
            </label>
            <textarea
              className="w-full min-h-[72px] rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium outline-none focus:border-[#2ec4f1] focus:bg-white"
              placeholder="Detalle adicional (opcional)"
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              maxLength={1000}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={onCancel} disabled={!!submitting}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              className="flex-1 bg-rose-600 hover:bg-rose-700 border-none"
              disabled={!canSubmit}
              onClick={() => void onSubmit(reason.trim(), observations.trim())}
            >
              {submitting ? 'Enviando…' : 'Solicitar Autorización'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
