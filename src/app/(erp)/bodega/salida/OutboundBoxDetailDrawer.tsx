'use client';

import { memo, useMemo } from 'react';
import { Badge, Button, Card, DataTable, type DataTableColumn, notify } from '@/components/ui';
import { Cpu, Download, Eye, MapPin, Package, X } from 'lucide-react';
import { fetchBoxSeriesUi } from '@/modules/inventario/client/warehouseBoxSeries';
import type { OutboundBoxRow } from './outboundSalidaTypes';

type Props = {
  box: OutboundBoxRow;
  loading: boolean;
  seriesRows: any[];
  onClose: () => void;
  onExportExcel: (boxId: string, label: string) => void;
  exporting: boolean;
};

export const OutboundBoxDetailDrawer = memo(function OutboundBoxDetailDrawer({
  box,
  loading,
  seriesRows,
  onClose,
  onExportExcel,
  exporting,
}: Props) {
  const equipCount = seriesRows.length;

  const columns = useMemo((): DataTableColumn<any>[] => {
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
      { id: 's2', header: 'S2', width: '130px', cell: (item) => <span className="font-mono text-[10px]">{item.s2 || '—'}</span> },
      { id: 's3', header: 'S3', width: '130px', cell: (item) => <span className="font-mono text-[10px]">{item.s3 || '—'}</span> },
      { id: 's4', header: 'S4', width: '130px', cell: (item) => <span className="font-mono text-[10px]">{item.s4 || '—'}</span> },
      {
        id: 'modelo',
        header: 'Modelo',
        width: '120px',
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
        id: 'guia',
        header: 'Guía',
        width: '120px',
        cell: (item) => <span className="font-mono text-[10px]">{item.guia || '—'}</span>,
      },
      {
        id: 'agencia',
        header: 'Agencia',
        width: '120px',
        cell: (item) => <span className="text-[10px]">{item.agenciaCAC || '—'}</span>,
      },
      {
        id: 'fecha',
        header: 'Pistoleado / ingreso',
        width: '140px',
        cell: (item) => <span className="text-[10px] text-[var(--muted)]">{item.fechaHora || '—'}</span>,
      },
      {
        id: 'sap',
        header: 'SAP',
        width: '100px',
        cell: (item) => (
          <span className="text-[9px] font-bold uppercase">{item.sap_status || '—'}</span>
        ),
      },
    ];
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-5xl flex-col bg-[var(--surface)] shadow-2xl animate-slide-in-right">
        <div className="border-b border-[var(--border)] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="blue">{box.displayId}</Badge>
                {box.isLegacyBoxCode && (
                  <Badge variant="yellow" className="text-[8px] font-black">
                    LEGACY
                  </Badge>
                )}
                <Badge variant="slate">BODEGA DE SALIDA</Badge>
              </div>
              <h2 className="text-xl font-black text-[var(--heading)]">
                {box.marcaLabel} {box.modeloLabel}
              </h2>
              <div className="mt-2 flex flex-wrap gap-4 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
                <span className="inline-flex items-center gap-1">
                  <Cpu className="h-3 w-3 text-[var(--accent)]" /> {box.techName}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-[var(--accent)]" /> {box.rack}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Package className="h-3 w-3 text-[var(--accent)]" /> {box.unitCount}/{box.capacity || '—'}{' '}
                  equipos
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={exporting}
                className="gap-1.5"
                onClick={() => onExportExcel(box.realDbId, box.displayId.replace(/[^\w.-]+/g, '_'))}
              >
                <Download className="h-4 w-4 text-emerald-600" />
                Excel caja
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
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <Card padding="none" className="overflow-hidden border border-[var(--border)]">
            <div className="border-b border-[var(--border)] bg-[var(--surface-hover)] px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                Equipos pistoleados en caja · {loading ? '…' : `${equipCount} filas`}
              </p>
            </div>
            {loading ? (
              <div className="py-16 text-center text-sm text-[var(--muted)]">Cargando series…</div>
            ) : (
              <DataTable
                columns={columns}
                data={seriesRows}
                getRowId={(item, i) => `${item.ordenServicio}-${item.s1}-${i}`}
                rowHeight={48}
                maxBodyHeight={520}
                minWidth={1200}
                compact
                emptyMessage="No hay equipos registrados en esta caja OUTBOUND."
              />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
});

export async function loadOutboundBoxSeries(boxId: string): Promise<any[]> {
  try {
    return await fetchBoxSeriesUi(boxId);
  } catch (err) {
    notify.error('No se pudo cargar el detalle', {
      description: err instanceof Error ? err.message : 'Error de conexión',
    });
    return [];
  }
}
