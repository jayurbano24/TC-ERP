export const scannerService = {
  /**
   * Procesa una cadena escaneada (SN) limpiando espacios y retornos de carro.
   */
  cleanScannedInput: (input: string): string => {
    return input.replace(/[\r\n]+/g, '').trim().toUpperCase();
  },

  /**
   * Verifica si un ítem ya fue escaneado en el lote actual para evitar duplicados locales.
   */
  isDuplicateLocal: (scannedList: string[], newItem: string): boolean => {
    return scannedList.includes(newItem);
  }
};
