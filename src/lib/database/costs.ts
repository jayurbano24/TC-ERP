import { ACTIVITY_COST_SELECT } from '@/shared/constants/dbProjections';
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type ActivityCost = {
  id: string;
  name: string;
  cost: number;
  description: string;
  created_at?: string;
  updated_at?: string;
};

// Valores por defecto si la base de datos aún no tiene la tabla
const FALLBACK_COSTS: ActivityCost[] = [
  { id: '1', name: 'Recepción', cost: 0.50, description: 'Costo por equipo recepcionado' },
  { id: '2', name: 'Diagnóstico', cost: 1.00, description: 'Costo por revisión técnica' },
  { id: '3', name: 'Limpieza', cost: 0.75, description: 'Costo por limpieza de equipos' },
  { id: '4', name: 'Pruebas', cost: 0.80, description: 'Costo por pruebas' },
  { id: '5', name: 'Reparación', cost: 5.00, description: 'Costo estándar por reparación' },
  { id: '6', name: 'Cosmética', cost: 1.50, description: 'Costo por cosmética' },
  { id: '7', name: 'Empaque', cost: 0.60, description: 'Costo por empaque' },
];

export async function getActivityCosts(): Promise<ActivityCost[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return FALLBACK_COSTS;

  try {
    const { data, error } = await supabase.from('activity_costs').select(ACTIVITY_COST_SELECT).order('name');
    if (error) {
      console.warn("Tabla 'activity_costs' podría no existir aún. Usando valores por defecto.", error.message);
      return FALLBACK_COSTS;
    }
    return data && data.length > 0 ? data : FALLBACK_COSTS;
  } catch (err) {
    console.warn("Error consultando activity_costs", err);
    return FALLBACK_COSTS;
  }
}

export async function saveActivityCost(costRecord: ActivityCost) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase no configurado" };

  const dbCost = {
    name: costRecord.name,
    cost: costRecord.cost,
    description: costRecord.description || ''
  };

  try {
    if (costRecord.id && costRecord.id.includes('-')) {
      const { data, error } = await supabase.from('activity_costs').update(dbCost).eq('id', costRecord.id).select().single();
      return { data, error };
    } else {
      const { data, error } = await supabase.from('activity_costs').insert([dbCost]).select().single();
      return { data, error };
    }
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function deleteActivityCost(id: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase no configurado" };
  
  if (!id.includes('-')) {
    return { error: "No se pueden eliminar los valores por defecto locales." };
  }

  try {
    const { error } = await supabase.from('activity_costs').delete().eq('id', id);
    return { error };
  } catch (err: any) {
    return { error: err.message };
  }
}
