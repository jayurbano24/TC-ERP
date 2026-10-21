import { humanizeClassifyEquipmentError } from '../../client/humanizeClassifyError';
import type {
  ClassifyBatchParams,
  ClassifyBatchResult,
  ClassifyUnitSkipError,
} from '../../domain/types/equipment-unit.types';

export function formatSkippedClassifyError(err: ClassifyUnitSkipError): string {
  const serial = String(err.main_serial || err.serial || '').trim();
  const detail = String(err.error || '').trim();
  if (detail) {
    const human = humanizeClassifyEquipmentError(
      serial && !/serie duplicada/i.test(detail) ? `Serie duplicada: ${serial}. ${detail}` : detail
    );
    return human.description;
  }
  if (serial) {
    return humanizeClassifyEquipmentError(
      `Serie duplicada: ${serial} ya está registrada con una orden de servicio activa.`
    ).description;
  }
  return humanizeClassifyEquipmentError('Serie duplicada: una serie del lote ya está registrada.').description;
}

export function mergeClassifyBatchResults(
  params: ClassifyBatchParams,
  parts: ClassifyBatchResult[],
): ClassifyBatchResult {
  const serviceOrders: unknown[] = [];
  const skippedErrors: ClassifyUnitSkipError[] = [];
  let unitsProcessed = 0;
  let unitsSkipped = 0;
  const fatalErrors: string[] = [];

  for (const part of parts) {
    if (part.data?.length) {
      serviceOrders.push(...part.data);
    }
    if (part.skippedErrors?.length) {
      skippedErrors.push(...part.skippedErrors);
    }
    unitsProcessed += Number(part.unitsProcessed ?? part.data?.length ?? 0);
    unitsSkipped += Number(part.unitsSkipped ?? part.skippedErrors?.length ?? 0);
    if (part.error) {
      fatalErrors.push(part.error);
    }
  }

  const partialError =
    skippedErrors.length > 0
      ? formatSkippedClassifyError(skippedErrors[0])
      : unitsSkipped > 0 && serviceOrders.length < params.units.length
        ? `Serie duplicada: ${params.units.length - serviceOrders.length} equipo(s) no se pudieron ingresar. Revise duplicados en el lote o series ya registradas en TC.`
        : fatalErrors.length > 0 && serviceOrders.length === 0
          ? fatalErrors[0]
          : fatalErrors.length > 0
            ? fatalErrors[fatalErrors.length - 1]
            : undefined;

  return {
    data: serviceOrders.length > 0 ? serviceOrders : undefined,
    error: partialError,
    skippedErrors: skippedErrors.length > 0 ? skippedErrors : undefined,
    unitsProcessed,
    unitsSkipped,
  };
}
