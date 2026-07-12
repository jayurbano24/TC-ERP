import { receptionRepository } from '../repositories/receptionRepository';
import { ValidationResult } from '../types/reception.types';

export const validationService = {
  /**
   * Verifica si una serie ya está en un proceso activo dentro del sistema.
   * Permite re-ingreso únicamente si fue despachada o salió del sistema.
   */
  checkSerialInSystem: async (serial: string): Promise<ValidationResult> => {
    const existingSeries = await receptionRepository.checkSerialExists(serial);
    if (!existingSeries) return { blocked: false, info: '' };

    const reception = existingSeries.receptions as any;
    const recStatus = String(reception?.status || '').toUpperCase();
    const inactiveReception = ['ELIMINADO POR BODEGA', 'ELIMINADO', 'ARCHIVADO', 'DEVUELTO'].includes(
      recStatus
    );

    const seriesStatus = String(existingSeries.current_status || '').toLowerCase();
    const exitedSeries = ['dispatched', 'returned'].includes(seriesStatus);

    if (exitedSeries || inactiveReception) {
      return { blocked: false, info: '' };
    }

    const latestOS = await receptionRepository.getLatestServiceOrder(
      existingSeries.id,
      existingSeries.serial_number
    );

    const exitedStatuses = ['DESPACHADO', 'ENTREGADO', 'SALIDA', 'DEVUELTO'];
    const currentStatus = (latestOS?.status || '').toUpperCase();
    if (exitedStatuses.some((s) => currentStatus.includes(s))) {
      return { blocked: false, info: '' };
    }

    // Cualquier serie existente no salida = proceso activo (bodega, taller, QC, etc.)
    const recGuide = reception?.guide_number || 'N/A';
    const recSap = reception?.sap_document || '---';
    const recDate = reception?.created_at
      ? new Date(reception.created_at).toLocaleDateString()
      : '';
    const osLabel = latestOS?.os_label || 'SIN OS';

    return {
      blocked: true,
      info:
        `🚫 SERIE EN PROCESO ACTIVO\n\nLa serie "${serial}" ya está registrada:\n` +
        `• Recepción: ${recGuide} (${recDate})\n` +
        `• Pedido SAP: ${recSap}\n` +
        `• Orden de Servicio: ${osLabel}\n` +
        `• Estado serie: ${existingSeries.current_status || 'DESCONOCIDO'}\n\n` +
        `No puede ingresar nuevamente hasta eliminar la recepción duplicada o despachar/devolver el equipo.`,
    };
  },

  validateCACGuide: (scannedItems: string[], expectedCount: number) => {
    if (scannedItems.length === 0) return "Debe escanear al menos un ítem.";
    if (expectedCount > 0 && scannedItems.length > expectedCount) {
      return `Ha escaneado más equipos (${scannedItems.length}) de los esperados (${expectedCount}). Revise la guía.`;
    }
    return null;
  }
};
