'use client';

import { Badge, Card } from '@/components/ui';
import { Eye, Loader2, Package, RotateCcw, Trash2 } from 'lucide-react';
import { getAgenciaLabel } from '@/app/(erp)/produccion/backoffice/backofficeHelpers';
import type { CatalogAgency } from '@/app/(erp)/produccion/backoffice/types';
import type { BoxReturnRow } from '@/lib/database/returns';

type Props = {
  rows: BoxReturnRow[];
  loading: boolean;
  agencies: CatalogAgency[];
  selectedId: string | null;
  selectedIds: string[];
  onSelectRow: (row: BoxReturnRow) => void;
  onToggleSelect: (id: string, checked: boolean) => void;
  onToggleSelectAll: (checked: boolean) => void;
  onUndo: (row: BoxReturnRow) => void;
  onArchive: (row: BoxReturnRow) => void;
};

export function BodegaDevolucionTable({
  rows,
  loading,
  agencies,
  selectedId,
  selectedIds,
  onSelectRow,
  onToggleSelect,
  onToggleSelectAll,
  onUndo,
  onArchive,
}: Props) {
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;

  return (
    <Card className="p-0 bg-white rounded-[2.5rem] shadow-2xl border-none overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-rose-500 text-white">
              <th className="px-6 py-5 w-12 text-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => onToggleSelectAll(e.target.checked)}
                  className="w-4 h-4 accent-white rounded border-white/30 cursor-pointer"
                />
              </th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Fecha Ingreso</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">No. Guía / Caja</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Origen (Agencia)</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest">Notas de Transferencia</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-right">Estatus</th>
              <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-20 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-rose-400 mx-auto" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-20 text-center">
                  <Package className="w-12 h-12 text-slate-100 mx-auto mb-4" />
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">
                    No hay cajas en bodega devolución
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 mt-2">
                    Clasifique una caja como Devolución en Backoffice para enviarla aquí
                  </p>
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const agencyLabel = getAgenciaLabel(
                  {
                    carrier: row.carrier,
                    notes: row.receptionNotes,
                    reception_guides: [{ guide_number: row.sn, agency: row.agencyRaw }],
                  },
                  agencies,
                  row.sn
                );

                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-slate-50/50 transition-all group cursor-pointer ${
                      selectedId === row.id ? 'bg-rose-50/60' : ''
                    } ${selectedIds.includes(row.id) ? 'bg-blue-50/40' : ''}`}
                    onClick={() => onSelectRow(row)}
                  >
                    <td className="px-6 py-6 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(row.id)}
                        onChange={(e) => onToggleSelect(row.id, e.target.checked)}
                        className="w-4 h-4 accent-rose-500 rounded border-slate-300 cursor-pointer"
                      />
                    </td>
                    <td className="px-8 py-6 text-xs font-bold text-slate-500">
                      {row.processDate}
                      <div className="text-[9px] text-slate-400 uppercase mt-1">Por: {row.processUser}</div>
                    </td>
                    <td className="px-8 py-6">
                      <span className="text-sm font-black text-[#181c3a] font-mono bg-slate-100 px-3 py-1.5 rounded-lg whitespace-pre-wrap">
                        {row.sn}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-xs font-black text-[#181c3a] uppercase">{agencyLabel}</td>
                    <td className="px-8 py-6">
                      <p className="text-xs font-bold text-slate-400 italic max-w-md">
                        {row.transferNotes || 'Sin notas adicionales'}
                      </p>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <Badge
                        className={`border-none font-black text-[9px] uppercase tracking-widest px-4 py-1.5 rounded-full ${
                          row.estatus === 'Procesado'
                            ? 'bg-emerald-50 text-emerald-500'
                            : 'bg-rose-50 text-rose-500'
                        }`}
                      >
                        {row.estatus === 'Procesado' ? 'DESPACHADO' : 'BODEGA: DEVOLUCIÓN'}
                      </Badge>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectRow(row);
                          }}
                          className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-400 rounded-lg transition-colors"
                          title="Ver / Despachar"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUndo(row);
                          }}
                          className="p-2 bg-rose-50 hover:bg-rose-500 text-rose-500 hover:text-white rounded-lg transition-colors"
                          title="Regresar a Clasificación"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onArchive(row);
                          }}
                          className="p-2 bg-slate-50 hover:bg-red-500 text-red-400 hover:text-white rounded-lg transition-colors"
                          title="Archivar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
