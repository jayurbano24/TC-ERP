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

    const latestOS = await receptionRepository.getLatestServiceOrder(existingSeries.id);

    // Estados que permiten re-ingreso
    const exitedStatuses = ['DESPACHADO', 'ENTREGADO', 'SALIDA', 'DEVUELTO'];
    const currentStatus = (latestOS?.status || '').toUpperCase();

    if (!latestOS || !exitedStatuses.some(s => currentStatus.includes(s))) {
      const reception = existingSeries.receptions as any;
      const recGuide = reception?.guide_number || 'N/A';
      const recDate = reception?.created_at ? new Date(reception.created_at).toLocaleDateString() : '';
      const osLabel = latestOS?.os_label || 'NO ASIGNADA (En Bodega/Recepción)';

      return {
        blocked: true,
        info: `🚫 SERIE EN PROCESO ACTIVO\n\nLa serie "${serial}" ya está registrada en el sistema:\n` +
              `• Recepción Original: ${recGuide} (${recDate})\n` +
              `• Orden de Servicio: ${osLabel}\n` +
              `• Estado Actual: ${currentStatus || 'DESCONOCIDO'}\n\n` +
              `No puede ingresar nuevamente hasta que sea despachada o devuelta.`
      };
    }

    return { blocked: false, info: '' };
  },

  validateCACGuide: (scannedItems: string[], expectedCount: number) => {
    if (scannedItems.length === 0) return "Debe escanear al menos un ítem.";
    if (expectedCount > 0 && scannedItems.length > expectedCount) {
      return `Ha escaneado más equipos (${scannedItems.length}) de los esperados (${expectedCount}). Revise la guía.`;
    }
    return null;
  }
};
