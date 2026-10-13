import { ValidationException } from '@/shared/errors/Exceptions';
import {
  validatePrediagnostico,
  type ShellClass,
  type Verdict,
} from '@/modules/backoffice/prediagnostico/validatePrediagnostico';
import type { SupabaseClient } from '@supabase/supabase-js';

export type PxEquipmentPrediagnosticoRecord = {
  equipmentId: string;
  shellClass: ShellClass;
  cosmetics: Record<string, string>;
  functionChecks: Record<string, string>;
  verdict: Verdict;
  notes: string;
  updatedByName: string | null;
  updatedAt: string;
};

export async function loadPxEquipmentPrediagnostico(
  supabase: SupabaseClient,
  equipmentId: string
): Promise<PxEquipmentPrediagnosticoRecord | null> {
  const { data, error } = await supabase
    .from('px_equipment_prediagnosticos')
    .select(
      'equipment_id, clase_carcasa, detalles_cosmeticos, funcionamiento, dictamen, observaciones, actualizado_por_nombre, actualizado_en'
    )
    .eq('equipment_id', equipmentId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    equipmentId: String(data.equipment_id),
    shellClass: data.clase_carcasa as ShellClass,
    cosmetics: (data.detalles_cosmeticos as Record<string, string>) || {},
    functionChecks: (data.funcionamiento as Record<string, string>) || {},
    verdict: data.dictamen as Verdict,
    notes: data.observaciones || '',
    updatedByName: data.actualizado_por_nombre,
    updatedAt: String(data.actualizado_en),
  };
}

export async function savePxEquipmentPrediagnosticoBatch(
  supabase: SupabaseClient,
  actor: { userId: string; userName: string },
  equipmentIds: string[],
  input: {
    shellClass: string | null;
    cosmetics: Record<string, string>;
    functionChecks: Record<string, string>;
    verdict: string | null;
    notes: string;
  },
  now: Date = new Date()
): Promise<void> {
  if (equipmentIds.length < 1 || equipmentIds.length > 25) {
    throw new ValidationException('Selecciona entre 1 y 25 equipos');
  }

  const errors = validatePrediagnostico({
    serviceOrderId: equipmentIds[0] || 'px',
    shellClass: input.shellClass,
    cosmetics: input.cosmetics,
    functionChecks: input.functionChecks,
    verdict: input.verdict,
    notes: input.notes,
  });
  if (errors.length > 0) {
    throw new ValidationException(errors[0], errors);
  }

  const stamp = now.toISOString();
  const payload = {
    clase_carcasa: input.shellClass,
    detalles_cosmeticos: input.cosmetics,
    funcionamiento: input.functionChecks,
    dictamen: input.verdict,
    observaciones: input.notes.trim(),
    actualizado_por: actor.userId,
    actualizado_por_nombre: actor.userName,
    actualizado_en: stamp,
  };

  for (const equipmentId of equipmentIds) {
    const existing = await loadPxEquipmentPrediagnostico(supabase, equipmentId);
    if (existing) {
      const { error } = await supabase
        .from('px_equipment_prediagnosticos')
        .update(payload)
        .eq('equipment_id', equipmentId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from('px_equipment_prediagnosticos').insert({
        equipment_id: equipmentId,
        ...payload,
        creado_por: actor.userId,
        creado_por_nombre: actor.userName,
        creado_en: stamp,
      });
      if (error) throw new Error(error.message);
    }
  }
}

export async function listPxEquipmentPrediagnosticoFlags(
  supabase: SupabaseClient,
  equipmentIds: string[]
): Promise<Set<string>> {
  if (equipmentIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('px_equipment_prediagnosticos')
    .select('equipment_id')
    .in('equipment_id', equipmentIds);
  if (error) return new Set();
  return new Set((data || []).map((row) => String(row.equipment_id)));
}
