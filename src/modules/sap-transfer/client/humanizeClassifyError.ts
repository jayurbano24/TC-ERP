/**
 * Traduce errores técnicos de classify (Postgres / RPC) a mensajes claros para Backoffice.
 */

export type HumanClassifyError = {
  title: string;
  description: string;
  isDuplicate: boolean;
};

function isDuplicateClassifyError(raw: string): boolean {
  const msg = raw.toLowerCase();
  return (
    msg.includes('uniq_service_orders_active_main_serial') ||
    msg.includes('duplicate key') ||
    msg.includes('ya tiene una orden de servicio activa') ||
    msg.includes('ya posee una orden de servicio activa') ||
    msg.includes('ya fue clasificada en este mismo lote') ||
    msg.includes('ya está registrada') ||
    msg.includes('ya tienen una orden') ||
    msg.includes('ya tienen orden') ||
    msg.includes('está repetida') ||
    msg.includes('serie duplicada') ||
    msg.includes('no se pudieron ingresar')
  );
}

/** Extrae la serie mencionada en el mensaje del RPC, si existe. */
function extractSerial(raw: string): string | null {
  const m =
    raw.match(/Serie duplicada:\s*([A-Z0-9\-_:]+)/i) ||
    raw.match(/La serie\s+([A-Z0-9\-_:]+)/i) ||
    raw.match(/serie\s+([A-Z0-9\-_:]+)\s+ya/i);
  return m?.[1] ? m[1].toUpperCase() : null;
}

export function humanizeClassifyEquipmentError(raw: string | null | undefined): HumanClassifyError {
  const text = String(raw || '').trim();

  if (!text) {
    return {
      title: 'No se pudo clasificar',
      description: 'Ocurrió un error al guardar los equipos. Intente de nuevo.',
      isDuplicate: false,
    };
  }

  if (isDuplicateClassifyError(text)) {
    const serial = extractSerial(text);

    if (/mismo lote|está repetida|repetida en este/i.test(text)) {
      return {
        title: 'Duplicado en el mismo lote',
        description: serial
          ? `La serie ${serial} está repetida en esta caja o guía. Quite el duplicado e intente de nuevo.`
          : 'Hay una serie repetida en esta caja o guía. Quite el duplicado e intente de nuevo.',
        isDuplicate: true,
      };
    }

    const looksLikeTcInventoryDuplicate =
      /orden de servicio|orden abierta|inventario|ya está registrada|ya fue clasificada/i.test(text);

    if (!looksLikeTcInventoryDuplicate) {
      return {
        title: 'Duplicado en el mismo lote',
        description: serial
          ? `La serie ${serial} está repetida en esta caja o guía. Quite el duplicado e intente de nuevo.`
          : 'Hay una serie repetida en esta caja o guía. Quite el duplicado e intente de nuevo.',
        isDuplicate: true,
      };
    }

    return {
      title: 'Serie ya registrada en TC',
      description: serial
        ? `La serie ${serial} ya tiene una orden de servicio abierta en el sistema. Cierre o despache ese ciclo antes de ingresarla de nuevo.`
        : 'Una o más series ya tienen orden de servicio abierta en el sistema. Cierre o despache ese ciclo antes de ingresarlas de nuevo.',
      isDuplicate: true,
    };
  }

  if (/not authenticated|jwt|permission|rls|row-level/i.test(text)) {
    return {
      title: 'Sin permiso para clasificar',
      description: 'Su sesión no tiene permiso para guardar equipos. Vuelva a iniciar sesión o contacte a un administrador.',
      isDuplicate: false,
    };
  }

  return {
    title: 'No se pudo clasificar',
    description: text,
    isDuplicate: false,
  };
}
