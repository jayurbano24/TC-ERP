'use client';

import { memo, useState } from 'react';
import { Card, Button } from '@/components/ui';
import { MessageSquare, X } from 'lucide-react';

type Props = {
  item: { os?: string; sn?: string; id?: string } | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: (comment: string) => void;
};

export const ScrapCommentModal = memo(function ScrapCommentModal({
  item,
  loading,
  onClose,
  onConfirm,
}: Props) {
  const [comment, setComment] = useState('');

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center overflow-y-auto bg-[#181c3a]/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <Card className="my-0 flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[1.75rem] p-0 shadow-2xl animate-rise-in sm:my-4 sm:rounded-3xl">
        <div className="flex shrink-0 items-center justify-between gap-3 bg-rose-600 p-4 text-white sm:p-6">
          <div className="flex min-w-0 items-center gap-3">
            <MessageSquare className="h-5 w-5 shrink-0 text-rose-100" />
            <div className="min-w-0">
              <h3 className="truncate text-base font-black sm:text-lg">Comentario SCRAPS</h3>
              <p className="mt-0.5 text-[10px] font-bold tracking-widest text-rose-100 uppercase">
                OS {item?.os || item?.id || '—'} · {item?.sn || '—'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-white/60 transition-colors hover:text-white"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4 sm:p-6">
          <p className="text-xs font-bold text-slate-600">
            El comentario queda en el historial del equipo y en las notas de las series de la OS.
          </p>
          <div>
            <label className="mb-1 block text-[10px] font-black tracking-widest text-slate-500 uppercase">
              Comentario <span className="text-rose-500">*</span>
            </label>
            <textarea
              autoFocus
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Motivo, observación, instrucción para el técnico…"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-[#181c3a] outline-none transition-all focus:border-rose-400 focus:ring-1 focus:ring-rose-400"
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              className="flex-1 bg-rose-600 hover:bg-rose-700"
              disabled={loading || !comment.trim()}
              onClick={() => onConfirm(comment.trim())}
            >
              {loading ? 'Guardando…' : 'Guardar comentario'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
});
