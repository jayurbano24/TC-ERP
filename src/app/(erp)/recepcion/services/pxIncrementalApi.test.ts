import { describe, expect, it } from 'vitest';
import {
  DuplicateOpenOsError,
  isPxReceptionResumable,
  PX_INCREMENTAL_ACTIVE_STATUS,
  PX_INCREMENTAL_FINALIZING_STATUS,
} from './pxIncrementalApi';

describe('isPxReceptionResumable', () => {
  it('permite continuar una recepción en captura', () => {
    expect(isPxReceptionResumable(PX_INCREMENTAL_ACTIVE_STATUS)).toBe(true);
  });

  it('mantiene visible una finalización interrumpida', () => {
    expect(isPxReceptionResumable(PX_INCREMENTAL_FINALIZING_STATUS)).toBe(true);
    expect(isPxReceptionResumable(' finalizando ')).toBe(true);
  });

  it('no reabre recepciones ya clasificadas', () => {
    expect(isPxReceptionResumable('CLASIFICADA')).toBe(false);
    expect(isPxReceptionResumable(null)).toBe(false);
  });
});

describe('DuplicateOpenOsError', () => {
  it('conserva el contrato explícito y no convierte el rechazo en un retry genérico', () => {
    const error = new DuplicateOpenOsError({
      success: false,
      error: 'Serie duplicada',
      errorCode: 'DUPLICATE_OPEN_OS',
      error_code: 'DUPLICATE_OPEN_OS',
      serial: 'ABC123456',
      existing_os_id: 'os-id',
      existing_os_number: 'TC-12345',
      existing_os_status: 'INGRESADO',
      existing_source: 'px',
      rejected_count: 1,
    });

    expect(error.name).toBe('DuplicateOpenOsError');
    expect(error.details.errorCode).toBe('DUPLICATE_OPEN_OS');
    expect(error.details.serial).toBe('ABC123456');
    expect(error.details.existing_os_number).toBe('TC-12345');
  });
});
