'use client';

import { memo } from 'react';
import { Badge, Button } from '@/components/ui';
import {
  Truck,
  Trash2,
  FileUp,
  FileDown,
  Plus,
  Activity,
  CheckSquare,
  Square,
  Edit3,
  Save,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { WORKSHOP_CATALOG_PAGE_SIZE } from '../utils/workshopCatalogCsv';

type Props = {
  loading: boolean;
  agencias: any[];
  paginatedAgencias: any[];
  selectedAgencyIds: Set<string>;
  totalPages: number;
  currentPage: number;
  rangeStart: number;
  rangeEnd: number;
  setCurrentPage: (page: number) => void;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
  onBulkDelete: () => void;
  onBulkImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBulkExport: () => void;
  onOpenModal: (type: string, item?: any) => void;
  onQuickSave: (type: string, item: any) => void | Promise<void>;
  onDelete: (type: string, id: string) => void;
};

export const AgenciasView = memo(function AgenciasView({
  loading,
  agencias,
  paginatedAgencias,
  selectedAgencyIds,
  totalPages,
  currentPage,
  rangeStart,
  rangeEnd,
  setCurrentPage,
  onToggleAll,
  onToggleOne,
  onBulkDelete,
  onBulkImport,
  onBulkExport,
  onOpenModal,
  onQuickSave,
  onDelete,
}: Props) {
  const showPager = agencias.length > WORKSHOP_CATALOG_PAGE_SIZE;
  const pageNumbers =
    totalPages <= 7
      ? Array.from({ length: totalPages }, (_, i) => i + 1)
      : [...new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1])]
          .filter((p) => p >= 1 && p <= totalPages)
          .sort((a, b) => a - b);

  return (
    <div className="animate-rise-in space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-[#181c3a] p-2 rounded-xl shadow-lg shadow-[#181c3a]/10">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-black text-[#181c3a]">Directorio de Agencias CAC</h3>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Gestione los puntos de recepción y sus contactos
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {selectedAgencyIds.size > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onBulkDelete}
              className="bg-rose-50 text-rose-500 border-rose-100 font-black text-[9px] uppercase tracking-widest hover:bg-rose-500 hover:text-white"
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Eliminar {selectedAgencyIds.size}
            </Button>
          ) : null}
          <input type="file" id="bulk-import" className="hidden" accept=".xlsx,.xls,.csv" onChange={onBulkImport} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => document.getElementById('bulk-import')?.click()}
            className="border-slate-200 text-slate-600 font-black text-[9px] uppercase tracking-widest"
            leftIcon={<FileUp className="w-3.5 h-3.5" />}
          >
            Importar Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onBulkExport}
            className="border-slate-200 text-slate-600 font-black text-[9px] uppercase tracking-widest"
            leftIcon={<FileDown className="w-3.5 h-3.5" />}
          >
            Exportar Excel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onOpenModal('agencia')}
            className="bg-[#181c3a] text-white shadow-xl shadow-[#181c3a]/20"
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Nueva Agencia
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm overflow-x-auto">
        {loading ? (
          <div className="py-10 text-center">
            <Activity className="w-10 h-10 animate-spin mx-auto text-[#2ec4f1] mb-4" />
            <p className="text-[10px] font-black uppercase text-slate-400">Sincronizando con la nube...</p>
          </div>
        ) : agencias.length === 0 ? (
          <div className="py-16 text-center opacity-20">
            <Truck size={48} className="mx-auto mb-3" />
            <p className="text-[10px] font-black uppercase tracking-widest">No hay agencias registradas</p>
          </div>
        ) : (
          <>
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-3 py-2 w-8">
                    <button type="button" onClick={onToggleAll} className="text-slate-300 hover:text-[#2ec4f1]">
                      {selectedAgencyIds.size === agencias.length && agencias.length > 0 ? (
                        <CheckSquare size={14} className="text-[#2ec4f1]" />
                      ) : (
                        <Square size={14} />
                      )}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-400">Código</th>
                  <th className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-400">Nombre</th>
                  <th className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-400">Encargado</th>
                  <th className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-400">Email</th>
                  <th className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-400">Teléfono</th>
                  <th className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-400">Dirección</th>
                  <th className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-400 text-right w-[112px]">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedAgencias.map((ag) => (
                  <tr key={ag.dbId || ag.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => onToggleOne(ag.dbId)} className="text-slate-300 hover:text-[#2ec4f1]">
                        {selectedAgencyIds.has(ag.dbId) ? (
                          <CheckSquare size={14} className="text-[#2ec4f1]" />
                        ) : (
                          <Square size={14} />
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <Badge className="bg-[#181c3a] text-[#2ec4f1] border-none font-black text-[9px] px-1.5 py-0 whitespace-nowrap">
                        {ag.id}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-xs font-black uppercase text-[#181c3a]">{ag.nombre}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-[10px] font-bold uppercase text-slate-500 max-w-[120px] truncate block">
                        {ag.encargado}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-[10px] font-medium text-slate-500">{ag.email}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-[10px] font-bold text-[#181c3a] whitespace-nowrap">{ag.telefono}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-[10px] text-slate-500 line-clamp-2 max-w-[180px]">{ag.direccion}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          title="Editar"
                          onClick={() => onOpenModal('agencia', ag)}
                          className="p-1 text-slate-400 hover:text-[#181c3a] rounded-lg"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          type="button"
                          title="Guardar"
                          onClick={() => void onQuickSave('agencia', ag)}
                          className="p-1 text-slate-400 hover:text-emerald-600 rounded-lg"
                        >
                          <Save size={14} />
                        </button>
                        <button
                          type="button"
                          title="Eliminar"
                          onClick={() => onDelete('agencia', ag.dbId)}
                          className="p-1 text-slate-400 hover:text-rose-500 rounded-lg"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {rangeStart}–{rangeEnd} de {agencias.length} agencias · {WORKSHOP_CATALOG_PAGE_SIZE} / pág.
              </p>
              {showPager ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-30"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  {pageNumbers.map((page, idx) => {
                    const prev = pageNumbers[idx - 1];
                    const gap = prev != null && page - prev > 1;
                    return (
                      <span key={page} className="flex items-center gap-1">
                        {gap ? <span className="px-1 text-slate-300">…</span> : null}
                        <button
                          type="button"
                          onClick={() => setCurrentPage(page)}
                          className={`min-w-[2rem] rounded-lg px-2 py-1 text-xs font-black ${
                            currentPage === page
                              ? 'bg-[#181c3a] text-white'
                              : 'border border-slate-200 bg-white text-slate-500 hover:bg-slate-100'
                          }`}
                        >
                          {page}
                        </button>
                      </span>
                    );
                  })}
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-30"
                    aria-label="Página siguiente"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
});
