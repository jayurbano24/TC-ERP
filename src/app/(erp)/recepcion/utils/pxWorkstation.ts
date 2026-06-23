const WORKSTATION_KEY = 'tc_erp_workstation_label';

/** Etiqueta de estación/tablet para auditoría de captura PX. */
export function getWorkstationLabel(): string {
  if (typeof window === 'undefined') return 'SERVER';
  try {
    const saved = sessionStorage.getItem(WORKSTATION_KEY)?.trim();
    if (saved) return saved.slice(0, 120);
  } catch {
    /* ignore */
  }
  const host = window.location.hostname || 'unknown-host';
  return `WEB-${host}`.slice(0, 120);
}

export function setWorkstationLabel(label: string) {
  if (typeof window === 'undefined') return;
  try {
    const v = label.trim().slice(0, 120);
    if (v) sessionStorage.setItem(WORKSTATION_KEY, v);
    else sessionStorage.removeItem(WORKSTATION_KEY);
  } catch {
    /* ignore */
  }
}
