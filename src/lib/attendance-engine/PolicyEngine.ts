import type { PoliciesLike, ShiftLike } from './types';

export function readPolicyMargins(policies: PoliciesLike | null | undefined, shift?: ShiftLike | null) {
  return {
    tolIngreso: policies?.tolerancia_ingreso_min ?? 10,
    graciaSalidaAnt: policies?.tolerancia_salida_min ?? 5,
    graciaRecesos: policies?.gracia_recesos_min ?? policies?.max_exceso_receso_min ?? 5,
    duracionDesayuno: shift?.duracion_desayuno_override ?? policies?.duracion_desayuno_min ?? 15,
    duracionAlmuerzo: shift?.duracion_almuerzo_override ?? policies?.duracion_almuerzo_min ?? 60,
    pedirJustifReceso: policies?.regla_solicitar_justificacion_receso !== false,
    calcularHorasExtra: policies?.regla_calcular_horas_extra === true,
    permitirDobleMarcaje: policies?.regla_doble_marcaje === true,
    permitirMarcajeEspecial: policies?.permitir_marcaje_especial !== false,
    permitirDesayunoTarde: policies?.regla_permitir_desayuno_tarde === true,
    permitirAlmuerzoTarde: policies?.regla_permitir_almuerzo_tarde === true,
  };
}
