/** Constantes y validación OS TC-XXX */
export const HISTORY_TRAY_PAGE_SIZE = 25;

export const TC_OS_LABEL_REGEX = /^TC-\d+/i;

export function isTcServiceOrderLabel(label?: string | null): boolean {
  if (!label || label === '---') return false;
  return TC_OS_LABEL_REGEX.test(label.trim());
}
