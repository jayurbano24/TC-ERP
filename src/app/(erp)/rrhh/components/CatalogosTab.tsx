"use client";

import { useState, useEffect } from 'react';
import { Card, Button, Spinner, confirmDialog } from '@/components/ui';
import { HR_DEPARTMENT_SELECT, HR_EMPLOYEE_TYPE_SELECT, HR_POSITION_SELECT } from '@/shared/constants/dbProjections';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { erpInputClass } from '@/lib/design/tokens';
import { Plus, Trash2 } from 'lucide-react';

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

      const catalogSelect =
        activeCatalog === 'departments'
          ? HR_DEPARTMENT_SELECT
          : activeCatalog === 'positions'
            ? HR_POSITION_SELECT
            : HR_EMPLOYEE_TYPE_SELECT;

      const { data: resData } = await supabase.from(table).select(catalogSelect).order('name');
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
    const ok = await confirmDialog({ title: 'Eliminar registro', message: '¿Estás seguro de eliminar este registro?', tone: 'error', confirmText: 'Eliminar' });
    if (!ok) return;
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

  const catalogTabs = [
    { id: 'departments' as const, label: 'Departamentos' },
    { id: 'positions' as const, label: 'Cargos / Puestos' },
    { id: 'employeeTypes' as const, label: 'Categorías de Empleado' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--foreground)]">Catálogos de Organización</h2>
        <p className="text-sm text-[var(--muted)]">Administra los departamentos, cargos y clasificaciones de tu personal.</p>
      </div>

      <div className="flex gap-4 border-b border-[var(--border)]">
        {catalogTabs.map((tab) => (
          <button
            key={tab.id}
            className={`py-2 px-4 font-bold text-sm transition-colors ${
              activeCatalog === tab.id
                ? 'border-b-2 border-[var(--accent)] text-[var(--accent)]'
                : 'text-[var(--muted)] hover:text-[var(--foreground)]'
            }`}
            onClick={() => setActiveCatalog(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card className="max-w-2xl border border-[var(--border)]">
        <div className="flex gap-3 mb-6">
          <input 
            type="text" 
            placeholder="Añadir nuevo..." 
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            className={`${erpInputClass} flex-1 h-10`}
          />
          <Button variant="primary" onClick={handleCreate} disabled={!newItemName.trim() || loading}>
            <Plus size={16} className="mr-2"/> Crear
          </Button>
        </div>

        <div className="border border-[var(--border)] rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-[var(--border)] bg-[var(--surface)]">
              {loading && data.length === 0 ? (
                 <tr><td className="p-4 text-center text-[var(--muted)]"><Spinner size="md" className="mx-auto"/></td></tr>
              ) : data.length === 0 ? (
                 <tr><td className="p-4 text-center text-[var(--muted)] font-medium">No hay registros</td></tr>
              ) : (
                data.map(item => (
                  <tr key={item.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                    <td className="px-6 py-4 font-bold text-[var(--foreground)]">{item.name}</td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)} className="text-[var(--danger)] hover:bg-[var(--danger)]/10 p-2">
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
