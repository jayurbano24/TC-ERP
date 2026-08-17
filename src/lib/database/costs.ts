import { ACTIVITY_COST_SELECT } from '@/shared/constants/dbProjections';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export type ActivityCost = {
  id: string;
  name: string;
  cost: number;
  description: string;
  created_at?: string;
  updated_at?: string;
};

export const COST_PO_IVA_RATE = 0.12;

export const COST_PO_STATUSES = [
  'Entregado/Pendiente de Fact.',
  'Pendiente de PO/ en Proceso',
] as const;

export type CostPoStatus = (typeof COST_PO_STATUSES)[number] | string;

export type CostPoLine = {
  id: string;
  po_number: string;
  po_date: string | null;
  sku: string | null;
  description: string;
  technology: string | null;
  action_type: string | null;
  status: CostPoStatus;
  unit_price: number;
  quantity: number;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type CostPoLineInput = {
  id?: string;
  po_number: string;
  po_date?: string | null;
  sku?: string | null;
  description: string;
  technology?: string | null;
  action_type?: string | null;
  status?: CostPoStatus;
  unit_price: number;
  quantity: number;
  notes?: string | null;
};

export function calcPoLineTotals(unitPrice: number, quantity: number, ivaRate = COST_PO_IVA_RATE) {
  const sinIva = Number(unitPrice) * Number(quantity);
  const conIva = sinIva * (1 + ivaRate);
  return {
    totalSinIva: sinIva,
    totalConIva: conIva,
  };
}

const FALLBACK_COSTS: ActivityCost[] = [
  { id: '1', name: 'Recepción', cost: 0.5, description: 'Costo por equipo recepcionado' },
  { id: '2', name: 'Diagnóstico', cost: 1.0, description: 'Costo por revisión técnica' },
  { id: '3', name: 'Limpieza', cost: 0.75, description: 'Costo por limpieza de equipos' },
  { id: '4', name: 'Pruebas', cost: 0.8, description: 'Costo por pruebas' },
  { id: '5', name: 'Reparación', cost: 5.0, description: 'Costo estándar por reparación' },
  { id: '6', name: 'Cosmética', cost: 1.5, description: 'Costo por cosmética' },
  { id: '7', name: 'Empaque', cost: 0.6, description: 'Costo por empaque' },
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
    console.warn('Error consultando activity_costs', err);
    return FALLBACK_COSTS;
  }
}

export async function saveActivityCost(costRecord: ActivityCost) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase no configurado' };

  const dbCost = {
    name: costRecord.name,
    cost: costRecord.cost,
    description: costRecord.description || '',
  };

  try {
    if (costRecord.id && costRecord.id.includes('-')) {
      const { data, error } = await supabase
        .from('activity_costs')
        .update(dbCost)
        .eq('id', costRecord.id)
        .select()
        .single();
      return { data, error };
    }
    const { data, error } = await supabase.from('activity_costs').insert([dbCost]).select().single();
    return { data, error };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteActivityCost(id: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase no configurado' };

  if (!id.includes('-')) {
    return { error: 'No se pueden eliminar los valores por defecto locales.' };
  }

  try {
    const { error } = await supabase.from('activity_costs').delete().eq('id', id);
    return { error };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getCostPoLines(): Promise<{ data: CostPoLine[]; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: [], error: 'Supabase no configurado' };

  const { data, error } = await supabase
    .from('cost_po_lines')
    .select(
      'id, po_number, po_date, sku, description, technology, action_type, status, unit_price, quantity, notes, created_at, updated_at'
    )
    .order('po_date', { ascending: false })
    .order('po_number', { ascending: false });

  if (error) {
    console.warn('getCostPoLines:', error.message);
    return {
      data: [],
      error:
        error.message.includes('does not exist') || error.code === '42P01'
          ? 'Aplique la migración 211_cost_purchase_orders.sql en Supabase.'
          : error.message,
    };
  }

  return {
    data: (data || []).map((row) => ({
      ...row,
      unit_price: Number(row.unit_price) || 0,
      quantity: Number(row.quantity) || 0,
    })),
  };
}

export async function saveCostPoLine(input: CostPoLineInput) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase no configurado' };

  const payload = {
    po_number: String(input.po_number || '').trim(),
    po_date: input.po_date || null,
    sku: input.sku?.trim() || null,
    description: String(input.description || '').trim(),
    technology: input.technology?.trim() || null,
    action_type: input.action_type?.trim() || null,
    status: input.status || 'Pendiente de PO/ en Proceso',
    unit_price: Number(input.unit_price) || 0,
    quantity: Math.max(0, Math.floor(Number(input.quantity) || 0)),
    notes: input.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (!payload.po_number) return { error: 'El número de PO es obligatorio.' };
  if (!payload.description) return { error: 'La descripción es obligatoria.' };

  try {
    if (input.id) {
      const { data, error } = await supabase
        .from('cost_po_lines')
        .update(payload)
        .eq('id', input.id)
        .select()
        .single();
      return { data, error: error?.message };
    }
    const { data, error } = await supabase.from('cost_po_lines').insert([payload]).select().single();
    return { data, error: error?.message };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteCostPoLine(id: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase no configurado' };
  try {
    const { error } = await supabase.from('cost_po_lines').delete().eq('id', id);
    return { error: error?.message };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Inserta en lote líneas PO (import Excel). */
export async function importCostPoLines(lines: CostPoLineInput[]): Promise<{
  inserted: number;
  skipped: number;
  error?: string;
}> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { inserted: 0, skipped: 0, error: 'Supabase no configurado' };

  const rows = lines
    .map((input) => ({
      po_number: String(input.po_number || '').trim(),
      po_date: input.po_date || null,
      sku: input.sku?.trim() || null,
      description: String(input.description || '').trim(),
      technology: input.technology?.trim() || null,
      action_type: input.action_type?.trim() || null,
      status: input.status || 'Pendiente de PO/ en Proceso',
      unit_price: Number(input.unit_price) || 0,
      quantity: Math.max(0, Math.floor(Number(input.quantity) || 0)),
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    }))
    .filter((r) => r.po_number && (r.description || r.sku));

  const skipped = lines.length - rows.length;
  if (rows.length === 0) {
    return { inserted: 0, skipped, error: 'No hay filas válidas (PO + Modelo/Descripción).' };
  }

  const chunkSize = 100;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { data, error } = await supabase.from('cost_po_lines').insert(chunk).select('id');
    if (error) {
      return {
        inserted,
        skipped,
        error: error.message,
      };
    }
    inserted += data?.length || chunk.length;
  }

  return { inserted, skipped };
}
