/** Contexto RPC para mapear errores sin confundir CAPTURE con FINALIZE. */
export type PxRpcErrorContext = 'capture' | 'finalize' | 'box' | 'generic';

export type ParsedPxRpcError = {
  code: string;
  sqlstate?: string;
};

/** Extrae código de negocio y SQLSTATE desde el mensaje Postgres/Supabase. */
export function parsePxRpcError(message: string): ParsedPxRpcError {
  const msg = message || '';
  const prefix = (msg.match(/^([A-Z_]+):/) || [])[1];

  if (prefix) {
    return { code: prefix };
  }

  if (/BOX_BUSY|lock_not_available|could not obtain lock/i.test(msg)) {
    return { code: 'BOX_BUSY', sqlstate: '55P03' };
  }
  if (/statement timeout|57014|query_canceled/i.test(msg)) {
    return { code: 'CAPTURE_TIMEOUT', sqlstate: '57014' };
  }
  if (/unique_violation|duplicate key/i.test(msg)) {
    return { code: 'DUPLICATE_SERIAL', sqlstate: '23505' };
  }

  return { code: 'RPC_ERROR' };
}

/**
 * Mapea errores RPC a mensajes funcionales.
 * @param context - 'capture' evita mensajes de finalización en timeouts de pistoleo.
 */
export function mapRpcCaptureError(
  message: string,
  context: PxRpcErrorContext = 'generic',
): string {
  const msg = message || '';
  const parsed = parsePxRpcError(msg);

  if (parsed.code === 'BOX_BUSY' || /BOX_BUSY/i.test(msg)) {
    return 'Hay otra captura en proceso en esta caja. Espere unos segundos e intente nuevamente.';
  }

  if (msg.includes('DUPLICATE_OPEN_OS')) {
    return 'SERIE DUPLICADA – ORDEN DE SERVICIO ABIERTA. Esta unidad no puede ser ingresada nuevamente a PX.';
  }
  if (msg.includes('DUPLICATE_IN_OTHER_GUIDE')) {
    return msg.replace(
      /^.*DUPLICATE_IN_OTHER_GUIDE:\s*/i,
      'Serie ya capturada en otra guía. Elimine el duplicado antes de continuar: ',
    );
  }
  if (msg.includes('DUPLICATE_IN_RECEPTION') || parsed.code === 'DUPLICATE_IN_RECEPTION') {
    if (/Elimine el duplicado/i.test(msg)) {
      return msg.replace(/^.*DUPLICATE_IN_RECEPTION:\s*/i, '');
    }
    return 'Serie repetida en esta recepción PX. Ya está en otra caja de esta guía — elimínela ahí antes de continuar.';
  }
  if (msg.includes('DUPLICATE_GLOBAL')) {
    return msg.replace(
      /^.*DUPLICATE_GLOBAL:\s*/i,
      'Serie ya en inventario TC (orden abierta). No capture de nuevo: ',
    );
  }
  if (msg.includes('DUPLICATE_IN_EQUIPMENT')) {
    return 'Serie repetida en el mismo equipo (mismo lote de caja). Revise que S1–S4 no estén duplicadas.';
  }
  if (msg.includes('DUPLICATE_INVALID')) {
    return 'Serie principal obligatoria.';
  }
  if (msg.includes('BOX_FULL')) {
    return 'La caja alcanzó su capacidad declarada.';
  }
  if (msg.includes('BOX_EMPTY_DUPLICATE_OPEN_OS')) {
    return 'No es posible finalizar esta caja. No se registró ninguna unidad porque las series fueron rechazadas por existir en otras Órdenes de Servicio abiertas.';
  }
  if (msg.includes('ZERO_ACCEPTED_BOX')) {
    return msg.replace(/^.*ZERO_ACCEPTED_BOX:\s*/i, '');
  }
  if (msg.includes('BOX_EMPTY')) {
    return 'No es posible finalizar esta caja porque no tiene unidades aceptadas.';
  }
  if (msg.includes('BOX_LOCKED') || msg.includes('BOX_NOT_LOCKED')) {
    if (msg.includes('BOX_NOT_LOCKED')) return 'Debe tomar control de la caja antes de escanear.';
    return msg.replace(/^.*BOX_LOCKED:\s*/i, '');
  }
  if (msg.includes('VERSION_CONFLICT')) {
    return 'Conflicto de versión: otro operador modificó la caja. Recargue e intente de nuevo.';
  }
  if (msg.includes('PARTIAL_REASON_REQUIRED')) {
    return 'Indique motivo de caja parcial o ajuste la cantidad esperada antes de cerrar.';
  }
  if (msg.includes('REASON_REQUIRED')) {
    return 'Motivo obligatorio para ajustar la cantidad.';
  }
  if (msg.includes('QUANTITY_BELOW_CAPTURED')) {
    return msg.replace(/^.*QUANTITY_BELOW_CAPTURED:\s*/i, '');
  }
  if (msg.includes('INVALID_STATE')) {
    return 'La recepción no está en proceso o la caja no puede reabrirse en este estado.';
  }
  if (msg.includes('VARIANCE_REASON_REQUIRED')) {
    return msg.replace(/^.*VARIANCE_REASON_REQUIRED:\s*/i, '');
  }
  if (msg.includes('BOX_NOT_CLOSED')) {
    return msg.replace(/^.*BOX_NOT_CLOSED:\s*/i, '');
  }
  if (msg.includes('RECEPTION_EMPTY')) {
    return 'No hay equipos capturados para finalizar.';
  }

  if (
    parsed.code === 'CAPTURE_TIMEOUT' ||
    msg.includes('statement timeout') ||
    msg.includes('57014') ||
    msg.includes('query_canceled')
  ) {
    if (context === 'finalize') {
      return 'La finalización tardó demasiado (timeout). Pulse Finalizar de nuevo: las cajas cerradas y los equipos ya ingresados se conservan.';
    }
    return 'La captura tardó demasiado. Espere unos segundos e intente de nuevo. Si persiste, avise a soporte.';
  }

  return msg;
}

/** Mensaje específico para finalize (alias explícito). */
export function mapRpcFinalizeError(message: string): string {
  return mapRpcCaptureError(message, 'finalize');
}
