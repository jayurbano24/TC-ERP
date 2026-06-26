'use client';

import type { HistoryTrayFilters } from '../../historyTrayUtils';
import type { CatalogAgency, CatalogBrand, CatalogModel, CatalogTech } from '../../types';

type Props = {
  historyFilters: HistoryTrayFilters;
  patchHistoryFilter: (patch: Partial<HistoryTrayFilters>) => void;
  MASTER_TECNOLOGIAS: CatalogTech[];
  historyFilterBrands: CatalogBrand[];
  historyFilterModels: CatalogModel[];
  CAC_AGENCIES: CatalogAgency[];
};

const fieldClass =
  'w-full h-11 px-4 bg-[var(--surface)] text-[var(--foreground)] border border-[var(--border)] rounded-xl font-black text-[10px] uppercase outline-none focus:border-[#2ec4f1]';

export function HistoryFiltersPanel({
  historyFilters,
  patchHistoryFilter,
  MASTER_TECNOLOGIAS,
  historyFilterBrands,
  historyFilterModels,
  CAC_AGENCIES,
}: Props) {
  return (
    <div className="rounded-2xl border-2 border-[var(--border)] bg-[var(--surface-hover)] text-[var(--foreground)] p-6 space-y-5 animate-rise-in">
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">
        Catálogo — tecnología, marca, modelo y agencia
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div>
          <label className="text-[8px] font-black text-[var(--muted)] uppercase tracking-widest mb-1.5 block">
            Tecnología
          </label>
          <select
            className={fieldClass}
            value={historyFilters.techId}
            onChange={(e) => patchHistoryFilter({ techId: e.target.value, brandId: '', modelId: '' })}
          >
            <option value="">TODAS</option>
            {MASTER_TECNOLOGIAS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[8px] font-black text-[var(--muted)] uppercase tracking-widest mb-1.5 block">
            Marca
          </label>
          <select className={fieldClass} value={historyFilters.brandId} onChange={(e) => patchHistoryFilter({ brandId: e.target.value, modelId: '' })}>
            <option value="">TODAS</option>
            {historyFilterBrands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[8px] font-black text-[var(--muted)] uppercase tracking-widest mb-1.5 block">
            Modelo
          </label>
          <select className={fieldClass} value={historyFilters.modelId} onChange={(e) => patchHistoryFilter({ modelId: e.target.value })}>
            <option value="">TODOS</option>
            {historyFilterModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[8px] font-black text-[var(--muted)] uppercase tracking-widest mb-1.5 block">
            Agencia CAC
          </label>
          <select className={fieldClass} value={historyFilters.agencyId} onChange={(e) => patchHistoryFilter({ agencyId: e.target.value })}>
            <option value="">TODAS</option>
            {CAC_AGENCIES.map((a) => (
              <option key={a.id} value={a.id}>
                {a.id.toUpperCase().includes(a.name.toUpperCase()) ? a.id : `${a.id} — ${a.name}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--muted)] pt-2 border-t border-[var(--border)]">
        Texto por columna de la tabla
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {(
          [
            ['guide', 'No. Guía'],
            ['pilot', 'Piloto'],
            ['courier', 'Courier'],
            ['receivedBy', 'Recibió'],
            ['status', 'Estatus'],
            ['osLabel', 'Orden de Servicio'],
            ['sapDocument', 'Documento SAP'],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <label className="text-[8px] font-black text-[var(--muted)] uppercase tracking-widest mb-1 block">
              {label}
            </label>
            <input
              type="text"
              placeholder={`Filtrar ${label.toLowerCase()}...`}
              className="w-full h-10 px-3 bg-[var(--surface)] text-[var(--foreground)] border border-[var(--border)] rounded-xl font-bold text-[10px] outline-none focus:border-[#2ec4f1] uppercase"
              value={historyFilters[key]}
              onChange={(e) => patchHistoryFilter({ [key]: e.target.value })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
