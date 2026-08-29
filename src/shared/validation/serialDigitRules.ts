/**
 * Reglas S/D de modelo/tecnología: series_count + digits_per_series.
 *
 * series_count     = cantidad de slots/campos SN (S1…S4)
 * digits_per_series[i] = longitud EXACTA de caracteres del Serial en el slot i
 *
 * Política: validar, NUNCA truncar / pad / substring para forzar coincidencia.
 */

export type SerialLengthReason =
  | 'ok'
  | 'too_short'
  | 'too_long'
  | 'empty'
  | 'config_missing';

export type SerialLengthResult = {
  valid: boolean;
  expected: number | null;
  received: number;
  reason: SerialLengthReason;
  /** Serial tras quitar solo terminadores de scanner (sin truncar longitud). */
  serial: string;
  title: string;
  message: string;
};

export function normalizeDigitsPerSeries(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.floor(n));
}

export function resolveModelDigitRules(model: {
  series_count?: number | null;
  seriesCount?: number | null;
  digits_per_series?: unknown;
  digitsPerSeries?: unknown;
} | null | undefined): { seriesCount: number; digitsPerSeries: number[] } {
  const digitsPerSeries = normalizeDigitsPerSeries(
    model?.digits_per_series ?? model?.digitsPerSeries
  );
  const rawCount = Number(model?.series_count ?? model?.seriesCount);
  const seriesCount =
    Number.isFinite(rawCount) && rawCount > 0
      ? Math.min(4, Math.floor(rawCount))
      : Math.max(1, digitsPerSeries.length || 1);
  return { seriesCount, digitsPerSeries };
}

/** True si el modelo tiene al menos una longitud de SN configurada. */
export function modelHasDigitRules(
  model: {
    digits_per_series?: unknown;
    digitsPerSeries?: unknown;
  } | null | undefined
): boolean {
  return normalizeDigitsPerSeries(model?.digits_per_series ?? model?.digitsPerSeries).length > 0;
}

/**
 * Quita solo terminadores técnicos del scanner (CR/LF/NUL y controles de fin).
 * NO elimina espacios ni caracteres legítimos del Serial.
 */
export function stripScannerTerminators(raw: string): string {
  return String(raw ?? '')
    .replace(/[\r\n\0]+/g, '')
    .replace(/[\u001c\u001d\u001e]/g, '');
}

/**
 * Prepara el valor recibido para validación / persistencia de pistoleo.
 * Uppercase sin trim de espacios internos o de borde (evita alterar el SN).
 */
export function prepareScannedSerial(raw: string): string {
  return stripScannerTerminators(raw).toUpperCase();
}

/** Dígitos esperados para el slot S1=0, S2=1, … Si no hay regla, null. */
export function getExpectedDigitsForSlot(
  digitsPerSeries: number[] | null | undefined,
  slotIndex: number
): number | null {
  const digits = normalizeDigitsPerSeries(digitsPerSeries);
  if (!digits.length) return null;
  if (slotIndex < 0) return null;
  return digits[slotIndex] ?? digits[digits.length - 1] ?? null;
}

/**
 * @deprecated No usar en flujos de pistoleo. Truncar un SN largo lo vuelve
 * aparentemente válido. Preferir validateSerialLength.
 */
export function clampSerialToMaxDigits(value: string, maxDigits: number | null | undefined): string {
  if (maxDigits == null || maxDigits <= 0) return value;
  return value.slice(0, maxDigits);
}

function buildLengthMessages(
  reason: SerialLengthReason,
  expected: number | null,
  received: number
): { title: string; message: string } {
  if (reason === 'config_missing') {
    return {
      title: 'Configuración incompleta',
      message:
        'Este modelo no tiene definida la longitud del Serial. Configure "Dígitos Serie N" antes de continuar.',
    };
  }
  if (reason === 'empty') {
    return {
      title: 'Serial vacío',
      message: 'Ingrese o pistolee un número de serie.',
    };
  }
  if (reason === 'too_short' && expected != null) {
    return {
      title: 'Serial incompleto',
      message: `Este modelo requiere ${expected} caracteres. Se recibieron ${received} caracteres. Verifique el código y vuelva a pistolear.`,
    };
  }
  if (reason === 'too_long' && expected != null) {
    return {
      title: 'Longitud incorrecta',
      message: `Este modelo requiere ${expected} caracteres. Se recibieron ${received} caracteres. El Serial no será truncado. Verifique el código y vuelva a pistolear.`,
    };
  }
  return { title: '', message: '' };
}

/**
 * Helper central: compara longitud exacta vs digits_per_series[i].
 * Nunca modifica el serial para forzar coincidencia.
 */
export function validateSerialLength(
  rawSerial: string,
  expectedLength: number | null | undefined
): SerialLengthResult {
  const serial = prepareScannedSerial(rawSerial);
  const received = serial.length;

  if (expectedLength == null || !Number.isFinite(expectedLength) || expectedLength <= 0) {
    const { title, message } = buildLengthMessages('config_missing', null, received);
    return {
      valid: false,
      expected: null,
      received,
      reason: 'config_missing',
      serial,
      title,
      message,
    };
  }

  const expected = Math.floor(expectedLength);

  if (received === 0) {
    const { title, message } = buildLengthMessages('empty', expected, received);
    return {
      valid: false,
      expected,
      received,
      reason: 'empty',
      serial,
      title,
      message,
    };
  }

  if (received === expected) {
    return {
      valid: true,
      expected,
      received,
      reason: 'ok',
      serial,
      title: '',
      message: '',
    };
  }

  const reason: SerialLengthReason = received < expected ? 'too_short' : 'too_long';
  const { title, message } = buildLengthMessages(reason, expected, received);
  return {
    valid: false,
    expected,
    received,
    reason,
    serial,
    title,
    message,
  };
}

/**
 * Valida un SN contra el slot i del modelo.
 * Si el modelo no tiene digits_per_series → config_missing (bloquea).
 */
export function validateSerialForModelSlot(
  rawSerial: string,
  model: {
    series_count?: number | null;
    seriesCount?: number | null;
    digits_per_series?: unknown;
    digitsPerSeries?: unknown;
  } | null | undefined,
  slotIndex: number
): SerialLengthResult {
  if (!modelHasDigitRules(model)) {
    const serial = prepareScannedSerial(rawSerial);
    const { title, message } = buildLengthMessages('config_missing', null, serial.length);
    return {
      valid: false,
      expected: null,
      received: serial.length,
      reason: 'config_missing',
      serial,
      title,
      message,
    };
  }
  const { digitsPerSeries } = resolveModelDigitRules(model);
  const expected = getExpectedDigitsForSlot(digitsPerSeries, slotIndex);
  return validateSerialLength(rawSerial, expected);
}

/**
 * Pistoleo de un solo campo (Bodega / SCRAPS / Despacho):
 * acepta si la longitud coincide con cualquiera de los slots configurados del modelo.
 */
export function validateSerialForModelAnySlot(
  rawSerial: string,
  model: {
    series_count?: number | null;
    seriesCount?: number | null;
    digits_per_series?: unknown;
    digitsPerSeries?: unknown;
  } | null | undefined
): SerialLengthResult {
  const serial = prepareScannedSerial(rawSerial);
  const received = serial.length;

  if (!modelHasDigitRules(model)) {
    const { title, message } = buildLengthMessages('config_missing', null, received);
    return {
      valid: false,
      expected: null,
      received,
      reason: 'config_missing',
      serial,
      title,
      message,
    };
  }

  const { seriesCount, digitsPerSeries } = resolveModelDigitRules(model);
  const allowed = Array.from({ length: seriesCount }, (_, i) =>
    getExpectedDigitsForSlot(digitsPerSeries, i)
  ).filter((n): n is number => n != null && n > 0);

  const uniqueAllowed = [...new Set(allowed)];
  if (uniqueAllowed.length === 0) {
    const { title, message } = buildLengthMessages('config_missing', null, received);
    return {
      valid: false,
      expected: null,
      received,
      reason: 'config_missing',
      serial,
      title,
      message,
    };
  }

  if (received === 0) {
    const expected = uniqueAllowed[0]!;
    const { title, message } = buildLengthMessages('empty', expected, received);
    return {
      valid: false,
      expected,
      received,
      reason: 'empty',
      serial,
      title,
      message,
    };
  }

  if (uniqueAllowed.includes(received)) {
    return {
      valid: true,
      expected: received,
      received,
      reason: 'ok',
      serial,
      title: '',
      message: '',
    };
  }

  const primary = uniqueAllowed[0]!;
  const reason: SerialLengthReason = received < Math.min(...uniqueAllowed) ? 'too_short' : 'too_long';
  const expectedLabel =
    uniqueAllowed.length === 1 ? String(primary) : uniqueAllowed.join(' o ');
  const title = reason === 'too_short' ? 'Serial incompleto' : 'Longitud incorrecta';
  const truncateNote =
    reason === 'too_long'
      ? ' El Serial no será truncado. Verifique el código y vuelva a pistolear.'
      : ' Verifique el código y vuelva a pistolear.';
  return {
    valid: false,
    expected: primary,
    received,
    reason,
    serial,
    title,
    message: `Este modelo requiere ${expectedLabel} caracteres. Se recibieron ${received} caracteres.${truncateNote}`,
  };
}

/** Contador visual: `15 / 16`, `16 / 16 ✓`, `18 / 16 ⚠️`. */
export function serialLengthCounterLabel(
  received: number,
  expected: number | null | undefined
): string {
  if (expected == null || expected <= 0) {
    return received > 0 ? `${received} caracteres` : '—';
  }
  if (received === 0) return `0 / ${expected}`;
  if (received === expected) return `${received} / ${expected} ✓`;
  if (received > expected) return `${received} / ${expected} ⚠️`;
  return `${received} / ${expected}`;
}

/**
 * Compat: mensajes legacy. Usa validateSerialLength por dentro.
 * Si expectedDigits es null → config_missing (bloquea), no ok silencioso.
 */
export function validateSerialExactDigits(
  serial: string,
  expectedDigits: number | null | undefined,
  label = 'Serie'
): { ok: true; serial: string } | { ok: false; message: string; description?: string } {
  const result = validateSerialLength(serial, expectedDigits);
  if (result.valid) return { ok: true, serial: result.serial };
  return {
    ok: false,
    message: result.title || `${label}: longitud incorrecta`,
    description: result.message,
  };
}

/**
 * Valida S1…Sn según digits_per_series del modelo.
 * Sin reglas configuradas → bloquea (configuración incompleta).
 */
export function validateScanSlotsAgainstDigitRules(
  scans: string[],
  rules: { seriesCount: number; digitsPerSeries: number[] }
): { ok: true } | { ok: false; message: string; description?: string } {
  const { seriesCount, digitsPerSeries } = rules;
  if (!digitsPerSeries.length) {
    return {
      ok: false,
      message: 'Configuración incompleta',
      description:
        'Este modelo no tiene definida la longitud del Serial. Configure "Dígitos Serie N" antes de continuar.',
    };
  }

  for (let i = 0; i < seriesCount; i++) {
    const expected = getExpectedDigitsForSlot(digitsPerSeries, i);
    const raw = scans[i] || '';
    const prepared = prepareScannedSerial(raw);
    if (!prepared) {
      return {
        ok: false,
        message: `Falta Serie ${i + 1}`,
        description: `Según la regla del modelo debe tener exactamente ${expected} caracteres.`,
      };
    }
    const check = validateSerialLength(prepared, expected);
    if (!check.valid) {
      return {
        ok: false,
        message: check.title || `Serie ${i + 1}: longitud incorrecta`,
        description: check.message,
      };
    }
  }
  return { ok: true };
}
