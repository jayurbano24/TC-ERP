import { readPolicyMargins } from './PolicyEngine';
import { getDaySchedule, isDiaExtra, localDateTimeFromHm, minutesOfDay } from './ScheduleEngine';
import type { PoliciesLike, PunchEvent, PunchMetrics, ShiftLike, TimeLogLike } from './types';

const emptyMetrics = (esDiaExtra: boolean): PunchMetrics => ({
  minRetraso: 0,
  minExcesoBreak: 0,
  minExcesoAlm: 0,
  minSalidaAnt: 0,
  minExtra: 0,
  tardanza_segundos: 0,
  exceso_desayuno_segundos: 0,
  exceso_almuerzo_segundos: 0,
  salida_anticipada_segundos: 0,
  horas_extra_segundos: 0,
  estado_marcacion: 'NORMAL',
  esDiaExtra,
});

export function calculatePunchMetrics(params: {
  evento: PunchEvent;
  shift: ShiftLike | null | undefined;
  logs: TimeLogLike[] | null | undefined;
  policies: PoliciesLike | null | undefined;
  now?: Date;
}): PunchMetrics {
  const now = params.now ?? new Date();
  const { shift, logs, policies, evento } = params;
  const margins = readPolicyMargins(policies, shift);
  const daySchedule = getDaySchedule(shift, now);
  const esDiaExtraFlag = isDiaExtra(shift, now);
  const metrics = emptyMetrics(esDiaExtraFlag);
  const nowTime = now.getTime();
  const currentMins = minutesOfDay(now);

  if (evento === 'INGRESO' || evento === 'INGRESO_ESPECIAL') {
    if (daySchedule?.entrada) {
      const scheduledTime = localDateTimeFromHm(now, daySchedule.entrada).getTime();
      const [eh, em] = daySchedule.entrada.split(':').map(Number);
      const shiftEntradaMins = eh * 60 + em;
      if (currentMins > shiftEntradaMins + margins.tolIngreso) {
        metrics.minRetraso = currentMins - shiftEntradaMins;
      }
      if (nowTime > scheduledTime + margins.tolIngreso * 60 * 1000) {
        metrics.tardanza_segundos = Math.floor((nowTime - scheduledTime) / 1000);
        metrics.estado_marcacion = 'TARDE';
      }
    }
    return metrics;
  }

  if (evento === 'DESAYUNO_FIN') {
    const salidaRef = logs?.find(
      (l) =>
        l.evento_detectado === 'DESAYUNO_INICIO' || l.evento_detectado === 'SALIDA_REFACCION',
    );
    if (salidaRef?.timestamp) {
      const breakStart = new Date(salidaRef.timestamp).getTime();
      const diffMins = Math.floor((nowTime - breakStart) / 60000);
      if (diffMins > margins.duracionDesayuno + margins.graciaRecesos) {
        metrics.minExcesoBreak = diffMins - margins.duracionDesayuno;
      }
      const durationSeg = Math.floor((nowTime - breakStart) / 1000);
      const limitSeg = (margins.duracionDesayuno + margins.graciaRecesos) * 60;
      if (durationSeg > limitSeg) {
        metrics.exceso_desayuno_segundos = durationSeg - margins.duracionDesayuno * 60;
        metrics.estado_marcacion = 'EXCESO_DESAYUNO';
      }
    }
    return metrics;
  }

  if (evento === 'ALMUERZO_FIN') {
    const salidaAlm = logs?.find(
      (l) =>
        l.evento_detectado === 'ALMUERZO_INICIO' || l.evento_detectado === 'SALIDA_ALMUERZO',
    );
    if (salidaAlm?.timestamp) {
      const almStart = new Date(salidaAlm.timestamp).getTime();
      const diffMins = Math.floor((nowTime - almStart) / 60000);
      if (diffMins > margins.duracionAlmuerzo + margins.graciaRecesos) {
        metrics.minExcesoAlm = diffMins - margins.duracionAlmuerzo;
      }
      const durationSeg = Math.floor((nowTime - almStart) / 1000);
      const limitSeg = (margins.duracionAlmuerzo + margins.graciaRecesos) * 60;
      if (durationSeg > limitSeg) {
        metrics.exceso_almuerzo_segundos = durationSeg - margins.duracionAlmuerzo * 60;
        metrics.estado_marcacion = 'EXCESO_ALMUERZO';
      }
    }
    return metrics;
  }

  if (evento === 'SALIDA_FINAL') {
    if (esDiaExtraFlag) {
      const ingresoLog = logs?.find(
        (l) => l.evento_detectado === 'INGRESO' || l.evento_detectado === 'INGRESO_ESPECIAL',
      );
      if (ingresoLog?.timestamp) {
        const ingresoTime = new Date(ingresoLog.timestamp).getTime();
        metrics.minExtra = Math.floor((nowTime - ingresoTime) / 60000);
        metrics.horas_extra_segundos = Math.floor((nowTime - ingresoTime) / 1000);
        metrics.estado_marcacion = 'EXTRA';
      }
      return metrics;
    }
    if (daySchedule?.salida) {
      const scheduledTime = localDateTimeFromHm(now, daySchedule.salida).getTime();
      const [h, m] = daySchedule.salida.split(':').map(Number);
      const shiftSalidaMins = h * 60 + m;
      const earliestWithoutJustif = scheduledTime - margins.graciaSalidaAnt * 60 * 1000;
      if (nowTime < earliestWithoutJustif) {
        metrics.minSalidaAnt = shiftSalidaMins - currentMins;
        metrics.salida_anticipada_segundos = Math.floor((scheduledTime - nowTime) / 1000);
        metrics.estado_marcacion = 'TEMPRANO';
      } else if (nowTime > scheduledTime && margins.calcularHorasExtra) {
        metrics.minExtra = currentMins - shiftSalidaMins;
        metrics.horas_extra_segundos = Math.floor((nowTime - scheduledTime) / 1000);
        metrics.estado_marcacion = 'EXTRA';
      }
    }
  }

  return metrics;
}
