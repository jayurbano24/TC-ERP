'use client';

import { memo, useMemo, useState } from 'react';
import { Badge, Button, Card, DataTable, type DataTableColumn, notify } from '@/components/ui';
import { Cpu, MapPin, Package, Printer, Tag, X } from 'lucide-react';
import { fetchBoxSeriesUi } from '@/modules/inventario/client/warehouseBoxSeries';
import { PrintBoxModal } from '@/app/(erp)/bodega/gestion/components/PrintBoxModal';
import { printScrapBoxLabel } from './printScrapBoxLabel';

export type ScrapBoxRow = {
  id: string;
  displayId: string;
  displayIdFull: string;
  isLegacyBoxCode: boolean;
  realDbId: string;
  rack: string;
  marcaLabel: string;
  modeloLabel: string;
  techName: string;
  unitCount: number;
  capacity: number;
  status: string;
  usuarioIngreso: string;
  fechaIngreso: string;
};

type Props = {
  box: ScrapBoxRow;
  loading: boolean;
  seriesRows: unknown[];
  onClose: () => void;
};

type SeriesUiRow = {
  ordenServicio?: string;
  s1?: string;
  s2?: string;
  s3?: string;
  s4?: string;
  marcaLabel?: string;
  modeloLabel?: string;
  material?: string;
  lote?: string;
  fechaHora?: string;
};

export const ScrapBoxDetailDrawer = memo(function ScrapBoxDetailDrawer({
  box,
  loading,
  seriesRows,
  onClose,
}: Props) {
  const [showPrint, setShowPrint] = useState(false);
  const rows = seriesRows as SeriesUiRow[];
  const equipCount = rows.length;

  const columns = useMemo((): DataTableColumn<SeriesUiRow>[] => {
    return [
      {
        id: 'os',
        header: 'OS',
        width: '100px',
        cell: (item) => (
          <span className="text-[10px] font-black text-[var(--accent)]">{item.ordenServicio || '—'}</span>
        ),
      },
      {
        id: 's1',
        header: 'S1 (SAP)',
        width: '140px',
        cell: (item) => (
          <span className="font-mono text-[10px] font-black text-[var(--heading)]">{item.s1 || '—'}</span>
        ),
      },
      {
        id: 's2',
        header: 'S2',
        width: '130px',
        cell: (item) => <span className="font-mono text-[10px]">{item.s2 || '—'}</span>,
      },
      {
        id: 's3',
        header: 'S3',
        width: '130px',
        cell: (item) => <span className="font-mono text-[10px]">{item.s3 || '—'}</span>,
      },
      {
        id: 's4',
        header: 'S4',
        width: '130px',
        cell: (item) => <span className="font-mono text-[10px]">{item.s4 || '—'}</span>,
      },
      {
        id: 'modelo',
        header: 'Modelo',
        width: '140px',
        cell: (item) => (
          <span className="text-[10px] font-bold">
            {[item.marcaLabel, item.modeloLabel].filter(Boolean).join(' ') || '—'}
          </span>
        ),
      },
      {
        id: 'material',
        header: 'Material',
        width: '90px',
        cell: (item) => <span className="text-[10px]">{item.material || '—'}</span>,
      },
      {
        id: 'lote',
        header: 'Valoración',
        width: '90px',
        cell: (item) => <span className="text-[10px]">{item.lote || '—'}</span>,
      },
      {
        id: 'fecha',
        header: 'Ingreso',
        width: '140px',
        cell: (item) => <span className="text-[10px] text-[var(--muted)]">{item.fechaHora || '—'}</span>,
      },
    ];
  }, []);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 backdrop-blur-sm">
        <div className="flex h-full w-full max-w-5xl flex-col bg-[var(--surface)] shadow-2xl animate-slide-in-right">
          <div className="border-b border-[var(--border)] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="red">{box.displayId}</Badge>
                  {box.isLegacyBoxCode && (
                    <Badge variant="yellow" className="text-[8px] font-black">
                      LEGACY
                    </Badge>
                  )}
                  <Badge variant="red" className="text-[8px] font-black">
                    SCRAP
                  </Badge>
                </div>
                <h2 className="text-xl font-black text-[var(--heading)]">
                  Detalle inventario SCRAPS · {box.marcaLabel} {box.modeloLabel}
                </h2>
                <div className="mt-2 flex flex-wrap gap-4 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
                  <span className="inline-flex items-center gap-1">
                    <Cpu className="h-3 w-3 text-rose-500" /> {box.techName}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-rose-500" /> {box.rack}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Package className="h-3 w-3 text-rose-500" /> {box.unitCount}/{box.capacity || '—'}{' '}
                    equipos
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowPrint(true)}
                >
                  <Printer className="h-4 w-4 text-rose-600" />
                  Imprimir etiqueta
                </Button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--surface-hover)]"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <Card className="mt-4 border-2 border-rose-200/70 bg-rose-50/60 p-4 dark:border-rose-900/40 dark:bg-rose-950/30">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-900/50">
                  <Tag className="h-5 w-5 text-rose-600" />
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-rose-600">
                    Captura de caja / Nº de etiqueta
                  </p>
                  <p className="font-mono text-xl font-black text-[var(--heading)]">{box.displayId}</p>
                  <p className="text-[10px] text-[var(--muted)]">
                    Código operativo: {box.id} · Usuario: {box.usuarioIngreso.split('@')[0]} ·{' '}
                    {box.fechaIngreso}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <Card padding="none" className="overflow-hidden border border-[var(--border)]">
              <div className="border-b border-[var(--border)] bg-[var(--surface-hover)] px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                  Inventario de series en caja · {loading ? '…' : `${equipCount} filas`}
                </p>
              </div>
              {loading ? (
                <div className="py-16 text-center text-sm text-[var(--muted)]">Cargando series…</div>
              ) : (
                <DataTable
                  columns={columns}
                  data={rows}
                  getRowId={(item, i) => `${item.ordenServicio}-${item.s1}-${i}`}
                  rowHeight={48}
                  maxBodyHeight={520}
                  minWidth={1100}
                  compact
                  emptyMessage="No hay equipos registrados en esta caja SCRAPS."
                />
              )}
            </Card>
          </div>
        </div>
      </div>

      {showPrint && (
        <PrintBoxModal
          box={{ id: box.displayId }}
          onClose={() => setShowPrint(false)}
          onPrint={(mode) => {
            printScrapBoxLabel(
              {
                id: box.displayId,
                marca: box.marcaLabel,
                modelo: box.modeloLabel,
                tecnologia: box.techName,
                cantidad: box.unitCount,
                fechaIngreso: box.fechaIngreso,
                series: rows.map((s) => ({
                  s1: s.s1,
                  s2: s.s2,
                  s3: s.s3,
                  s4: s.s4,
                  material: s.material,
                  lote: s.lote,
                })),
              },
              mode
            );
            setShowPrint(false);
          }}
        />
      )}
    </>
  );
});

export async function loadScrapBoxSeries(boxId: string): Promise<SeriesUiRow[]> {
  try {
    return (await fetchBoxSeriesUi(boxId)) as SeriesUiRow[];
  } catch (err) {
    notify.error('No se pudo cargar el detalle SCRAPS', {
      description: err instanceof Error ? err.message : 'Error de conexión',
    });
    return [];
  }
}
