'use client';

import { Badge, Button, Card } from '@/components/ui';
import { Box, Eye, Package, RefreshCw, Trash2, X } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { getAgenciaLabel } from '../backofficeHelpers';
import type { CatalogAgency } from '../types';
import type { BackofficeTab } from '../types';
import {
  buildSubBodegaRows,
  countSubBodegaBoxes,
  hasSubBodegaInventory,
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
  fetchHistory: (opts?: { silent?: boolean }) => Promise<void>;
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
  fetchHistory,
  onViewReception,
  onReclassify,
}: Props) {
  const isAccesorios = activeTab === 'sub_accesorios';
  const rows = buildSubBodegaRows(allReceptions, activeTab, dateFilterFrom, dateFilterTo);
  const boxCount = countSubBodegaBoxes(allReceptions, activeTab, dateFilterFrom, dateFilterTo);
  const hasInventory = hasSubBodegaInventory(allReceptions, activeTab);

  const handleArchive = async (item: SubBodegaRow) => {
    if (!confirm(`¿Está seguro de OCULTAR/ARCHIVAR la caja ${item.guide} y todo su contenido heredado?`)) return;
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
      alert('La caja y sus equipos han sido archivados correctamente.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      alert('Error al archivar: ' + message);
    }
  };

  return (
    <div className="space-y-8 animate-rise-in">
      <div className="flex items-center justify-between px-2">
        <div>
          <h2 className="text-xl font-black text-[#181c3a] uppercase tracking-tight">
            {isAccesorios ? 'Inventario de Accesorios' : 'Inventario de Teléfonos / Móviles'}
          </h2>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mt-2">
            Control de cajas enviadas a sub-bodega desde Backoffice
          </p>
        </div>
        <div className="flex gap-4 items-center">
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
            onClick={async () => {
              await fetchHistory();
              alert('Datos actualizados desde la base de datos');
            }}
          >
            <RefreshCw size={14} />
            Refrescar Datos
          </Button>
          <div
            className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest ${
              isAccesorios ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
            }`}
          >
            {boxCount} Cajas Registradas
          </div>
        </div>
      </div>

      <Card className="p-0 bg-white rounded-[2.5rem] shadow-2xl border-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className={isAccesorios ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Fecha Ingreso</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">No. Guía / Caja</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Origen (Agencia)</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Notas de Transferencia</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-right">Estatus</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-slate-50/50 transition-all group cursor-pointer"
                  onClick={() => onViewReception(item.reception)}
                >
                  <td className="px-8 py-6 text-xs font-bold text-slate-500">
                    {item.processDate}
                    <div className="text-[9px] text-slate-400 uppercase mt-1">Por: {item.processUser}</div>
                  </td>
                  <td className="px-8 py-6">
                    <span className="text-sm font-black text-[#181c3a] font-mono bg-slate-100 px-3 py-1.5 rounded-lg whitespace-pre-wrap">
                      {item.guide}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-xs font-black text-[#181c3a] uppercase">
                    {getAgenciaLabel(item.reception, CAC_AGENCIES, item.guide)}
                  </td>
                  <td className="px-8 py-6">
                    <p className="text-xs font-bold text-slate-400 italic max-w-md">
                      {item.reception.notes?.split('Notas: ')[1] || 'Sin notas adicionales'}
                    </p>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <Badge
                      className={`border-none font-black text-[9px] uppercase tracking-widest px-4 py-1.5 rounded-full ${
                        isAccesorios ? 'bg-emerald-50 text-emerald-500' : 'bg-amber-50 text-amber-500'
                      }`}
                    >
                      {isAccesorios ? 'BODEGA: ACCESORIOS' : 'BODEGA: MÓVILES'}
                    </Badge>
                  </td>
                  <td className="px-8 py-6 text-right">
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
                  </td>
                </tr>
              ))}
              {!hasInventory && (
                <tr>
                  <td colSpan={6} className="py-20 text-center">
                    <Package className="w-12 h-12 text-slate-100 mx-auto mb-4" />
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">
                      No hay cajas registradas en esta sub-bodega
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
