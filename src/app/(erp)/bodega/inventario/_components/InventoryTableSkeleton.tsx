'use client';

export function InventoryTableSkeleton() {
  return (
    <div className="animate-pulse p-4" aria-busy="true" aria-label="Cargando inventario">
      <div className="mb-3 h-9 w-full max-w-sm rounded-lg bg-slate-100" />
      <div className="overflow-hidden rounded-lg border border-slate-100">
        <div className="h-10 bg-[#181c3a]/80" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex h-12 items-center gap-3 border-b border-slate-50 px-3 last:border-0"
          >
            <div className="h-3 w-24 rounded bg-slate-100" />
            <div className="h-3 w-16 rounded bg-slate-100" />
            <div className="h-3 w-20 rounded bg-slate-100" />
            <div className="h-5 w-28 rounded-full bg-slate-100" />
            <div className="h-3 flex-1 rounded bg-slate-50" />
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-xs font-medium text-slate-400">
        Cargando inventario…
      </p>
    </div>
  );
}
