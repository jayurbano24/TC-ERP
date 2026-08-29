'use client';

import React, { useMemo, useState, startTransition, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Card,
  DataTable,
  TablePagination,
  type DataTableColumn,
} from '@/components/ui';
import { ModulePage, ModuleToolbar } from '@/components/module-page';
import { erpTableHeader, erpTableHeaderText } from '@/lib/design/tokens';
import {
  fetchDespachoHistoryByGuide,
  type DespachoHistoryGuideDetail,
} from '@/lib/api/despachoReads';
import { fetchReferenceCatalogsViaApi } from '@/lib/api/referenceCatalogs';
import { ArrowLeft, Box, Package, Truck } from 'lucide-react';

const PAGE_SIZE = 25;

export default function DespachoHistorialDetallePage() {
  const params = useParams<{ guide: string }>();
  const guide = decodeURIComponent(String(params?.guide || '')).trim();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const detailQuery = useQuery({
    queryKey: ['despacho-history-guide', guide],
    queryFn: () => fetchDespachoHistoryByGuide(guide),
    enabled: Boolean(guide),
    staleTime: 30_000,
  });

  const catalogsQuery = useQuery({
    queryKey: ['reference-catalogs', 'despacho-historial-detalle'],
    queryFn: fetchReferenceCatalogsViaApi,
    staleTime: 5 * 60_000,
  });

  const brandName = useCallback(
    (id: string | null | undefined) => {
      if (!id) return '—';
      return catalogsQuery.data?.brandNameById.get(id) || '—';
    },
    [catalogsQuery.data?.brandNameById]
  );
  const modelName = useCallback(
    (id: string | null | undefined) => {
      if (!id) return '—';
      return catalogsQuery.data?.modelNameById.get(id) || '—';
    },
    [catalogsQuery.data?.modelNameById]
  );

  const detail = detailQuery.data as DespachoHistoryGuideDetail | undefined;

  const filteredBoxes = useMemo(() => {
    const boxes = detail?.boxes ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return boxes;
    const compact = term.replace(/^(ob|mb|cs|box)-/, '').replace(/^0+/, '');
    return boxes.filter((b) => {
      const code = String(b.box_code || '').toLowerCase();
      if (code.includes(term)) return true;
      if (compact && code.replace(/^(ob|mb|cs)-/, '').replace(/^0+/, '').includes(compact)) {
        return true;
      }
      if (String(b.material || '').toLowerCase().includes(term)) return true;
      if (String(b.valuation || '').toLowerCase().includes(term)) return true;
      return (b.series_numbers || []).some((sn) => sn.toLowerCase().includes(term));
    });
  }, [detail?.boxes, search]);

  const totalCount = filteredBoxes.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredBoxes.slice(start, start + PAGE_SIZE);
  }, [filteredBoxes, safePage]);

  const startItem = totalCount === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(safePage * PAGE_SIZE, totalCount);

  const columns: DataTableColumn<(typeof filteredBoxes)[number]>[] = [
    {
      id: 'box',
      header: 'Caja / Outbound',
      width: 'minmax(140px,1.2fr)',
      cell: (row) => (
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <Box className="w-4 h-4" />
          </div>
          <span className="text-sm font-black font-mono text-[var(--heading)] truncate">
            {row.box_code || '—'}
          </span>
        </div>
      ),
    },
    {
      id: 'marca',
      header: 'Marca',
      width: 'minmax(100px,1fr)',
      cell: (row) => (
        <span className="text-xs font-bold text-slate-600">{brandName(row.brand_id)}</span>
      ),
    },
    {
      id: 'modelo',
      header: 'Modelo',
      width: 'minmax(120px,1.2fr)',
      cell: (row) => (
        <span className="text-xs font-bold text-slate-600">{modelName(row.model_id)}</span>
      ),
    },
    {
      id: 'mat',
      header: 'Material / Lote',
      width: 'minmax(140px,1.2fr)',
      cell: (row) => (
        <div className="text-[11px] font-mono font-bold text-slate-500">
          <div>{row.material || '—'}</div>
          <div className="text-slate-400">{row.valuation || '—'}</div>
        </div>
      ),
    },
    {
      id: 'equipos',
      header: 'Equipos',
      width: '90px',
      cell: (row) => (
        <span className="text-sm font-bold text-slate-700">{row.equipos_count}</span>
      ),
    },
    {
      id: 'series',
      header: 'Series (preview)',
      width: 'minmax(180px,1.5fr)',
      cell: (row) => (
        <span
          className="text-[10px] font-mono font-bold text-slate-400 line-clamp-2"
          title={(row.series_numbers || []).join(', ')}
        >
          {(row.series_preview || []).join(' · ') || '—'}
          {(row.series_numbers?.length || 0) > (row.series_preview?.length || 0)
            ? ` +${(row.series_numbers?.length || 0) - (row.series_preview?.length || 0)}`
            : ''}
        </span>
      ),
    },
    {
      id: 'fecha',
      header: 'Fecha',
      width: '160px',
      cell: (row) => (
        <span className="text-xs font-bold text-slate-500">
          {row.dispatched_at ? new Date(row.dispatched_at).toLocaleString() : '—'}
        </span>
      ),
    },
  ];

  return (
    <ModulePage
      title={`Conduce ${guide || '—'}`}
      subtitle="Detalle de cajas despachadas en esta salida"
      category="Despacho"
      actions={
        <Link
          href="/despacho?tab=historial"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-[var(--border)] bg-transparent px-6 text-sm font-bold text-[var(--foreground)] transition-all hover:bg-[var(--surface-hover)]"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al historial
        </Link>
      }
    >
      <div className="space-y-6">
        <Card className="p-5 border-2 border-emerald-100 bg-emerald-50/30">
          <div className="flex flex-wrap items-start gap-6">
            <div className="flex items-center gap-3 min-w-[160px]">
              <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700/70">
                  Nº Conduce
                </p>
                <p className="text-lg font-black font-mono text-[var(--heading)]">{guide || '—'}</p>
              </div>
            </div>
            <div className="min-w-[200px] flex-1">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                Destino / Detalle
              </p>
              <p className="text-sm font-bold text-slate-700 mt-0.5">
                {detail?.notes || (detailQuery.isLoading ? 'Cargando…' : '—')}
              </p>
            </div>
            <div className="flex flex-wrap gap-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Cajas</p>
                <p className="text-xl font-black text-[var(--heading)] flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-emerald-600" />
                  {detail?.box_count ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Equipos</p>
                <p className="text-xl font-black text-[var(--heading)]">
                  {detail?.equipos_total ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Usuario</p>
                <p className="text-sm font-bold text-slate-600 mt-1">
                  {detail?.dispatched_by_name || '—'}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Fecha salida
                </p>
                <p className="text-sm font-bold text-slate-600 mt-1">
                  {detail?.dispatched_at
                    ? new Date(detail.dispatched_at).toLocaleString()
                    : '—'}
                </p>
              </div>
              {detail?.dispatch_type ? (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                    Tipo
                  </p>
                  <Badge variant="blue">
                    {detail.dispatch_type === 'single_box'
                      ? 'Caja'
                      : detail.dispatch_type === 'partial'
                        ? 'Parcial'
                        : String(detail.dispatch_type).replace(/_/g, ' ')}
                  </Badge>
                </div>
              ) : null}
            </div>
          </div>
        </Card>

        <ModuleToolbar
          searchValue={search}
          searchPlaceholder="Filtrar cajas por código OB, material, lote o serie…"
          onSearch={(v) => {
            setSearch(v);
            startTransition(() => setPage(1));
          }}
        />

        <Card padding="none" className="overflow-hidden">
          <DataTable
            columns={columns}
            data={pageItems}
            getRowId={(row) => row.dispatch_id}
            rowHeight={56}
            maxBodyHeight={560}
            minWidth={960}
            headerClassName={erpTableHeader}
            headerTextClassName={erpTableHeaderText}
            emptyMessage={
              detailQuery.isLoading
                ? 'Cargando cajas del conduce…'
                : detailQuery.isError
                  ? detailQuery.error instanceof Error
                    ? detailQuery.error.message
                    : 'No se pudo cargar el detalle'
                  : search.trim()
                    ? `Sin cajas para «${search.trim()}»`
                    : 'Este conduce no tiene cajas registradas.'
            }
          />
          <TablePagination
            totalCount={totalCount}
            page={safePage}
            totalPages={totalPages}
            startItem={startItem}
            endItem={endItem}
            pageSize={PAGE_SIZE}
            onPageChange={(v) => startTransition(() => setPage(v))}
            itemLabel="cajas"
          />
        </Card>
      </div>
    </ModulePage>
  );
}
