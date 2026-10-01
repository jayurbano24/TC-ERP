export type PrediagnosticoCheckItem = {
  id: string;
  name: string;
  kind: 'cosmetico' | 'funcionamiento';
};

function labelFor(name: string, value: 'si' | 'no'): string {
  const upper = name.trim().toUpperCase();
  if (upper === 'ENCIENDE') return value === 'si' ? 'SI SE ENCIENDE' : 'NO SE ENCIENDE';
  return value === 'si' ? `SI ${upper}` : `NO ${upper}`;
}

/** Funcionamiento marcado Sí o No, en el orden del catálogo. */
export function formatPrediagnosticoDiagnostico(
  checks: Record<string, string>,
  items: PrediagnosticoCheckItem[]
): string {
  const parts: string[] = [];
  for (const item of items) {
    if (item.kind !== 'funcionamiento') continue;
    const value = checks[item.id];
    if (value === 'si' || value === 'no') parts.push(labelFor(item.name, value));
  }
  return parts.join(' / ');
}

/** Cosméticos marcados Dañado, en el orden del catálogo. */
export function formatPrediagnosticoAccion(
  cosmetics: Record<string, string>,
  items: PrediagnosticoCheckItem[]
): string {
  return items
    .filter((item) => item.kind === 'cosmetico' && cosmetics[item.id] === 'danado')
    .map((item) => item.name.trim().toUpperCase())
    .join(' / ');
}
