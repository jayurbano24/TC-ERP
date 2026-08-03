/**
 * Traduce mensajes técnicos / genéricos de API o Postgres a texto accionable en toasts.
 */

export type HumanUserFacingError = {
  title: string;
  description?: string;
};

function blobOf(...parts: Array<string | undefined | null>): string {
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function extractSerial(raw: string): string | null {
  const m =
    raw.match(/Serie duplicada:\s*([A-Z0-9\-_:]+)/i) ||
    raw.match(/La serie\s+([A-Z0-9\-_:]+)/i) ||
    raw.match(/serie\s+([A-Z0-9\-_:]+)\s+ya/i) ||
    raw.match(/\(([A-Z0-9\-_]{6,})\)/);
  return m?.[1] ? m[1].toUpperCase() : null;
}

function isDuplicateError(blob: string): boolean {
  return (
    blob.includes('uniq_service_orders_active_main_serial') ||
    blob.includes('duplicate key') ||
    blob.includes('unique constraint') ||
    blob.includes('ya tiene una orden de servicio activa') ||
    blob.includes('ya posee una orden de servicio activa') ||
    blob.includes('ya fue clasificada') ||
    blob.includes('ya está registrada') ||
    blob.includes('está repetida') ||
    blob.includes('serie duplicada') ||
    blob.includes('registro duplicado') ||
    blob.includes('already exists')
  );
}

/**
 * Normaliza título/descripción de un toast de error.
 * Si el mensaje es genérico ("Validación de datos fallida") o técnico (constraint),
 * lo reemplaza por lenguaje humano; en duplicados deja claro que es por duplicado.
 */
export function humanizeUserFacingError(
  message: string,
  description?: string
): HumanUserFacingError {
  const rawTitle = String(message || '').trim();
  const rawDesc = String(description || '').trim();
  const combined = [rawTitle, rawDesc].filter(Boolean).join(' ');
  const blob = blobOf(rawTitle, rawDesc);

  if (isDuplicateError(blob)) {
    const serial = extractSerial(combined);

    if (
      /duplicate_in_equipment|duplicadas en el mismo equipo|mismo equipo/i.test(blob)
    ) {
      return {
        title: 'Duplicado en el mismo equipo',
        description: serial
          ? `La serie ${serial} está repetida en las series de un mismo equipo (S1–S4). Corrija el escaneo.`
          : 'Hay series repetidas en un mismo equipo (S1–S4). Corrija el escaneo.',
      };
    }

    if (/duplicate_in_reception|duplicadas en esta recepción|esta recepción/i.test(blob)) {
      return {
        title: 'Duplicado en esta recepción',
        description: serial
          ? `La serie ${serial} ya fue capturada en esta recepción o caja PX.`
          : 'Una serie ya fue capturada en esta recepción o caja PX.',
      };
    }

    if (/duplicate_global|serie en inventario activo/i.test(blob)) {
      return {
        title: 'Serie ya registrada en TC',
        description: serial
          ? `La serie ${serial} ya está en inventario con una orden abierta.`
          : 'La serie ya está en inventario con una orden abierta.',
      };
    }

    if (/mismo lote|está repetida|repetida en este/i.test(combined)) {
      return {
        title: 'Duplicado en el mismo lote',
        description: serial
          ? `La serie ${serial} está repetida en esta caja o guía. Quite el duplicado e intente de nuevo.`
          : 'Hay una serie repetida en esta caja o guía. Quite el duplicado e intente de nuevo.',
      };
    }

    const looksLikeTcInventoryDuplicate =
      /orden de servicio|orden abierta|inventario|duplicate_global|uniq_service_orders|ya está registrada|ya fue clasificada/i.test(
        combined
      );

    if (!looksLikeTcInventoryDuplicate) {
      return {
        title: 'Duplicado en el mismo lote',
        description: serial
          ? `La serie ${serial} ya aparece en esta recepción o en las series del equipo (S1–S4). No está duplicada en inventario TC; corrija el escaneo en la grilla.`
          : 'La serie ya aparece en esta recepción o en el mismo equipo. Corrija duplicados en la grilla antes de guardar.',
      };
    }

    return {
      title: 'Serie ya registrada en TC',
      description: serial
        ? `La serie ${serial} ya tiene una orden de servicio abierta. Cierre o despache ese ciclo antes de ingresarla de nuevo.`
        : 'Una o más series ya tienen orden de servicio abierta. Cierre o despache ese ciclo antes de ingresarlas de nuevo.',
    };
  }

  if (/validaci[oó]n de datos fallida/i.test(rawTitle) || /validaci[oó]n de datos fallida/i.test(blob)) {
    if (rawDesc && !/validaci[oó]n de datos fallida/i.test(rawDesc)) {
      return {
        title: 'Datos incompletos o inválidos',
        description: rawDesc,
      };
    }
    return {
      title: 'Datos incompletos o inválidos',
      description: 'Revise los campos del formulario (tecnología, marca, modelo, series) e intente de nuevo.',
    };
  }

  if (/not authenticated|jwt|permission denied|row-level|rls/i.test(blob)) {
    return {
      title: 'Sin permiso',
      description: 'Su sesión no tiene permiso para esta acción. Vuelva a iniciar sesión o contacte a un administrador.',
    };
  }

  return {
    title: rawTitle || 'No se pudo completar la acción',
    description: rawDesc || undefined,
  };
}
