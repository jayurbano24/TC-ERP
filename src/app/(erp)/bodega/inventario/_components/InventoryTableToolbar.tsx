'use client';

import type { ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
} from 'lucide-react';

type Props = {
  densityLabel: string;
  density: 'compact' | 'normal' | 'comfortable';
  tableExpanded: boolean;
  isFetching?: boolean;
  onScrollLeft: () => void;
  onScrollRight: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onToggleExpand: () => void;
};

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-[#181c3a]/30 hover:bg-slate-50 hover:text-[#181c3a] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function InventoryTableToolbar({
  densityLabel,
  density,
  tableExpanded,
  isFetching,
  onScrollLeft,
  onScrollRight,
  onZoomOut,
  onZoomIn,
  onToggleExpand,
}: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/90 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Mover columnas
        </span>
        <div className="flex items-center gap-1">
          <IconBtn label="Ver columnas a la izquierda" onClick={onScrollLeft}>
            <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
          </IconBtn>
          <IconBtn label="Ver columnas a la derecha" onClick={onScrollRight}>
            <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
          </IconBtn>
        </div>
        {isFetching ? (
          <span className="ml-1 text-[10px] font-semibold text-emerald-600">Actualizando…</span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Densidad
        </span>
        <IconBtn
          label="Más equipos por pantalla"
          onClick={onZoomOut}
          disabled={density === 'compact'}
        >
          <ZoomOut className="h-4 w-4" strokeWidth={2.5} />
        </IconBtn>
        <span className="min-w-[4.5rem] text-center text-xs font-semibold text-slate-700">
          {densityLabel}
        </span>
        <IconBtn
          label="Filas más grandes"
          onClick={onZoomIn}
          disabled={density === 'comfortable'}
        >
          <ZoomIn className="h-4 w-4" strokeWidth={2.5} />
        </IconBtn>
        <button
          type="button"
          onClick={onToggleExpand}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-[#181c3a]/30 hover:bg-slate-50"
          title={tableExpanded ? 'Reducir alto' : 'Ampliar alto de tabla'}
        >
          {tableExpanded ? (
            <Minimize2 className="h-3.5 w-3.5" strokeWidth={2.5} />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" strokeWidth={2.5} />
          )}
          {tableExpanded ? 'Compactar' : 'Ampliar'}
        </button>
      </div>
    </div>
  );
}
