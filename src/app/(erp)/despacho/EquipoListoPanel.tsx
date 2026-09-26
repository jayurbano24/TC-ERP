'use client';

import React, { useCallback, useEffect, useMemo, useState, startTransition } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import {
  Card,
  Button,
  Badge,
  DataTable,
  TablePagination,
  type DataTableColumn,
  notify,
} from '@/components/ui';
import { CheckCircle2, Download, FileSpreadsheet, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { erpFieldClass, erpTableHeader, erpTableHeaderText } from '@/lib/design/tokens';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  fetchAllDespachoEquipoListo,
  fetchDespachoEquipoListoPage,
  type DespachoEquipoListoRow,
  type DespachoEquipoListoTechStat,
} from '@/lib/api/despachoEquipoListo';
import { fetchReferenceCatalogsViaApi } from '@/lib/api/referenceCatalogs';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';
import {
  ExcelColumnFilter,
  type ExcelFilterSelection,
} from '@/components/molecules/ExcelColumnFilter';

const PAGE_SIZE = 25;

type ListoRow = {
  key: string;
  os: string;
  s1: string;
  s2: string;
  s3: string;
  s4: string;
  tech: string;
  brand: string;
  model: string;
  box: string;
  material: string;
  valuation: string;
  updatedAt: string;
};

type FilterCol =
  | 'os'
  | 's1'
  | 's2'
  | 's3'
  | 's4'
  | 'tech'
  | 'model'
  | 'material'
  | 'valuation'
  | 'fecha';

type ExcelFilters = Record<FilterCol, ExcelFilterSelection>;

const EMPTY_EXCEL_FILTERS: ExcelFilters = {
  os: null,
  s1: null,
  s2: null,
  s3: null,
  s4: null,
  tech: null,
  model: null,
  material: null,
  valuation: null,
  fecha: null,
};

function adaptRow(raw: DespachoEquipoListoRow): ListoRow {
  const sns = raw.all_sns?.length
    ? raw.all_sns
    : [raw.serial_number].filter((s): s is string => Boolean(s));
  return {
    key: String(raw.service_order_id || raw.id),
    os: raw.service_orders?.os_label || 'S/OS',
    s1: sns[0] || '—',
    s2: sns[1] || '—',
    s3: sns[2] || '—',
    s4: sns[3] || '—',
    tech: raw.models?.technologies?.name || '—',
    brand: raw.brands?.name || '—',
    model: raw.models?.name || '—',
    box: raw.source_box_code || raw.boxes?.box_code || '—',
    material: String(raw.material ?? '').trim() || '—',
    valuation: String(raw.valuation ?? '').trim() || '—',
    updatedAt: raw.updated_at
      ? new Date(raw.updated_at).toLocaleString('es-GT')
      : '—',
  };
}

function cellValue(row: ListoRow, col: FilterCol): string {
  if (col === 'model') return `${row.brand} ${row.model}`.trim();
  if (col === 'fecha') return row.updatedAt;
  return String(row[col] ?? '');
}

function uniqueValues(rows: ListoRow[], col: FilterCol): string[] {
  const set = new Set<string>();
  for (const r of rows) set.add(cellValue(r, col));
  return [...set].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

function matchesExcelFilters(row: ListoRow, filters: ExcelFilters, except?: FilterCol): boolean {
  for (const col of Object.keys(filters) as FilterCol[]) {
    if (except && col === except) continue;
    const sel = filters[col];
    if (sel == null) continue;
    if (!sel.has(cellValue(row, col))) return false;
  }
  return true;
}

async function fetchEquipoListoRest(startCursor: string): Promise<DespachoEquipoListoRow[]> {
  const items: DespachoEquipoListoRow[] = [];
  let cursor: string | null = startCursor;
  for (let page = 0; page < 200 && cursor; page++) {
    const next = await fetchDespachoEquipoListoPage({
      cursor,
      limit: BATCH_LIMITS.API_PAGE_MAX,
    });
    items.push(...next.items);
    if (!next.nextCursor || next.items.length === 0) break;
    cursor = next.nextCursor;
  }
  return items;
}

/**
 * Cola de equipos aceptados en QC (Equipo Listo) listos para Outbound.
 */
export function EquipoListoPanel() {
  const [search, setSearch] = useState('');
  const [excelFilters, setExcelFilters] = useState<ExcelFilters>(EMPTY_EXCEL_FILTERS);
  const [sortCol, setSortCol] = useState<FilterCol | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState<'filtered' | 'all' | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);

  const query = useQuery({
    queryKey: ['despacho-equipo-listo-head'],
    queryFn: () =>
      fetchDespachoEquipoListoPage({
        limit: BATCH_LIMITS.API_PAGE_MAX,
      }),
    staleTime: 30_000,
  });

  const restCursor = query.data?.nextCursor ?? null;
  const restQuery = useQuery({
    queryKey: ['despacho-equipo-listo-rest', restCursor],
    queryFn: () => fetchEquipoListoRest(restCursor as string),
    enabled: Boolean(restCursor),
    staleTime: 30_000,
  });

  const searchText = debouncedSearch.trim();
  const searchQuery = useQuery({
    queryKey: ['despacho-equipo-listo-search', searchText],
    queryFn: () =>
      fetchDespachoEquipoListoPage({
        search: searchText,
        limit: BATCH_LIMITS.API_PAGE_MAX,
      }),
    enabled: searchText.length > 0,
    staleTime: 15_000,
  });

  const catalogsQuery = useQuery({
    queryKey: ['reference-catalogs', 'equipo-listo-tech'],
    queryFn: () => fetchReferenceCatalogsViaApi(),
    staleTime: 5 * 60_000,
  });

  const allRows = useMemo(() => {
    const seen = new Set<string>();
    const merged = [...(query.data?.items ?? []), ...(restQuery.data ?? [])];
    return merged
      .filter((row) => {
        const key = String(row.service_order_id || row.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(adaptRow);
  }, [query.data?.items, restQuery.data]);
  const searchRows = useMemo(
    () => (searchQuery.data?.items ?? []).map(adaptRow),
    [searchQuery.data?.items]
  );
  const datasetRows = searchText ? searchRows : allRows;

  const setColFilter = useCallback((col: FilterCol, next: ExcelFilterSelection) => {
    setExcelFilters((prev) => ({ ...prev, [col]: next }));
    startTransition(() => setPage(1));
  }, []);

  const setColSort = useCallback((col: FilterCol, dir: 'asc' | 'desc' | null) => {
    if (dir == null) {
      setSortCol(null);
      setSortDir(null);
      return;
    }
    setSortCol(col);
    setSortDir(dir);
  }, []);

  const clearFilters = useCallback(() => {
    setSearch('');
    setExcelFilters(EMPTY_EXCEL_FILTERS);
    setSortCol(null);
    setSortDir(null);
    startTransition(() => setPage(1));
  }, []);

  const hasExcelFilter = Object.values(excelFilters).some((s) => s != null);
  const hasActiveFilters = Boolean(debouncedSearch.trim()) || hasExcelFilter || Boolean(sortDir);

  const filteredRows = useMemo(() => {
    let list = datasetRows.filter((r) => matchesExcelFilters(r, excelFilters));

    if (sortCol && sortDir) {
      list = [...list].sort((a, b) => {
        const av = cellValue(a, sortCol);
        const bv = cellValue(b, sortCol);
        const cmp = av.localeCompare(bv, 'es', { sensitivity: 'base', numeric: true });
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }

    return list;
  }, [datasetRows, excelFilters, sortCol, sortDir]);

  /** Valores del menú Excel: respetan filtros de otras columnas (cascada). */
  const optionRowsByCol = useMemo(() => {
    const base = datasetRows;

    const cols: FilterCol[] = [
      'os',
      's1',
      's2',
      's3',
      's4',
      'tech',
      'model',
      'material',
      'valuation',
      'fecha',
    ];
    const map = {} as Record<FilterCol, string[]>;
    for (const col of cols) {
      const pool = base.filter((r) => matchesExcelFilters(r, excelFilters, col));
      map[col] = uniqueValues(pool, col);
    }
    return map;
  }, [datasetRows, excelFilters]);

  const totalCount = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) {
      startTransition(() => setPage(totalPages));
    }
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, safePage]);

  const startItem = totalCount === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(safePage * PAGE_SIZE, totalCount);

  const onPageChange = useCallback((value: React.SetStateAction<number>) => {
    startTransition(() => setPage(value));
  }, []);

  const techCards = useMemo(() => {
    const counts = new Map<string, number>();
    const techStats =
      query.data?.byTechnology?.length
        ? query.data.byTechnology
        : (searchQuery.data?.byTechnology ?? []);
    for (const row of techStats) {
      const name = String(row.tech_name || '').trim().toUpperCase();
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + (Number(row.total_os) || 0));
    }

    const catalogNames = (catalogsQuery.data?.technologies ?? [])
      .map((t) => String(t.name || '').trim().toUpperCase())
      .filter(Boolean);

    const names =
      catalogNames.length > 0
        ? [...catalogNames]
        : [...counts.keys()].sort((a, b) => a.localeCompare(b, 'es'));

    for (const name of counts.keys()) {
      if (!names.includes(name)) names.push(name);
    }

    return names.map((name) => ({
      name,
      count: counts.get(name) ?? 0,
    }));
  }, [query.data?.byTechnology, searchQuery.data?.byTechnology, catalogsQuery.data?.technologies]);

  const totalOs =
    query.data?.totalOs ??
    (searchText ? searchQuery.data?.totalOs : null) ??
    allRows.length;
  const listLoading = searchText ? searchQuery.isLoading : query.isLoading;
  const listFailed = searchText ? searchQuery.isError : query.isError;
  const listError = searchText ? searchQuery.error : query.error;

  const applyTechCard = (techName: string) => {
    const current = excelFilters.tech;
    const active = current != null && current.size === 1 && current.has(techName);
    if (active) {
      setColFilter('tech', null);
      return;
    }
    setColFilter('tech', new Set([techName]));
  };

  const handleExportExcel = async (scope: 'filtered' | 'all') => {
    if (exporting) return;
    setExporting(scope);
    try {
      const full = (await fetchAllDespachoEquipoListo()).map(adaptRow);
      const searchNeedle = debouncedSearch.trim().toLowerCase();
      const source =
        scope === 'all'
          ? full
          : full.filter((row) => {
              if (!matchesExcelFilters(row, excelFilters)) return false;
              if (!searchNeedle) return true;
              const blob = [row.os, row.s1, row.s2, row.s3, row.s4, row.tech, row.brand, row.model]
                .join(' ')
                .toLowerCase();
              return searchNeedle.split(/\s+/).every((token) => blob.includes(token));
            });

      if (source.length === 0) {
        notify.warning('No hay equipos en Equipo Listo para exportar.');
        return;
      }

      const excelRows = source.map((r, idx) => ({
        '#': idx + 1,
        OS: r.os,
        S1: r.s1 === '—' ? '' : r.s1,
        S2: r.s2 === '—' ? '' : r.s2,
        S3: r.s3 === '—' ? '' : r.s3,
        S4: r.s4 === '—' ? '' : r.s4,
        Tecnología: r.tech === '—' ? '' : r.tech,
        Marca: r.brand === '—' ? '' : r.brand,
        Modelo: r.model === '—' ? '' : r.model,
        Material: r.material === '—' ? '' : r.material,
        Valoración: r.valuation === '—' ? '' : r.valuation,
        'Listo desde': r.updatedAt === '—' ? '' : r.updatedAt,
      }));

      const ws = XLSX.utils.json_to_sheet(excelRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Equipo Listo');
      const stamp = new Date().toISOString().slice(0, 10);
      const fileName =
        scope === 'all' ? `Equipo_Listo_completo_${stamp}.xlsx` : `Equipo_Listo_${stamp}.xlsx`;
      XLSX.writeFile(wb, fileName);
      notify.success(`Excel generado: ${excelRows.length.toLocaleString('es-GT')} equipo(s)`);
    } catch (e: unknown) {
      notify.error('No se pudo exportar Equipo Listo', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setExporting(null);
    }
  };

  const columns: DataTableColumn<ListoRow>[] = useMemo(() => {
    const mk = (
      id: FilterCol,
      label: string,
      width: string,
      cell: (r: ListoRow) => React.ReactNode
    ): DataTableColumn<ListoRow> => ({
      id,
      width,
      header: (
        <ExcelColumnFilter
          label={label}
          values={optionRowsByCol[id]}
          selected={excelFilters[id]}
          onChange={(next) => setColFilter(id, next)}
          sortDir={sortCol === id ? sortDir : null}
          onSort={(dir) => setColSort(id, dir)}
        />
      ),
      cell,
    });

    return [
      mk('os', 'OS', '110px', (r) => (
        <span className="text-xs font-black font-mono text-[var(--heading)]">{r.os}</span>
      )),
      mk('s1', 'S1', 'minmax(120px,1.2fr)', (r) => (
        <span className="text-[11px] font-mono font-bold text-slate-800">{r.s1}</span>
      )),
      mk('s2', 'S2', 'minmax(100px,1fr)', (r) => (
        <span className="text-[11px] font-mono text-slate-600">{r.s2}</span>
      )),
      mk('s3', 'S3', 'minmax(100px,1fr)', (r) => (
        <span className="text-[11px] font-mono text-slate-600">{r.s3}</span>
      )),
      mk('s4', 'S4', 'minmax(100px,1fr)', (r) => (
        <span className="text-[11px] font-mono text-slate-600">{r.s4}</span>
      )),
      mk('tech', 'Tec.', '90px', (r) => (
        <span className="text-[10px] font-bold uppercase text-slate-600">{r.tech}</span>
      )),
      mk('model', 'Modelo', 'minmax(120px,1.2fr)', (r) => (
        <span className="text-[11px] font-semibold text-slate-800">
          {r.brand} {r.model}
        </span>
      )),
      mk('material', 'Material', '100px', (r) => (
        <span className="text-[10px] font-mono text-slate-700">{r.material}</span>
      )),
      mk('valuation', 'Valoración', '110px', (r) => (
        <span className="text-[10px] font-bold text-slate-600">{r.valuation}</span>
      )),
      mk('fecha', 'Listo desde', '130px', (r) => (
        <span className="text-[10px] text-slate-500">{r.updatedAt}</span>
      )),
    ];
  }, [excelFilters, optionRowsByCol, setColFilter, setColSort, sortCol, sortDir]);

  return (
    <div className="space-y-3 animate-in fade-in">
      {techCards.length > 0 ? (
        <div className="flex gap-3 overflow-x-auto pb-1 custom-scrollbar">
          {techCards.map((t) => {
            const sel = excelFilters.tech;
            const active = sel != null && sel.size === 1 && sel.has(t.name);
            return (
              <button
                key={t.name}
                type="button"
                onClick={() => applyTechCard(t.name)}
                title={active ? 'Quitar filtro' : `Filtrar por ${t.name}`}
                className="text-left"
              >
                <Card
                  className={`min-w-[112px] shrink-0 rounded-2xl border px-4 py-3 text-center shadow-sm transition-all ${
                    active
                      ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] ring-1 ring-[var(--accent)]/30'
                      : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]/40'
                  }`}
                >
                  <p className="mb-0.5 truncate text-[10px] font-semibold tracking-wide text-[var(--heading)] uppercase">
                    {t.name}
                  </p>
                  <h3 className="my-1 text-3xl font-bold leading-none text-[var(--heading)] tabular-nums">
                    {t.count.toLocaleString('es-GT')}
                  </h3>
                  <p className="text-[8px] font-semibold tracking-widest text-[var(--muted)] uppercase">
                    Equipos
                  </p>
                </Card>
              </button>
            );
          })}
          <Card className="min-w-[120px] shrink-0 rounded-2xl border-2 border-[var(--accent)]/30 bg-[var(--surface)] px-4 py-3 text-center shadow-sm">
            <p className="mb-0.5 text-[10px] font-semibold tracking-wide text-[var(--accent)] uppercase">
              Total OS
            </p>
            <h3 className="my-1 text-3xl font-bold leading-none text-[var(--heading)] tabular-nums">
              {Number(totalOs || 0).toLocaleString('es-GT')}
            </h3>
            <p className="text-[8px] font-semibold tracking-widest text-[var(--muted)] uppercase">
              Unidades
            </p>
          </Card>
        </div>
      ) : null}

      <Card className="p-3 border-[var(--border)]">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0" />
            <div>
              <h3 className="text-sm font-black uppercase tracking-wide text-[var(--heading)]">
                Equipo Listo
              </h3>
              <p className="text-xs text-[var(--muted)] max-w-2xl">
                Solo OS en{' '}
                <span className="font-semibold text-[var(--heading)]">Bodega Central</span> tras{' '}
                <span className="font-semibold text-[var(--heading)]">QC → Aceptado → Listo</span>.
                Stock ingresado sin Taller, Reacondicionado pendiente o Bodega Despacho no aparecen aquí.
              </p>
            </div>
            <Badge variant="blue" className="ml-2 font-black text-[10px]">
              {hasActiveFilters
                ? `${totalCount.toLocaleString('es-GT')} / ${Number(totalOs || 0).toLocaleString('es-GT')}`
                : Number(totalOs || 0).toLocaleString('es-GT')}
            </Badge>
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-[220px] max-w-lg">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  startTransition(() => setPage(1));
                }}
                placeholder="Buscar OS o serie…"
                className={`${erpFieldClass} pl-8 h-9 text-xs`}
              />
            </div>
            {hasActiveFilters ? (
              <Button
                variant="outline"
                className="h-9 px-3"
                onClick={clearFilters}
                leftIcon={<X className="w-3.5 h-3.5" />}
              >
                Limpiar
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3"
              disabled={exporting !== null || query.isLoading}
              onClick={() => void handleExportExcel('filtered')}
              title="Excel de lo que está filtrado, sobre toda la cola"
              leftIcon={
                exporting === 'filtered' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                )
              }
            >
              {exporting === 'filtered' ? 'Exportando…' : 'Excel'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3"
              disabled={exporting !== null || query.isLoading}
              onClick={() => void handleExportExcel('all')}
              title="Descarga todas las órdenes de Equipo Listo"
              leftIcon={
                exporting === 'all' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )
              }
            >
              {exporting === 'all' ? 'Descargando…' : 'Descargar todo'}
            </Button>
            <Button
              variant="outline"
              className="h-9 px-3"
              onClick={() => {
                void Promise.all([query.refetch(), restQuery.refetch()]).then(([head]) => {
                  if (head.isError) {
                    notify.error('No se pudo refrescar Equipo Listo', {
                      description: head.error instanceof Error ? head.error.message : undefined,
                    });
                  }
                });
              }}
              leftIcon={
                query.isFetching || restQuery.isFetching ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )
              }
            >
              Actualizar
            </Button>
          </div>
        </div>
      </Card>

      {listLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando equipos listos…
        </div>
      ) : listFailed ? (
        <Card className="p-8 text-center border-rose-200 bg-rose-50/40">
          <p className="text-sm font-bold text-rose-700">No se pudo cargar Equipo Listo</p>
          <p className="text-xs text-rose-600 mt-1">
            {listError instanceof Error ? listError.message : 'Error desconocido'}
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => void (searchText ? searchQuery.refetch() : query.refetch())}
          >
            Reintentar
          </Button>
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden border-[var(--border)]">
          <DataTable
            columns={columns}
            data={pageItems}
            getRowId={(r) => r.key}
            compact
            rowHeight={40}
            maxBodyHeight={520}
            headerClassName={erpTableHeader}
            headerTextClassName={erpTableHeaderText}
            emptyMessage={
              hasActiveFilters
                ? 'Sin resultados con los filtros actuales.'
                : 'No hay equipos en Equipo Listo. Deben estar en Bodega Central con QC completado (Aceptado → Listo), no solo movidos a bodega o despacho.'
            }
          />
          <TablePagination
            totalCount={totalCount}
            page={safePage}
            totalPages={totalPages}
            startItem={startItem}
            endItem={endItem}
            pageSize={PAGE_SIZE}
            onPageChange={onPageChange}
            itemLabel="equipos (OS)"
          />
        </Card>
      )}
    </div>
  );
}
