'use client';

import { memo } from 'react';
import { Badge, Button } from '@/components/ui';
import { Truck, Trash2, FileUp, FileDown, Plus, Activity, CheckSquare, Square, Edit3 } from 'lucide-react';

type Props = {
  loading: boolean;
  agencias: any[];
  paginatedAgencias: any[];
  selectedAgencyIds: Set<string>;
  totalPages: number;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
  onBulkDelete: () => void;
  onBulkImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBulkExport: () => void;
  onOpenModal: (type: string, item?: any) => void;
  onDelete: (type: string, id: string) => void;
};

/**
 * C1: vista de agencias CAC extraída del monolito configuracion y memoizada.
 * El estado (selección, paginación, datos) y la lógica viven en el padre;
 * aquí sólo se renderiza tabla + barra de acciones masivas + paginación.
 */
export const AgenciasView = memo(function AgenciasView({
  loading,
  agencias,
  paginatedAgencias,
  selectedAgencyIds,
  totalPages,
  currentPage,
  setCurrentPage,
  onToggleAll,
  onToggleOne,
  onBulkDelete,
  onBulkImport,
  onBulkExport,
  onOpenModal,
  onDelete,
}: Props) {
  return (
    <div className="animate-rise-in space-y-6">
      <div className="flex flex-col xl:flex-row justify-between items-center bg-white p-8 rounded-3xl border-2 border-slate-100 shadow-sm gap-6">
        <div className="flex items-center gap-4">
          <div className="bg-[#181c3a] p-3 rounded-2xl shadow-lg shadow-[#181c3a]/10">
            <Truck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-black text-[#181c3a]">Directorio de Agencias CAC</h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Gestione los puntos de recepción y sus contactos</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {selectedAgencyIds.size > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onBulkDelete}
              className="bg-rose-50 text-rose-500 border-rose-100 font-black text-[9px] uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all animate-in fade-in zoom-in"
              leftIcon={<Trash2 className="w-4 h-4" />}
            >
              Eliminar {selectedAgencyIds.size} Seleccionados
            </Button>
          )}
          <input type="file" id="bulk-import" className="hidden" accept=".csv, .xlsx" onChange={onBulkImport} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => document.getElementById('bulk-import')?.click()}
            className="border-2 border-slate-100 text-slate-500 font-black text-[9px] uppercase tracking-widest hover:bg-slate-50"
            leftIcon={<FileUp className="w-4 h-4" />}
          >
            Importar Masivo
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onBulkExport}
            className="border-2 border-slate-100 text-slate-500 font-black text-[9px] uppercase tracking-widest hover:bg-slate-50"
            leftIcon={<FileDown className="w-4 h-4" />}
          >
            Exportar Excel
          </Button>
          <div className="w-[1px] h-8 bg-slate-100 mx-2 hidden md:block" />
          <Button variant="primary" size="sm" onClick={() => onOpenModal('agencia')} className="bg-[#181c3a] text-white shadow-xl shadow-[#181c3a]/20" leftIcon={<Plus className="w-4 h-4" />}>Nueva Agencia</Button>
        </div>
      </div>
      <div className="bg-white rounded-3xl border-2 border-slate-100 overflow-hidden shadow-sm overflow-x-auto">
        {loading ? (
          <div className="py-20 text-center">
            <Activity className="w-10 h-10 animate-spin mx-auto text-[#2ec4f1] mb-4" />
            <p className="text-[10px] font-black uppercase text-slate-400">Sincronizando con la nube...</p>
          </div>
        ) : agencias.length === 0 ? (
          <div className="py-20 text-center opacity-20">
            <Truck size={64} className="mx-auto mb-4" />
            <p className="text-[10px] font-black uppercase tracking-widest">No hay agencias registradas</p>
          </div>
        ) : (
          <>
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-6 py-4 w-10">
                    <button
                      onClick={onToggleAll}
                      className="text-slate-300 hover:text-[#2ec4f1] transition-colors"
                    >
                      {selectedAgencyIds.size === agencias.length && agencias.length > 0 ? <CheckSquare size={16} className="text-[#2ec4f1]" /> : <Square size={16} />}
                    </button>
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">ID</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Nombre</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Encargado</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Email</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Teléfono</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Dirección</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginatedAgencias.map(ag => (
                  <tr key={ag.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <button
                        onClick={() => onToggleOne(ag.dbId)}
                        className="text-slate-300 hover:text-[#2ec4f1] transition-colors"
                      >
                        {selectedAgencyIds.has(ag.dbId) ? <CheckSquare size={16} className="text-[#2ec4f1]" /> : <Square size={16} />}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <Badge className="bg-[#181c3a] text-[#2ec4f1] border-none font-black text-[9px] px-2 py-0.5 whitespace-nowrap">{ag.id}</Badge>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-black text-[#181c3a] uppercase text-[10px] tracking-tight">{ag.nombre}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-bold text-slate-500 uppercase text-[10px] tracking-widest leading-tight block max-w-[150px]">{ag.encargado}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-bold text-slate-400">{ag.email}</span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-[10px] font-black text-[#181c3a] whitespace-pre-line leading-relaxed">{ag.telefono}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-[9px] font-medium text-slate-400 whitespace-pre-line leading-tight max-w-[200px]">{ag.direccion}</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => onOpenModal('agencia', ag)} className="p-2 text-slate-300 hover:text-[#181c3a] transition-colors"><Edit3 size={14} /></button>
                        <button onClick={() => onDelete('agencia', ag.dbId)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Controles de Paginación */}
            <div className="bg-slate-50/50 p-6 flex flex-col md:flex-row items-center justify-between gap-4 border-t border-slate-100">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Mostrando <span className="text-[#181c3a]">{paginatedAgencias.length}</span> de <span className="text-[#181c3a]">{agencias.length}</span> Agencias
              </div>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-10 h-10 rounded-xl font-black text-xs transition-all ${
                      currentPage === page
                        ? 'bg-[#181c3a] text-white shadow-lg'
                        : 'bg-white text-slate-400 hover:bg-slate-100 border border-slate-100'
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
});
