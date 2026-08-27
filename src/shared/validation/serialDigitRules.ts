/**
 * Reglas S/D de modelo/tecnología: series_count + digits_per_series.
 * Exactitud: la serie escaneada debe tener exactamente N caracteres (dígitos/alfanum).
 */

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

/** Dígitos esperados para el slot S1=0, S2=1, … Si no hay regla, null (no forzar). */
export function getExpectedDigitsForSlot(
  digitsPerSeries: number[] | null | undefined,
  slotIndex: number
): number | null {
  const digits = normalizeDigitsPerSeries(digitsPerSeries);
  if (!digits.length) return null;
  if (slotIndex < 0) return null;
  return digits[slotIndex] ?? digits[digits.length - 1] ?? null;
}

export function clampSerialToMaxDigits(value: string, maxDigits: number | null | undefined): string {
  if (maxDigits == null || maxDigits <= 0) return value;
  return value.slice(0, maxDigits);
}

export function validateSerialExactDigits(
  serial: string,
  expectedDigits: number | null | undefined,
  label = 'Serie'
): { ok: true } | { ok: false; message: string; description?: string } {
  if (expectedDigits == null || expectedDigits <= 0) return { ok: true };
  const len = serial.trim().length;
  if (len === expectedDigits) return { ok: true };
  return {
    ok: false,
    message: `${label}: cantidad de caracteres incorrecta`,
    description: `La regla del modelo exige ${expectedDigits} caracteres. Escaneado: ${len}.`,
  };
}

/**
 * Valida S1…Sn según digits_per_series del modelo.
 * Slots con regla deben estar llenos y con longitud exacta.
 */
export function validateScanSlotsAgainstDigitRules(
  scans: string[],
  rules: { seriesCount: number; digitsPerSeries: number[] }
): { ok: true } | { ok: false; message: string; description?: string } {
  const { seriesCount, digitsPerSeries } = rules;
  if (!digitsPerSeries.length) return { ok: true };

  for (let i = 0; i < seriesCount; i++) {
    const expected = getExpectedDigitsForSlot(digitsPerSeries, i);
    const val = (scans[i] || '').trim();
    if (expected == null) continue;
    if (!val) {
      return {
        ok: false,
        message: `Falta Serie ${i + 1}`,
        description: `Según la regla del modelo debe tener exactamente ${expected} caracteres.`,
      };
    }
    const check = validateSerialExactDigits(val, expected, `Serie ${i + 1}`);
    if (!check.ok) return check;
  }
  return { ok: true };
}
