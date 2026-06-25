'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import {
  type DialogItem,
  type MessageTone,
  type ToastItem,
  dismissToast,
  getServerSnapshot,
  getSnapshot,
  resolveDialog,
  subscribe,
} from './messageStore';

const TONE_STYLES: Record<
  MessageTone,
  { icon: typeof Info; accent: string; iconBg: string; iconColor: string; ring: string }
> = {
  success: {
    icon: CheckCircle2,
    accent: 'bg-emerald-500',
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-500',
    ring: 'focus-visible:ring-emerald-400',
  },
  error: {
    icon: XCircle,
    accent: 'bg-rose-500',
    iconBg: 'bg-rose-50',
    iconColor: 'text-rose-500',
    ring: 'focus-visible:ring-rose-400',
  },
  warning: {
    icon: AlertTriangle,
    accent: 'bg-amber-500',
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-500',
    ring: 'focus-visible:ring-amber-400',
  },
  info: {
    icon: Info,
    accent: 'bg-[#2ec4f1]',
    iconBg: 'bg-sky-50',
    iconColor: 'text-[#2ec4f1]',
    ring: 'focus-visible:ring-sky-400',
  },
};

const CONFIRM_BTN_TONE: Record<MessageTone, string> = {
  success: 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/30',
  error: 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/30',
  warning: 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/30',
  info: 'bg-[#181c3a] hover:bg-[#10121e] shadow-[#181c3a]/30',
};

function ToastCard({ toast }: { toast: ToastItem }) {
  const styles = TONE_STYLES[toast.tone];
  const Icon = styles.icon;
  return (
    <div
      role="status"
      className="msg-toast-in pointer-events-auto relative flex w-[22rem] max-w-[calc(100vw-2rem)] gap-3 overflow-hidden rounded-2xl border border-slate-100 bg-white p-4 pl-5 shadow-2xl shadow-slate-900/10"
    >
      <span className={`absolute inset-y-0 left-0 w-1.5 ${styles.accent}`} aria-hidden />
      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${styles.iconBg}`}>
        <Icon className={`h-5 w-5 ${styles.iconColor}`} />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm font-black leading-tight text-[#181c3a]">{toast.title}</p>
        {toast.description && (
          <p className="mt-1 whitespace-pre-line break-words text-xs font-medium leading-relaxed text-slate-500">
            {toast.description}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismissToast(toast.id)}
        className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-slate-50 hover:text-slate-500"
        aria-label="Cerrar notificación"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function DialogCard({ dialog }: { dialog: DialogItem }) {
  const styles = TONE_STYLES[dialog.tone];
  const Icon = styles.icon;
  const [value, setValue] = useState(dialog.prompt?.defaultValue ?? '');
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  const isPrompt = dialog.kind === 'prompt';
  const showCancel = dialog.kind !== 'alert';
  const promptInvalid = isPrompt && dialog.prompt?.required && value.trim() === '';

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (isPrompt) inputRef.current?.focus();
      else confirmRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, [isPrompt]);

  const onConfirm = () => {
    if (promptInvalid) return;
    if (dialog.kind === 'confirm') resolveDialog(dialog.id, true);
    else if (dialog.kind === 'prompt') resolveDialog(dialog.id, value);
    else resolveDialog(dialog.id, true);
  };

  const onCancel = () => {
    if (dialog.kind === 'prompt') resolveDialog(dialog.id, null);
    else resolveDialog(dialog.id, false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Enter' && (!isPrompt || !dialog.prompt?.multiline)) {
      e.preventDefault();
      onConfirm();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[#0b0e20]/70 p-4 backdrop-blur-sm msg-overlay-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`msg-dialog-title-${dialog.id}`}
      onKeyDown={onKeyDown}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && dialog.kind !== 'prompt') onCancel();
      }}
    >
      <div className="msg-dialog-in w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start gap-4 p-6">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${styles.iconBg}`}>
            <Icon className={`h-6 w-6 ${styles.iconColor}`} />
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <h3
              id={`msg-dialog-title-${dialog.id}`}
              className="text-lg font-black leading-tight tracking-tight text-[#181c3a]"
            >
              {dialog.title}
            </h3>
            {dialog.message && (
              <p className="mt-2 whitespace-pre-line break-words text-sm font-medium leading-relaxed text-slate-500">
                {dialog.message}
              </p>
            )}
            {isPrompt &&
              (dialog.prompt?.multiline ? (
                <textarea
                  ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={dialog.prompt?.placeholder}
                  rows={3}
                  className="mt-4 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-[#181c3a] outline-none transition-all focus:border-[#2ec4f1] focus:bg-white"
                />
              ) : (
                <input
                  ref={inputRef as React.RefObject<HTMLInputElement>}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={dialog.prompt?.placeholder}
                  className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-[#181c3a] outline-none transition-all focus:border-[#2ec4f1] focus:bg-white"
                />
              ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
          {showCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl px-5 py-2.5 text-[11px] font-black uppercase tracking-widest text-slate-500 transition-colors hover:bg-slate-200/60"
            >
              {dialog.cancelText}
            </button>
          )}
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={promptInvalid}
            className={`rounded-xl px-6 py-2.5 text-[11px] font-black uppercase tracking-widest text-white shadow-lg transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:hover:scale-100 ${CONFIRM_BTN_TONE[dialog.tone]}`}
          >
            {dialog.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MessageCenter() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const activeDialog = snapshot.dialogs[0];

  return createPortal(
    <>
      <div className="pointer-events-none fixed right-4 top-4 z-[210] flex flex-col items-end gap-3 sm:right-6 sm:top-6">
        {snapshot.toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} />
        ))}
      </div>
      {activeDialog && <DialogCard key={activeDialog.id} dialog={activeDialog} />}
    </>,
    document.body
  );
}
