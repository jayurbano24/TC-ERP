'use client';

import { memo } from 'react';
import { Button } from '@/components/ui';
import { Plus, Activity, Edit3, Trash2 } from 'lucide-react';

export type CatalogColumn = {
  header: string;
  align?: 'left' | 'right';
  cell: (item: any) => React.ReactNode;
};

type Props = {
  /** modalType usado para alta/edición/eliminación */
  type: string;
  title: string;
  subtitle: string;
  addLabel: string;
  icon: React.ReactNode;
  iconWrapClassName: string;
  theme: 'light' | 'dark';
  data: any[];
  columns: CatalogColumn[];
  /** campo usado como key de fila y como id para editar/eliminar (default 'id') */
  idField?: string;
  loading?: boolean;
  emptyIcon?: React.ReactNode;
  emptyText: string;
  onOpenModal: (type: string, item?: any) => void;
  onDelete: (type: string, id: string) => void;
};

/**
 * C1: vista de catálogo genérica (header + tabla) reutilizada por las vistas
 * simples de configuracion (marcas, px_providers, reparaciones, transportes).
 * La columna de Acciones (editar/eliminar) se agrega automáticamente.
 */
export const CatalogTableView = memo(function CatalogTableView({
  type,
  title,
  subtitle,
  addLabel,
  icon,
  iconWrapClassName,
  theme,
  data,
  columns,
  idField = 'id',
  loading,
  emptyIcon,
  emptyText,
  onOpenModal,
  onDelete,
}: Props) {
  const isDark = theme === 'dark';

  return (
    <div className="animate-rise-in space-y-6">
      <div
        className={
          isDark
            ? 'flex justify-between items-center bg-[#181c3a] p-8 rounded-3xl shadow-xl'
            : 'flex justify-between items-center bg-white p-8 rounded-3xl border-2 border-slate-100 shadow-sm'
        }
      >
        <div className={`flex items-center gap-4${isDark ? ' text-white' : ''}`}>
          <div className={iconWrapClassName}>{icon}</div>
          <div>
            <h3 className={`text-xl font-black${isDark ? '' : ' text-[#181c3a]'}`}>{title}</h3>
            <p className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-white/40' : 'text-slate-400'}`}>{subtitle}</p>
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => onOpenModal(type)}
          className={isDark ? 'bg-[#2ec4f1] text-[#181c3a]' : 'bg-[#181c3a] text-white shadow-xl shadow-[#181c3a]/20'}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          {addLabel}
        </Button>
      </div>

      <div className="bg-white rounded-3xl border-2 border-slate-100 overflow-hidden shadow-sm overflow-x-auto">
        {loading ? (
          <div className="py-20 text-center">
            <Activity className="w-10 h-10 animate-spin mx-auto text-[#2ec4f1] mb-4" />
            <p className="text-[10px] font-black uppercase text-slate-400">Sincronizando con la nube...</p>
          </div>
        ) : data.length === 0 ? (
          <div className="py-20 text-center opacity-20">
            {emptyIcon}
            <p className="text-[10px] font-black uppercase tracking-widest">{emptyText}</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                {columns.map((col, i) => (
                  <th
                    key={i}
                    className={`px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400${col.align === 'right' ? ' text-right' : ''}`}
                  >
                    {col.header}
                  </th>
                ))}
                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.map(item => (
                <tr key={item[idField]} className="hover:bg-slate-50 transition-colors">
                  {columns.map((col, i) => (
                    <td key={i} className={`px-8 py-5${col.align === 'right' ? ' text-right' : ''}`}>
                      {col.cell(item)}
                    </td>
                  ))}
                  <td className="px-8 py-5 text-right">
                    <div className="flex justify-end gap-2">
                      {isDark ? (
                        <>
                          <button onClick={() => onOpenModal(type, item)} className="p-3 bg-slate-50 text-slate-400 hover:text-[#181c3a] hover:bg-slate-100 rounded-xl transition-all"><Edit3 size={16} /></button>
                          <button onClick={() => onDelete(type, item[idField])} className="p-3 bg-rose-50 text-rose-300 hover:text-rose-500 hover:bg-rose-100 rounded-xl transition-all"><Trash2 size={16} /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => onOpenModal(type, item)} className="p-2 text-slate-300 hover:text-[#181c3a]"><Edit3 size={16} /></button>
                          <button onClick={() => onDelete(type, item[idField])} className="p-2 text-slate-300 hover:text-rose-500"><Trash2 size={16} /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
});
