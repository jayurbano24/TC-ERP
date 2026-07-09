/** Códigos BOX ya visibles en inventario (para evitar colisión al reservar correlativo). */
export function collectTakenBoxCodes(
  inventory: Array<{ id?: string; box_code?: string | null }>
): string[] {
  const codes = new Set<string>();
  for (const box of inventory) {
    for (const raw of [box.box_code, box.id]) {
      const val = (raw || '').trim().toUpperCase();
      if (/^BOX-[0-9]+$/.test(val)) codes.add(val);
    }
  }
  return [...codes];
}
