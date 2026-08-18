import { ValidationException } from '../../errors/Exceptions';
import { BATCH_LIMITS } from '../../constants/batchLimits';

/**
 * Rechaza payloads con arrays demasiado grandes antes de tocar la BD.
 * @throws ValidationException (400) si excede el límite
 */
export function assertBatchLimit(
  ids: readonly unknown[],
  max: number = BATCH_LIMITS.UUID_IN_CLAUSE,
  label = 'ids'
): void {
  if (ids.length > max) {
    throw new ValidationException(
      `Demasiados ${label}: máximo ${max}, recibidos ${ids.length}`
    );
  }
}

/** Valida que cada elemento sea UUID v4 (formato). */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertUuidArray(
  ids: string[],
  label = 'ids',
  max: number = BATCH_LIMITS.UUID_IN_CLAUSE
): void {
  assertBatchLimit(ids, max, label);
  for (const id of ids) {
    if (!UUID_RE.test(id)) {
      throw new ValidationException(`UUID inválido en ${label}: ${id}`);
    }
  }
}
