'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, notify, confirmDialog, DataTable, type DataTableColumn } from '@/components/ui';
import { Box, Eye, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { getAgenciaLabel } from '../backofficeHelpers';
import type { CatalogAgency } from '../types';
import type { BackofficeTab } from '../types';
import {
  buildSubBodegaRows,
  countSubBodegaBoxes,
  type SubBodegaRow,
} from '../subBodega/filterSubBodegaRows';

type Props = {
  activeTab: BackofficeTab;
  allReceptions: SubBodegaRow['reception'][];
  setAllReceptions: React.Dispatch<React.SetStateAction<SubBodegaRow['reception'][]>>;
  dateFilterFrom: string;
  dateFilterTo: string;
  setDateFilterFrom: (value: string) => void;
  setDateFilterTo: (value: string) => void;
  CAC_AGENCIES: CatalogAgency[];
  fetchPending: (opts?: { silent?: boolean }) => Promise<void>;
  onViewReception: (reception: SubBodegaRow['reception']) => void;
  onReclassify: (reception: SubBodegaRow['reception']) => void;
};

export function SubBodegaTab({
  activeTab,
  allReceptions,
  setAllReceptions,
  dateFilterFrom,
  dateFilterTo,
  setDateFilterFrom,
  setDateFilterTo,
  CAC_AGENCIES,
  fetchPending,
  onViewReception,
  onReclassify,
}: Props) {
  const isAccesorios = activeTab === 'sub_accesorios';
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setSearch('');
  }, [activeTab]);

  const allRows = useMemo(
    () => buildSubBodegaRows(allReceptions, activeTab, dateFilterFrom, dateFilterTo),
    [allReceptions, activeTab, dateFilterFrom, dateFilterTo]
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter((item) => {
      const agency = getAgenciaLabel(item.reception, CAC_AGENCIES, item.guide).toLowerCase();
      const notes = (item.reception.notes || '').toLowerCase();
      const user = (item.processUser || '').toLowerCase();
      return (
        item.guide.toLowerCase().includes(q) ||
        agency.includes(q) ||
        notes.includes(q) ||
        user.includes(q)
      );
    });
  }, [allRows, search, CAC_AGENCIES]);

  const boxCount = countSubBodegaBoxes(allReceptions, activeTab, dateFilterFrom, dateFilterTo);

  const handleArchive = async (item: SubBodegaRow) => {
    const ok = await confirmDialog({
      title: 'Archivar caja',
      message: `¿Está seguro de OCULTAR/ARCHIVAR la caja ${item.guide} y todo su contenido heredado?`,
      confirmText: 'Archivar',
    });
    if (!ok) return;
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error('Cliente Supabase no disponible');
      const { error } = await supabase
        .from('receptions')
        .update({ status: 'ARCHIVADO' })
        .eq('id', item.reception.id);
      if (error) throw error;
      await supabase
        .from('series')
        .update({ current_status: 'archivado' })
        .eq('current_reception_id', item.reception.id);
      setAllReceptions((prev) =>
        prev.map((r) => (r.id === item.reception.id ? { ...r, status: 'ARCHIVADO' } : r))
      );
      notify.success('La caja y sus equipos han sido archivados correctamente.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      notify.error('Error al archivar', { description: message });
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchPending({ silent: true });
      notify.success('Datos actualizados desde la base de datos');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      notify.error('No se pudieron refrescar los datos', { description: message });
    } finally {
      setRefreshing(false);
    }
  };

  // Columnas de la sub-bodega (C3: DataTable virtualizado). Se definen dentro
  // del componente porque las celdas usan handlers/estado del scope.
  const columns: DataTableColumn<SubBodegaRow>[] = [
    {
      id: 'fecha',
      header: 'Fecha Ingreso',
      width: 'minmax(150px,1fr)',
      cell: (item) => (
        <div className="min-w-0">
          <div className="text-xs font-bold text-slate-500">{item.processDate}</div>
          <div className="text-[9px] text-slate-400 uppercase mt-1">Por: {item.processUser}</div>
        </div>
      ),
    },
    {
      id: 'guide',
      header: 'No. Guía / Caja',
      width: 'minmax(140px,1fr)',
      cell: (item) => (
        <span className="text-sm font-black text-[#181c3a] font-mono bg-slate-100 px-3 py-1.5 rounded-lg whitespace-pre-wrap">
          {item.guide}
        </span>
      ),
    },
    {
      id: 'origen',
      header: 'Origen (Agencia)',
      width: 'minmax(140px,1fr)',
      cellClassName: 'text-xs font-black text-[#181c3a] uppercase',
      cell: (item) => getAgenciaLabel(item.reception, CAC_AGENCIES, item.guide),
    },
    {
      id: 'notas',
      header: 'Notas de Transferencia',
      width: 'minmax(180px,1.5fr)',
      cell: (item) => (
        <p className="text-xs font-bold text-slate-400 italic max-w-md">
          {item.reception.notes?.split('Notas: ')[1] || 'Sin notas adicionales'}
        </p>
      ),
    },
    {
      id: 'estatus',
      header: 'Estatus',
      width: '170px',
      align: 'right',
      cell: () => (
        <Badge
          className={`border-none font-black text-[9px] uppercase tracking-widest px-4 py-1.5 rounded-full ${
            isAccesorios ? 'bg-emerald-50 text-emerald-500' : 'bg-amber-50 text-amber-500'
          }`}
        >
          {isAccesorios ? 'BODEGA: ACCESORIOS' : 'BODEGA: MÓVILES'}
        </Badge>
      ),
    },
    {
      id: 'acciones',
      header: 'Acciones',
      width: '150px',
      align: 'right',
      cell: (item) => (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onViewReception(item.reception);
            }}
            className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-400 rounded-lg transition-colors"
            title="Ver Detalles"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onReclassify(item.reception);
            }}
            className="p-2 bg-emerald-50 hover:bg-emerald-500 text-emerald-500 hover:text-white rounded-lg transition-colors"
            title="Abrir en Bandeja (Reclasificar)"
          >
            <Box className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void handleArchive(item);
            }}
            className="p-2 bg-rose-50 hover:bg-rose-500 text-rose-500 hover:text-white rounded-lg transition-colors"
            title="Eliminar / Archivar Caja"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-8 animate-rise-in">
      <div className="flex flex-col gap-4 px-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-black text-[#181c3a] uppercase tracking-tight">
            {isAccesorios ? 'Inventario de Accesorios' : 'Inventario de Teléfonos / Móviles'}
          </h2>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mt-2">
            Control de cajas enviadas a sub-bodega desde Backoffice
          </p>
        </div>
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2 bg-white rounded-2xl border-2 border-slate-100 p-1">
            <input
              type="date"
              className="bg-transparent border-none text-[10px] font-black uppercase text-slate-500 outline-none px-2 h-10"
              value={dateFilterFrom}
              onChange={(e) => setDateFilterFrom(e.target.value)}
              title="Fecha Inicial"
            />
            <span className="text-slate-300 font-bold">-</span>
            <input
              type="date"
              className="bg-transparent border-none text-[10px] font-black uppercase text-slate-500 outline-none px-2 h-10"
              value={dateFilterTo}
              onChange={(e) => setDateFilterTo(e.target.value)}
              title="Fecha Final"
            />
            {(dateFilterFrom || dateFilterTo) && (
              <button
                type="button"
                onClick={() => {
                  setDateFilterFrom('');
                  setDateFilterTo('');
                }}
                className="w-6 h-6 flex items-center justify-center bg-rose-50 text-rose-500 rounded-full hover:bg-rose-100 mr-2"
                title="Limpiar fechas"
              >
                <X size={12} strokeWidth={3} />
              </button>
            )}
          </div>
          <Button
            variant="outline"
            className="rounded-2xl h-12 px-6 font-black text-[10px] uppercase tracking-widest border-2 border-slate-100 text-slate-400 hover:bg-slate-50 flex items-center gap-2"
            disabled={refreshing}
            onClick={() => void handleRefresh()}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : undefined} />
            Refrescar Datos
          </Button>
          <div
            className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest ${
              isAccesorios ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
            }`}
          >
            {search.trim() ? `${rows.length} / ${boxCount}` : boxCount} Cajas Registradas
          </div>
        </div>
      </div>

      <div className="relative group max-w-xl px-2">
        <Search className="absolute left-8 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#2ec4f1] transition-colors" />
        <input
          type="text"
          placeholder="BUSCAR POR GUÍA, AGENCIA O USUARIO..."
          className="w-full h-12 pl-12 pr-10 bg-white border-2 border-slate-100 rounded-2xl font-black text-[10px] text-[#181c3a] outline-none focus:border-[#2ec4f1] transition-all uppercase tracking-widest placeholder:text-slate-300"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            title="Limpiar búsqueda"
          >
            <X size={14} strokeWidth={3} />
          </button>
        )}
      </div>

      <Card className="p-0 bg-white rounded-[2.5rem] shadow-2xl border-none overflow-hidden">
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(item) => item.id}
          onRowClick={(item) => onViewReception(item.reception)}
          rowHeight={72}
          maxBodyHeight={560}
          minWidth={980}
          headerClassName={`sticky top-0 z-10 ${isAccesorios ? 'bg-emerald-500' : 'bg-amber-500'}`}
          headerTextClassName="text-white"
          emptyMessage={
            search.trim()
              ? 'No hay cajas que coincidan con la búsqueda'
              : 'No hay cajas registradas en esta sub-bodega'
          }
        />
      </Card>
    </div>
  );
}
