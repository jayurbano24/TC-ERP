"use client";

import { useState, useEffect } from 'react';
import { Card, Button, Spinner, confirmDialog, notify } from '@/components/ui';
import {
  COMPANY_SHIFT_SELECT,
  HR_DEPARTMENT_SELECT,
  HR_EMPLOYEE_TYPE_SELECT,
  HR_POSITION_SELECT,
} from '@/shared/constants/dbProjections';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { erpInputClass } from '@/lib/design/tokens';
import { Plus, Trash2 } from 'lucide-react';

type CatalogId = 'departments' | 'positions' | 'employeeTypes' | 'shifts';

/** Lun–Vie 08:00–17:00 (claves 1–5; formato motor de asistencia). */
const DEFAULT_WEEKLY_SCHEDULE = {
  '1': { entrada: '08:00', salida: '17:00' },
  '2': { entrada: '08:00', salida: '17:00' },
  '3': { entrada: '08:00', salida: '17:00' },
  '4': { entrada: '08:00', salida: '17:00' },
  '5': { entrada: '08:00', salida: '17:00' },
};

function catalogTable(id: CatalogId): string {
  if (id === 'departments') return 'hr_departments';
  if (id === 'positions') return 'hr_positions';
  if (id === 'employeeTypes') return 'hr_employee_types';
  return 'company_shifts';
}

function catalogSelect(id: CatalogId): string {
  if (id === 'departments') return HR_DEPARTMENT_SELECT;
  if (id === 'positions') return HR_POSITION_SELECT;
  if (id === 'employeeTypes') return HR_EMPLOYEE_TYPE_SELECT;
  return COMPANY_SHIFT_SELECT;
}

function shiftSummary(item: {
  weekly_schedule?: Record<string, { entrada?: string; salida?: string } | null>;
}): string {
  const mon = item.weekly_schedule?.['1'];
  if (mon?.entrada && mon?.salida) return `${mon.entrada} – ${mon.salida} (Lun–Vie)`;
  return 'Horario semanal';
}

export default function CatalogosTab() {
  const [activeCatalog, setActiveCatalog] = useState<CatalogId>('departments');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newItemName, setNewItemName] = useState('');

  useEffect(() => {
    void fetchData();
  }, [activeCatalog]);

  const fetchData = async () => {
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { data: resData, error } = await supabase
        .from(catalogTable(activeCatalog))
        .select(catalogSelect(activeCatalog))
        .order('name');
      if (error) {
        console.error('[rrhh/catalogos]', error.message);
        notify.error('No se pudo cargar el catálogo');
        setData([]);
      } else {
        setData(resData || []);
      }
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newItemName.trim()) return;
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const payload =
        activeCatalog === 'shifts'
          ? {
              name: newItemName.trim(),
              weekly_schedule: DEFAULT_WEEKLY_SCHEDULE,
              ventana_desayuno_inicio: '08:00',
              ventana_desayuno_fin: '11:00',
              ventana_almuerzo_inicio: '12:00',
              ventana_almuerzo_fin: '15:00',
            }
          : { name: newItemName.trim() };

      const { error } = await supabase.from(catalogTable(activeCatalog)).insert(payload);
      if (error) {
        notify.error(error.message || 'No se pudo crear el registro');
      } else {
        setNewItemName('');
        await fetchData();
      }
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: 'Eliminar registro',
      message: '¿Estás seguro de eliminar este registro?',
      tone: 'error',
      confirmText: 'Eliminar',
    });
    if (!ok) return;
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { error } = await supabase.from(catalogTable(activeCatalog)).delete().eq('id', id);
      if (error) {
        notify.error(error.message || 'No se pudo eliminar');
      } else {
        await fetchData();
      }
    }
    setLoading(false);
  };

  const catalogTabs: { id: CatalogId; label: string }[] = [
    { id: 'departments', label: 'Departamentos' },
    { id: 'positions', label: 'Cargos / Puestos' },
    { id: 'employeeTypes', label: 'Categorías de Empleado' },
    { id: 'shifts', label: 'Horarios' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--foreground)]">Catálogos de Organización</h2>
        <p className="text-sm text-[var(--muted)]">
          Administra departamentos, cargos, categorías y horarios asignables al personal.
        </p>
      </div>

      <div className="flex flex-wrap gap-4 border-b border-[var(--border)]">
        {catalogTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
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
        {activeCatalog === 'shifts' && (
          <p className="mb-4 text-xs text-[var(--muted)]">
            Al crear un horario se asigna Lun–Vie 08:00–17:00 por defecto. Puedes ajustar detalle
            después según política de asistencia.
          </p>
        )}
        <div className="mb-6 flex gap-3">
          <input
            type="text"
            placeholder={
              activeCatalog === 'shifts' ? 'Nombre del horario (ej. Turno Diurno)' : 'Añadir nuevo...'
            }
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            className={`${erpInputClass} h-10 flex-1`}
          />
          <Button variant="primary" onClick={() => void handleCreate()} disabled={!newItemName.trim() || loading}>
            <Plus size={16} className="mr-2" /> Crear
          </Button>
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-[var(--border)] bg-[var(--surface)]">
              {loading && data.length === 0 ? (
                <tr>
                  <td className="p-4 text-center text-[var(--muted)]">
                    <Spinner size="md" className="mx-auto" />
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td className="p-4 text-center font-medium text-[var(--muted)]">No hay registros</td>
                </tr>
              ) : (
                data.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-[var(--surface-hover)]">
                    <td className="px-6 py-4 font-bold text-[var(--foreground)]">
                      {item.name}
                      {activeCatalog === 'shifts' && (
                        <span className="mt-0.5 block text-[10px] font-semibold text-[var(--muted)]">
                          {shiftSummary(item)}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleDelete(item.id)}
                        className="p-2 text-[var(--danger)] hover:bg-[var(--danger)]/10"
                      >
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
