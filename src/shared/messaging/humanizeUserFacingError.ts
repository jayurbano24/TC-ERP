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
    if (/mismo lote|está repetida/i.test(combined)) {
      return {
        title: 'Serie duplicada',
        description: serial
          ? `La serie ${serial} está repetida en este mismo lote. Quite el duplicado e intente de nuevo.`
          : 'Hay una serie repetida en este mismo lote. Quite el duplicado e intente de nuevo.',
      };
    }
    return {
      title: 'Serie duplicada',
      description: serial
        ? `La serie ${serial} ya está registrada con una orden de servicio abierta. No se puede ingresar de nuevo hasta cerrar o despachar ese ciclo.`
        : 'Una o más series ya están registradas con una orden de servicio abierta. No se pueden ingresar de nuevo hasta cerrar o despachar ese ciclo.',
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
