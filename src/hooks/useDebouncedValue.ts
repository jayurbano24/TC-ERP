import { useEffect, useState } from 'react';

/**
 * Devuelve una versión "retardada" de `value` que solo se actualiza cuando han
 * pasado `delayMs` sin cambios (C5).
 *
 * Útil para:
 * - Búsquedas server-side: evita disparar una consulta por cada tecla.
 * - Filtrado en cliente sobre arrays grandes: evita recomputar/re-renderizar en
 *   cada pulsación (el input se mantiene fluido porque sigue ligado al valor
 *   inmediato; solo el cómputo costoso se difiere).
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
