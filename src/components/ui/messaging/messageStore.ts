'use client';

/**
 * Centro de mensajería de TC-ERP.
 *
 * Store imperativo (pub/sub) que reemplaza los `alert()` / `confirm()` / `prompt()`
 * nativos por toasts no bloqueantes y diálogos profesionales. Puede invocarse desde
 * cualquier lugar — componentes React, hooks o archivos `.ts` sin React — porque solo
 * publica al store; el renderizado lo hace <MessageCenter /> montado una vez en el layout.
 */

import { humanizeUserFacingError } from '@/shared/messaging/humanizeUserFacingError';

export type MessageTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  tone: MessageTone;
  title: string;
  description?: string;
  /** Duración en ms antes de auto-cerrar. 0 = persistente hasta que el usuario la cierre. */
  duration: number;
  createdAt: number;
}

export interface ToastOptions {
  title?: string;
  description?: string;
  tone?: MessageTone;
  duration?: number;
}

export type DialogKind = 'alert' | 'confirm' | 'prompt';

export interface DialogPromptConfig {
  defaultValue?: string;
  placeholder?: string;
  multiline?: boolean;
  required?: boolean;
}

export interface DialogItem {
  id: string;
  kind: DialogKind;
  tone: MessageTone;
  title: string;
  message?: string;
  confirmText: string;
  cancelText: string;
  prompt?: DialogPromptConfig;
  resolve: (value: boolean | string | null) => void;
}

export interface DialogOptions {
  tone?: MessageTone;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  prompt?: DialogPromptConfig;
}

interface MessageState {
  toasts: ToastItem[];
  dialogs: DialogItem[];
}

let state: MessageState = { toasts: [], dialogs: [] };

const listeners = new Set<() => void>();

function emit() {
  state = { toasts: [...state.toasts], dialogs: [...state.dialogs] };
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): MessageState {
  return state;
}

const serverSnapshot: MessageState = { toasts: [], dialogs: [] };
export function getServerSnapshot(): MessageState {
  return serverSnapshot;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const DEFAULT_DURATIONS: Record<MessageTone, number> = {
  success: 4000,
  info: 5000,
  warning: 6000,
  error: 8000,
};

/* ───────────────────────────── Toasts ───────────────────────────── */

export function dismissToast(id: string) {
  state.toasts = state.toasts.filter((t) => t.id !== id);
  emit();
}

export function clearToasts() {
  state.toasts = [];
  emit();
}

function pushToast(tone: MessageTone, message: string, opts?: ToastOptions): string {
  const id = uid('toast');
  const duration = opts?.duration ?? DEFAULT_DURATIONS[tone];
  const toast: ToastItem = {
    id,
    tone,
    title: opts?.title ?? message,
    // Si hay description explícita, usarla. Si solo hay title, el 1er arg es el detalle.
    description:
      opts?.description !== undefined
        ? opts.description
        : opts?.title
          ? message
          : undefined,
    duration,
    createdAt: Date.now(),
  };
  // Máximo 5 toasts visibles; descarta el más antiguo.
  state.toasts = [...state.toasts, toast].slice(-5);
  emit();
  if (duration > 0 && typeof window !== 'undefined') {
    window.setTimeout(() => dismissToast(id), duration);
  }
  return id;
}

type NotifyFn = ((message: string, opts?: ToastOptions) => string) & {
  success: (message: string, opts?: ToastOptions) => string;
  error: (message: string, opts?: ToastOptions) => string;
  warning: (message: string, opts?: ToastOptions) => string;
  info: (message: string, opts?: ToastOptions) => string;
};

function isSessionExpiredToast(message: string, opts?: ToastOptions): boolean {
  // Solo título/mensaje principal: no usar `description` (a menudo es el body
  // de un API 401 embebido en un error de negocio y provocaba logout fantasma).
  const blob = [message, opts?.title].filter(Boolean).join(' ');
  return /no autenticado|not authenticated|session[_ ]?expired/i.test(blob);
}

function redirectToLoginFromToast(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('tcerp_session_id');
  } catch {
    /* ignore */
  }
  window.location.assign('/');
}

export const notify: NotifyFn = Object.assign(
  (message: string, opts?: ToastOptions) => pushToast(opts?.tone ?? 'info', message, opts),
  {
    success: (message: string, opts?: ToastOptions) => pushToast('success', message, opts),
    error: (message: string, opts?: ToastOptions) => {
      // Evita spam "API Error / No autenticado" cuando la sesión ya caducó.
      if (isSessionExpiredToast(message, opts)) {
        redirectToLoginFromToast();
        return '';
      }
      const human = humanizeUserFacingError(
        opts?.title ?? message,
        opts?.description !== undefined
          ? opts.description
          : opts?.title
            ? message
            : undefined
      );
      return pushToast('error', human.title, {
        ...opts,
        title: human.title,
        description: human.description,
      });
    },
    warning: (message: string, opts?: ToastOptions) => pushToast('warning', message, opts),
    info: (message: string, opts?: ToastOptions) => pushToast('info', message, opts),
  }
);

/* ───────────────────────────── Diálogos ───────────────────────────── */

function pushDialog(
  kind: DialogKind,
  opts: DialogOptions
): Promise<boolean | string | null> {
  return new Promise((resolve) => {
    const dialog: DialogItem = {
      id: uid('dialog'),
      kind,
      tone: opts.tone ?? (kind === 'confirm' ? 'warning' : 'info'),
      title: opts.title ?? (kind === 'confirm' ? 'Confirmar acción' : 'Aviso'),
      message: opts.message,
      confirmText: opts.confirmText ?? (kind === 'confirm' ? 'Confirmar' : 'Entendido'),
      cancelText: opts.cancelText ?? 'Cancelar',
      prompt: kind === 'prompt' ? opts.prompt ?? {} : undefined,
      resolve,
    };
    state.dialogs = [...state.dialogs, dialog];
    emit();
  });
}

export function resolveDialog(id: string, value: boolean | string | null) {
  const dialog = state.dialogs.find((d) => d.id === id);
  if (!dialog) return;
  state.dialogs = state.dialogs.filter((d) => d.id !== id);
  emit();
  dialog.resolve(value);
}

/** Aviso modal no bloqueante (reemplaza a `alert`). Resuelve cuando se cierra. */
export async function alertDialog(opts: DialogOptions | string): Promise<void> {
  const options = typeof opts === 'string' ? { message: opts } : opts;
  await pushDialog('alert', options);
}

/** Confirmación modal (reemplaza a `confirm`). Resuelve a `true`/`false`. */
export async function confirmDialog(opts: DialogOptions | string): Promise<boolean> {
  const options = typeof opts === 'string' ? { message: opts } : opts;
  const result = await pushDialog('confirm', options);
  return result === true;
}

/** Entrada modal (reemplaza a `prompt`). Resuelve al texto o `null` si se cancela. */
export async function promptDialog(opts: DialogOptions | string): Promise<string | null> {
  const options = typeof opts === 'string' ? { message: opts } : opts;
  const result = await pushDialog('prompt', options);
  return typeof result === 'string' ? result : null;
}
