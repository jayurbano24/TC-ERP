"use client";

import { useState, useEffect } from 'react';
import { Card, Button, Spinner } from '@/components/ui';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Plus, Trash2, Edit2 } from 'lucide-react';

export default function CatalogosTab() {
  const [activeCatalog, setActiveCatalog] = useState<'departments' | 'positions' | 'employeeTypes'>('departments');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newItemName, setNewItemName] = useState('');

  useEffect(() => {
    fetchData();
  }, [activeCatalog]);

  const fetchData = async () => {
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      let table = '';
      if (activeCatalog === 'departments') table = 'hr_departments';
      if (activeCatalog === 'positions') table = 'hr_positions';
      if (activeCatalog === 'employeeTypes') table = 'hr_employee_types';

      const { data: resData } = await supabase.from(table).select('*').order('name');
      if (resData) setData(resData);
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newItemName.trim()) return;
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      let table = '';
      if (activeCatalog === 'departments') table = 'hr_departments';
      if (activeCatalog === 'positions') table = 'hr_positions';
      if (activeCatalog === 'employeeTypes') table = 'hr_employee_types';

      await supabase.from(table).insert({ name: newItemName.trim() });
      setNewItemName('');
      fetchData();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este registro?')) return;
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      let table = '';
      if (activeCatalog === 'departments') table = 'hr_departments';
      if (activeCatalog === 'positions') table = 'hr_positions';
      if (activeCatalog === 'employeeTypes') table = 'hr_employee_types';

      await supabase.from(table).delete().eq('id', id);
      fetchData();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Catálogos de Organización</h2>
        <p className="text-sm text-slate-500">Administra los departamentos, cargos y clasificaciones de tu personal.</p>
      </div>

      <div className="flex gap-4 border-b border-slate-200">
        <button 
          className={`py-2 px-4 font-bold text-sm ${activeCatalog === 'departments' ? 'border-b-2 border-[#2ec4f1] text-[#2ec4f1]' : 'text-slate-500 hover:text-slate-700'}`}
          onClick={() => setActiveCatalog('departments')}
        >
          Departamentos
        </button>
        <button 
          className={`py-2 px-4 font-bold text-sm ${activeCatalog === 'positions' ? 'border-b-2 border-[#2ec4f1] text-[#2ec4f1]' : 'text-slate-500 hover:text-slate-700'}`}
          onClick={() => setActiveCatalog('positions')}
        >
          Cargos / Puestos
        </button>
        <button 
          className={`py-2 px-4 font-bold text-sm ${activeCatalog === 'employeeTypes' ? 'border-b-2 border-[#2ec4f1] text-[#2ec4f1]' : 'text-slate-500 hover:text-slate-700'}`}
          onClick={() => setActiveCatalog('employeeTypes')}
        >
          Categorías de Empleado
        </button>
      </div>

      <Card className="max-w-2xl">
        <div className="flex gap-3 mb-6">
          <input 
            type="text" 
            placeholder="Añadir nuevo..." 
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            className="flex-1 h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-[#2ec4f1] font-medium text-sm"
          />
          <Button variant="primary" onClick={handleCreate} disabled={!newItemName.trim() || loading}>
            <Plus size={16} className="mr-2"/> Crear
          </Button>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading && data.length === 0 ? (
                 <tr><td className="p-4 text-center text-slate-400"><Spinner size="md" className="mx-auto"/></td></tr>
              ) : data.length === 0 ? (
                 <tr><td className="p-4 text-center text-slate-400 font-medium">No hay registros</td></tr>
              ) : (
                data.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-700">{item.name}</td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)} className="text-rose-500 hover:bg-rose-50">
                        <Trash2 size={16} />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
