'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Card, notify } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { apiFetch, readApiJson } from '@/lib/http/apiFetch';
import { trayRowToHistoryEntry } from '@/lib/backoffice/trayRowAdapter';
import type { CacTrayUnitRow } from '@/lib/backoffice/cacTrayTypes';
import { batchSelectionError, PREDIAGNOSTICO_BATCH_MAX, type BatchEquipment } from '@/modules/backoffice/prediagnostico/batchSelection';
import { parseWorkshopSearchTokens } from '@/modules/workshop/shared/workshopSearch';
import { ChevronDown, Filter, RefreshCw, Search } from 'lucide-react';
import {
  HISTORY_TRAY_PAGE_SIZE,
  hasActiveHistoryTrayFilters,
  type HistoryTrayFilters,
  type HistoryUnitEntry,
} from '../../historyTrayUtils';
import type { CatalogAgency, CatalogBrand, CatalogModel, CatalogTech } from '../../types';
import { HistoryFiltersPanel } from './HistoryFiltersPanel';
import { HistoryTrayPagination } from './HistoryTrayPagination';
import { PrediagnosticoPanel } from './PrediagnosticoPanel';

type SelectedOs = BatchEquipment & {
  osLabel: string;
  brandId: string;
  techName: string;
  modelName: string;
};

type Props = {
  historyLoadError: string | null;
  historyLoading: boolean;
  totalCount: number;
  totalPages: number;
  historySearch: string;
  setHistorySearch: (value: string) => void;
  historyFilters: HistoryTrayFilters;
  historyFiltersOpen: boolean;
  setHistoryFiltersOpen: React.Dispatch<React.SetStateAction<boolean>>;
  historyPage: number;
  setHistoryPage: React.Dispatch<React.SetStateAction<number>>;
  fetchHistory: (opts?: { silent?: boolean }) => Promise<void>;
  getHistoryTrayEntries: () => HistoryUnitEntry[];
  historyFilterBrands: CatalogBrand[];
  historyFilterModels: CatalogModel[];
  patchHistoryFilter: (patch: Partial<HistoryTrayFilters>) => void;
  clearHistoryFilters: () => void;
  CAC_AGENCIES: CatalogAgency[];
  MASTER_TECNOLOGIAS: CatalogTech[];
  MASTER_MARCAS: CatalogBrand[];
  MASTER_MODELOS: CatalogModel[];
};

const VERDICT_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  reacondicionado: 'Reacondicionado',
  reparado: 'Reparado',
  irreparable: 'Irreparable',
};

function toSelected(entry: HistoryUnitEntry, techs: CatalogTech[], models: CatalogModel[]): SelectedOs | null {
  const serviceOrderId = entry.serviceOrderId || '';
  const techId = entry.techId || '';
  const modelId = entry.grp.modelId || '';
  const brandId = entry.grp.brandId || '';
  if (!serviceOrderId || !techId || !modelId) return null;
  return {
    serviceOrderId,
    techId,
    modelId,
    brandId,
    osLabel: entry.osLabel,
    techName: techs.find((item) => item.id === techId)?.nombre || techId,
    modelName: models.find((item) => item.id === modelId)?.nombre || modelId,
  };
}

export function PrediagnosticoTab({
  historyLoadError,
  historyLoading,
  totalCount,
  totalPages,
  historyFilters,
  historyFiltersOpen,
  setHistoryFiltersOpen,
  historyPage,
  setHistoryPage,
  fetchHistory,
  getHistoryTrayEntries,
  historyFilterBrands,
  historyFilterModels,
  patchHistoryFilter,
  clearHistoryFilters,
  CAC_AGENCIES,
  MASTER_TECNOLOGIAS,
  MASTER_MARCAS,
  MASTER_MODELOS,
}: Props) {
  const [selected, setSelected] = useState<SelectedOs[]>([]);
  const [seriesDraft, setSeriesDraft] = useState('');
  const [lookupEntries, setLookupEntries] = useState<HistoryUnitEntry[] | null>(null);
  const [lookupNote, setLookupNote] = useState('');
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const catalogsRef = useRef({ techs: MASTER_TECNOLOGIAS, models: MASTER_MODELOS });
  catalogsRef.current = { techs: MASTER_TECNOLOGIAS, models: MASTER_MODELOS };
  const debouncedSeries = useDebouncedValue(seriesDraft, 400);
  const trayEntries = getHistoryTrayEntries().filter((entry) => !entry.prediagnostico);
  const visibleEntries = lookupEntries ?? trayEntries;
  const anchor = selected[0];
  const safePage = Math.min(historyPage, Math.max(totalPages, 1));
  const startItem = totalCount === 0 ? 0 : (safePage - 1) * HISTORY_TRAY_PAGE_SIZE + 1;
  const endItem = Math.min(safePage * HISTORY_TRAY_PAGE_SIZE, totalCount);

  useEffect(() => {
    const parsed = debouncedSeries.trim() ? parseWorkshopSearchTokens(debouncedSeries, PREDIAGNOSTICO_BATCH_MAX) : null;
    if (!parsed || parsed.tokens.length === 0) {
      setLookupEntries(null);
      setLookupNote('');
      return;
    }
    if (parsed.truncated) {
      notify.warning(`Solo se agregan las primeras ${PREDIAGNOSTICO_BATCH_MAX} series`, {
        description: `Pegaste ${parsed.total}; el resto se omite.`,
      });
    }

    let cancelled = false;
    const params = new URLSearchParams({
      serials: parsed.tokens.join(','),
      limit: '200',
      page: '1',
      includeSap: '0',
    });
    void apiFetch(`/api/backoffice/cac-history/tray?${params}`, { cache: 'no-store' })
      .then((res) => readApiJson<{ rows: CacTrayUnitRow[] }>(res))
      .then((data) => {
        if (cancelled) return;
        const mapped = (data.rows || []).map((row, index) => trayRowToHistoryEntry(row, index));
        const entries = mapped.filter((entry) => !entry.prediagnostico);
        const alreadyDone = mapped.filter((entry) => entry.prediagnostico);
        setLookupEntries(entries);
        const next = [...selectedRef.current];
        let skipped = 0;
        for (const entry of entries) {
          const candidate = toSelected(entry, catalogsRef.current.techs, catalogsRef.current.models);
          if (!candidate) {
            skipped += 1;
            continue;
          }
          if (next.some((row) => row.serviceOrderId === candidate.serviceOrderId)) continue;
          if (batchSelectionError(next, candidate)) {
            skipped += 1;
            continue;
          }
          next.push(candidate);
        }
        const foundTokens = new Set(
          mapped.flatMap((entry) => [
            entry.osLabel.toUpperCase(),
            ...(entry.unit || []).map((unit: { serial_number?: string }) => String(unit.serial_number || '').toUpperCase()),
          ])
        );
        const missing = parsed.tokens.filter(
          (token) => ![...foundTokens].some((value) => value.includes(token))
        );
        const notes: string[] = [];
        if (missing.length > 0) notes.push(`Sin coincidencia: ${missing.join(', ')}`);
        if (alreadyDone.length > 0) {
          notes.push(`Ya prediagnosticado: ${alreadyDone.map((entry) => entry.osLabel).join(', ')}`);
        }
        if (skipped > 0) notes.push('Se omitieron equipos de otro modelo o tecnología, o que pasan de 25.');
        setLookupNote(notes.join(' '));
        setSelected(next);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        notify.error(error instanceof Error ? error.message : 'No se pudieron buscar las series');
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSeries]);

  const toggle = (entry: HistoryUnitEntry) => {
    const candidate = toSelected(entry, MASTER_TECNOLOGIAS, MASTER_MODELOS);
    if (!candidate) {
      notify.error('Esta orden no tiene modelo y tecnología para agrupar');
      return;
    }
    if (selected.some((row) => row.serviceOrderId === candidate.serviceOrderId)) {
      setSelected(selected.filter((row) => row.serviceOrderId !== candidate.serviceOrderId));
      return;
    }
    const reason = batchSelectionError(selected, candidate);
    if (reason) {
      notify.error(reason);
      return;
    }
    setSelected([...selected, candidate]);
  };

  const selectPage = () => {
    const next = [...selected];
    let skipped = 0;
    for (const entry of visibleEntries) {
      const candidate = toSelected(entry, MASTER_TECNOLOGIAS, MASTER_MODELOS);
      if (!candidate) {
        skipped += 1;
        continue;
      }
      if (next.some((row) => row.serviceOrderId === candidate.serviceOrderId)) continue;
      if (batchSelectionError(next, candidate)) {
        skipped += 1;
        continue;
      }
      next.push(candidate);
    }
    if (skipped > 0) {
      notify.error('Se omitieron filas de otro modelo, otra tecnología o que pasan de 25');
    }
    setSelected(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--heading)]">Pre-diagnóstico</p>
        <p className="text-xs text-[var(--muted)]">
          Pega hasta {PREDIAGNOSTICO_BATCH_MAX} series u OS, como en taller. Se agregan a la selección si son del mismo modelo y tecnología.
        </p>
      </div>

      {historyLoadError ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-bold text-amber-800">{historyLoadError}</p>
          <Button variant="outline" onClick={() => void fetchHistory()} className="shrink-0 text-[10px] font-black uppercase">
            <RefreshCw size={14} className="mr-2" /> Reintentar
          </Button>
        </div>
      ) : null}

      <Card className="overflow-hidden rounded-2xl border border-[var(--border)] p-0">
        <div className="space-y-3 border-b border-[var(--border)] p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-[var(--muted)]" />
              <textarea
                value={seriesDraft}
                onChange={(event) => setSeriesDraft(event.target.value)}
                rows={2}
                placeholder={`Buscar serie u OS… (pegar hasta ${PREDIAGNOSTICO_BATCH_MAX} series)`}
                className="custom-scrollbar w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2.5 pr-3 pl-10 text-xs font-medium text-[var(--foreground)] uppercase outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
              />
            </div>
            <button
              type="button"
              onClick={() => setHistoryFiltersOpen((open) => !open)}
              className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] px-4 text-[9px] font-medium uppercase tracking-wider text-[var(--muted)]"
            >
              <Filter size={14} />
              Filtros
              <ChevronDown size={12} className={historyFiltersOpen ? 'rotate-180' : ''} />
            </button>
            {hasActiveHistoryTrayFilters(historyFilters) ? (
              <button
                type="button"
                onClick={clearHistoryFilters}
                className="h-10 shrink-0 rounded-xl border border-rose-200 px-3 text-[9px] font-medium uppercase tracking-wider text-rose-500"
              >
                Limpiar
              </button>
            ) : null}
          </div>
          {historyFiltersOpen ? (
            <HistoryFiltersPanel
              historyFilters={historyFilters}
              patchHistoryFilter={patchHistoryFilter}
              MASTER_TECNOLOGIAS={MASTER_TECNOLOGIAS}
              historyFilterBrands={historyFilterBrands}
              historyFilterModels={historyFilterModels}
              CAC_AGENCIES={CAC_AGENCIES}
            />
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={selectPage}
              className="h-8 rounded-lg border border-[var(--border)] px-3 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground)]"
            >
              Marcar compatibles de esta página
            </button>
            <button
              type="button"
              onClick={() => setSelected([])}
              disabled={selected.length === 0}
              className="h-8 rounded-lg border border-[var(--border)] px-3 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)] disabled:opacity-40"
            >
              Quitar selección
            </button>
            {lookupNote ? <p className="text-xs text-amber-700 dark:text-amber-300">{lookupNote}</p> : null}
            <p className="text-[10px] font-semibold uppercase text-[var(--muted)]">
              {selected.length}/{PREDIAGNOSTICO_BATCH_MAX}
              {anchor ? ` · ${anchor.techName} · ${anchor.modelName}` : ' · elige un modelo y tecnología'}
            </p>
          </div>
        </div>

        {anchor ? (
          <div className="border-b border-[var(--border)]">
            <PrediagnosticoPanel
              serviceOrderIds={selected.map((row) => row.serviceOrderId)}
              osLabels={selected.map((row) => row.osLabel)}
              techId={anchor.techId}
              brandId={anchor.brandId}
              techName={anchor.techName}
              modelName={anchor.modelName}
              onClose={() => setSelected([])}
              onSaved={() => {
                const savedIds = new Set(selected.map((row) => row.serviceOrderId));
                setLookupEntries((current) =>
                  current ? current.filter((entry) => !savedIds.has(entry.serviceOrderId || '')) : current
                );
                setSelected([]);
                void fetchHistory({ silent: true });
              }}
            />
          </div>
        ) : (
          <p className="border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
            Selecciona órdenes del historial. La primera fija el modelo y la tecnología; las siguientes tienen que coincidir, hasta 25.
          </p>
        )}

        <div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-hover)]">
                  {['', 'OS', 'Fecha', 'Tec.', 'Marca', 'Modelo', 'Clase', 'Dictamen'].map((label) => (
                    <th key={label || 'sel'} className="px-2 py-2 text-[9px] font-medium uppercase tracking-wider text-[var(--muted)]">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historyLoading && visibleEntries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-xs text-[var(--muted)]">
                      Cargando historial…
                    </td>
                  </tr>
                ) : null}
                {visibleEntries.map((entry) => {
                  const candidate = toSelected(entry, MASTER_TECNOLOGIAS, MASTER_MODELOS);
                  const checked = Boolean(
                    candidate && selected.some((row) => row.serviceOrderId === candidate.serviceOrderId)
                  );
                  const blocked = candidate && !checked ? batchSelectionError(selected, candidate) : null;
                  const verdict = entry.prediagnostico?.verdict || 'pendiente';
                  const techName = MASTER_TECNOLOGIAS.find((item) => item.id === entry.techId)?.nombre || '—';
                  const brandName = MASTER_MARCAS.find((item) => item.id === entry.grp.brandId)?.nombre || '—';
                  const modelName = MASTER_MODELOS.find((item) => item.id === entry.grp.modelId)?.nombre || '—';
                  return (
                    <tr key={entry.serviceOrderId || `${entry.rec.id}-${entry.osLabel}`} className="border-b border-[var(--border)]">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar ${entry.osLabel}`}
                          checked={checked}
                          disabled={!candidate || Boolean(blocked)}
                          title={blocked || 'Seleccionar para prediagnóstico'}
                          onChange={() => toggle(entry)}
                        />
                      </td>
                      <td className="px-2 py-2 text-[10px] font-semibold text-[var(--foreground)]">{entry.osLabel}</td>
                      <td className="px-2 py-2 text-[10px] text-[var(--muted)]">
                        {entry.classifiedAtIso ? new Date(entry.classifiedAtIso).toLocaleString('es-GT') : '—'}
                      </td>
                      <td className="px-2 py-2 text-[10px] uppercase text-[var(--muted)]">{techName}</td>
                      <td className="px-2 py-2 text-[10px] uppercase text-[var(--muted)]">{brandName}</td>
                      <td className="px-2 py-2 text-[10px] text-[var(--foreground)]">{modelName}</td>
                      <td className="px-2 py-2 text-center text-[10px] font-black">{entry.prediagnostico?.shellClass || '—'}</td>
                      <td className="px-2 py-2 text-[10px] uppercase text-[var(--foreground)]">
                        {VERDICT_LABEL[verdict] || 'Pendiente'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {lookupEntries ? null : (
              <HistoryTrayPagination
                totalCount={totalCount}
                safePage={safePage}
                totalPages={totalPages}
                startItem={startItem}
                endItem={endItem}
                setHistoryPage={setHistoryPage}
              />
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
