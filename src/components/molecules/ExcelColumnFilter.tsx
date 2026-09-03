'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownAZ, ArrowUpZA, Check, Filter, GripHorizontal, X } from 'lucide-react';

export type ExcelFilterSelection = Set<string> | null;

type Props = {
  label: string;
  /** Valores únicos candidatos (ya filtrados por otras columnas si aplica). */
  values: string[];
  /** null = sin filtro (todos). */
  selected: ExcelFilterSelection;
  onChange: (next: ExcelFilterSelection) => void;
  sortDir?: 'asc' | 'desc' | null;
  onSort?: (dir: 'asc' | 'desc' | null) => void;
};

const PANEL_WIDTH = 260;

function clampPos(top: number, left: number, panelHeight: number) {
  const maxLeft = Math.max(8, window.innerWidth - PANEL_WIDTH - 8);
  const maxTop = Math.max(8, window.innerHeight - Math.min(panelHeight, 160) - 8);
  return {
    top: Math.min(Math.max(8, top), maxTop),
    left: Math.min(Math.max(8, left), maxLeft),
  };
}

/**
 * Filtro de columna estilo Excel: menú con orden + checklist de valores.
 * La ventana se puede arrastrar desde el encabezado.
 */
export function ExcelColumnFilter({
  label,
  values,
  selected,
  onChange,
  sortDir = null,
  onSort,
}: Props) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [dragging, setDragging] = useState(false);

  const isActive = selected != null && selected.size < values.length;
  const hasSort = sortDir === 'asc' || sortDir === 'desc';

  const openMenu = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      setPos(
        clampPos(rect.bottom + 4, rect.left, 360)
      );
    }
    if (selected == null) {
      setDraft(new Set(values));
    } else {
      setDraft(new Set(selected));
    }
    setQuery('');
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (draggingRef.current) return;
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = true;
    setDragging(true);
    dragOffsetRef.current = { x: e.clientX - pos.left, y: e.clientY - pos.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const height = panelRef.current?.offsetHeight ?? 360;
    setPos(
      clampPos(
        e.clientY - dragOffsetRef.current.y,
        e.clientX - dragOffsetRef.current.x,
        height
      )
    );
  };

  const onHeaderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const filteredValues = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return values;
    return values.filter((v) => v.toUpperCase().includes(q));
  }, [values, query]);

  const allFilteredSelected =
    filteredValues.length > 0 && filteredValues.every((v) => draft.has(v));

  const toggleOne = (value: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const v of filteredValues) next.delete(v);
      } else {
        for (const v of filteredValues) next.add(v);
      }
      return next;
    });
  };

  const apply = () => {
    if (draft.size === 0) {
      onChange(new Set());
    } else if (draft.size >= values.length) {
      onChange(null);
    } else {
      onChange(new Set(draft));
    }
    setOpen(false);
  };

  const clearFilter = () => {
    onChange(null);
    onSort?.(null);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (open) setOpen(false);
          else openMenu();
        }}
        className={`inline-flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-black/5 ${
          isActive || hasSort ? 'text-[var(--accent)]' : ''
        }`}
        title={`Filtrar ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="truncate text-[9px] font-black uppercase tracking-widest">{label}</span>
        <Filter
          className={`h-3 w-3 shrink-0 ${isActive || hasSort ? 'fill-current opacity-90' : 'opacity-50'}`}
        />
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label={`Filtro ${label}`}
              className="fixed z-[80] w-[260px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl"
              style={{ top: pos.top, left: pos.left }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                onPointerDown={onHeaderPointerDown}
                onPointerMove={onHeaderPointerMove}
                onPointerUp={onHeaderPointerUp}
                onPointerCancel={onHeaderPointerUp}
                className={`flex select-none items-center justify-between border-b border-[var(--border)] bg-[var(--surface-hover)] px-3 py-2 ${
                  dragging ? 'cursor-grabbing' : 'cursor-grab'
                }`}
                title="Arrastrar ventana"
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <GripHorizontal className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
                  <span className="truncate text-[10px] font-black uppercase tracking-widest text-[var(--heading)]">
                    {label}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="rounded p-0.5 text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                  aria-label="Cerrar"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {onSort ? (
                <div className="border-b border-[var(--border)] p-1.5 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      onSort('asc');
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold hover:bg-[var(--surface-hover)] ${
                      sortDir === 'asc' ? 'bg-[var(--surface-hover)] text-[var(--accent)]' : 'text-[var(--foreground)]'
                    }`}
                  >
                    <ArrowDownAZ className="h-3.5 w-3.5" />
                    Ordenar A → Z
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSort('desc');
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold hover:bg-[var(--surface-hover)] ${
                      sortDir === 'desc' ? 'bg-[var(--surface-hover)] text-[var(--accent)]' : 'text-[var(--foreground)]'
                    }`}
                  >
                    <ArrowUpZA className="h-3.5 w-3.5" />
                    Ordenar Z → A
                  </button>
                </div>
              ) : null}

              <div className="border-b border-[var(--border)] p-2 space-y-1.5">
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar valor…"
                  className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] px-2 text-[11px] font-semibold outline-none focus:border-[var(--accent)]"
                  autoFocus
                />
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={toggleAllFiltered}
                    className="flex-1 rounded-md border border-[var(--border)] px-2 py-1 text-[9px] font-black uppercase tracking-wide hover:bg-[var(--surface-hover)]"
                  >
                    {allFilteredSelected ? 'Quitar visibles' : 'Todos visibles'}
                  </button>
                  <button
                    type="button"
                    onClick={clearFilter}
                    className="rounded-md border border-[var(--border)] px-2 py-1 text-[9px] font-black uppercase tracking-wide text-rose-600 hover:bg-rose-50"
                  >
                    Limpiar
                  </button>
                </div>
              </div>

              <div className="max-h-52 overflow-y-auto custom-scrollbar p-1.5">
                {filteredValues.length === 0 ? (
                  <p className="px-2 py-4 text-center text-[11px] text-[var(--muted)]">Sin valores</p>
                ) : (
                  filteredValues.map((value) => {
                    const checked = draft.has(value);
                    return (
                      <label
                        key={value}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--surface-hover)]"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(value)}
                          className="h-3.5 w-3.5 accent-[var(--primary)]"
                        />
                        <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-semibold text-[var(--foreground)]">
                          {value || '(vacío)'}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>

              <div className="flex gap-2 border-t border-[var(--border)] p-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-[10px] font-black uppercase tracking-wide hover:bg-[var(--surface-hover)]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={apply}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[var(--primary)] px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-[var(--primary-foreground)] hover:opacity-90"
                >
                  <Check className="h-3 w-3" />
                  Aceptar
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
