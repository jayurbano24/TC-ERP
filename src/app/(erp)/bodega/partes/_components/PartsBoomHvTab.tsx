'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, DataTable, type DataTableColumn } from '@/components/ui';
import { erpFieldClass, erpTableHeader, erpTableHeaderText } from '@/lib/design/tokens';
import { Download, Search } from 'lucide-react';
import { fetchHarvestHistory } from '@/lib/api/parts';
import {
  buildBoomHvExcelRows,
  flattenBoomHvRows,
  type BoomHvRow,
  type HarvestReportRow,
} from '@/modules/parts/domain/harvestReport';

export function PartsBoomHvTab() {
  const [search, setSearch] = useState('');
  const historyQuery = useQuery({
    queryKey: ['parts', 'harvest', 'history'],
    queryFn: () => fetchHarvestHistory(2000),
  });
  const sessions = useMemo(
    () => (historyQuery.data ?? []) as HarvestReportRow[],
    [historyQuery.data]
  );
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const allRows = flattenBoomHvRows(sessions);
    if (!term) return allRows;
    return allRows.filter((row) => [
      row.caseId, row.os, row.serial, row.brand, row.model, row.technology, row.sku, row.part,
    ].some((value) => String(value ?? '').toLowerCase().includes(term)));
  }, [search, sessions]);

  const columns: DataTableColumn<BoomHvRow>[] = useMemo(() => [
    { id: 'date', header: 'Fecha', width: '125px', cell: (row) => row.createdAt ? new Date(row.createdAt).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' }) : '—' },
    { id: 'case', header: 'Caso', width: '90px', cell: (row) => <span className="font-mono text-[9px]">{row.caseId.slice(0, 8)}</span> },
    { id: 'os', header: 'OS', width: '95px', cell: (row) => <span className="font-mono font-bold">{row.os || '—'}</span> },
    { id: 'serial', header: 'Serie donante', width: '145px', cell: (row) => <span className="font-mono text-[10px]">{row.serial || '—'}</span> },
    { id: 'brand', header: 'Marca', width: '90px', cell: (row) => row.brand },
    { id: 'model', header: 'Modelo', width: '135px', cell: (row) => row.model },
    { id: 'technology', header: 'Tecnologia', width: '100px', cell: (row) => row.technology },
    { id: 'sku', header: 'SKU', width: '105px', cell: (row) => <span className="font-mono font-bold">{row.sku}</span> },
    { id: 'part', header: 'Pieza retirada', width: 'minmax(160px,1fr)', cell: (row) => row.part },
    { id: 'quantity', header: 'Cantidad', width: '75px', align: 'right', cell: (row) => <span className="tabular-nums font-bold">{row.quantity}</span> },
  ], []);

  const downloadReport = async () => {
    const XLSX = await import('xlsx');
    const worksheet = XLSX.utils.json_to_sheet(buildBoomHvExcelRows(sessions));
    worksheet['!cols'] = [
      { wch: 20 }, { wch: 38 }, { wch: 22 }, { wch: 16 }, { wch: 24 },
      { wch: 14 }, { wch: 22 }, { wch: 18 }, { wch: 16 }, { wch: 28 },
      { wch: 10 }, { wch: 28 }, { wch: 32 },
    ];
    worksheet['!autofilter'] = { ref: worksheet['!ref'] || 'A1:M1' };
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Boom HV');
    XLSX.writeFile(workbook, `boom-hv-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="relative">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className={`${erpFieldClass} pl-10`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar serie, OS, marca, modelo, tecnologia o pieza..."
            aria-label="Buscar en reporte Boom HV"
          />
        </div>
      </Card>
      <Card className="overflow-hidden p-0">
        <div className={`${erpTableHeader} flex items-center justify-between gap-2 px-2.5 py-1.5`}>
          <span className={erpTableHeaderText}>Reporte Boom HV</span>
          <Button variant="outline" className="!h-8 gap-1.5 !text-[9px]" disabled={sessions.length === 0} onClick={() => void downloadReport()}>
            <Download aria-hidden="true" className="h-3.5 w-3.5" /> Descargar Excel
          </Button>
        </div>
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
          compact
          rowHeight={36}
          minWidth={1180}
          emptyMessage={historyQuery.isLoading ? 'Cargando reporte...' : search ? 'Sin resultados para la busqueda.' : 'Aun no hay piezas retiradas mediante harvesting.'}
        />
      </Card>
    </div>
  );
}
