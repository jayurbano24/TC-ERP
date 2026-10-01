export const SHELL_CLASSES = ['A', 'B', 'C', 'D'] as const;
export const VERDICTS = ['reacondicionado', 'reparado', 'irreparable'] as const;
export const COSMETIC_VALUES = ['bien', 'danado'] as const;
export const FUNCTION_VALUES = ['si', 'no', 'na'] as const;

export type ShellClass = (typeof SHELL_CLASSES)[number];
export type Verdict = (typeof VERDICTS)[number];
export type CosmeticValue = (typeof COSMETIC_VALUES)[number];
export type FunctionValue = (typeof FUNCTION_VALUES)[number];

export type PrediagnosticoInput = {
  serviceOrderId: string;
  shellClass: string | null;
  cosmetics: Record<string, string>;
  functionChecks: Record<string, string>;
  verdict: string | null;
  notes: string;
};

export const SHELL_CLASS_HELP: Record<ShellClass, string> = {
  A: 'Aspecto como nuevo, sin marcas.',
  B: 'Marcas leves, rayones superficiales.',
  C: 'Daños visibles, golpes o decoloración.',
  D: 'Daño severo, carcasa rota o faltante.',
};

const SHELL_SET = new Set<string>(SHELL_CLASSES);
const VERDICT_SET = new Set<string>(VERDICTS);
const COSMETIC_SET = new Set<string>(COSMETIC_VALUES);
const FUNCTION_SET = new Set<string>(FUNCTION_VALUES);

export function validatePrediagnostico(input: PrediagnosticoInput): string[] {
  const errors: string[] = [];
  if (!input.shellClass || !SHELL_SET.has(input.shellClass)) {
    errors.push('Selecciona la clase de la carcasa');
  }
  if (!input.verdict || !VERDICT_SET.has(input.verdict)) {
    errors.push('Selecciona el dictamen final');
  }
  for (const [key, value] of Object.entries(input.cosmetics || {})) {
    if (!COSMETIC_SET.has(value)) {
      errors.push(`Valor no válido en el detalle cosmético «${key}»`);
    }
  }
  for (const [key, value] of Object.entries(input.functionChecks || {})) {
    if (!FUNCTION_SET.has(value)) {
      errors.push(`Valor no válido en el funcionamiento «${key}»`);
    }
  }
  return errors;
}

export function itemAppliesToEquipment(
  item: { technologyIds: string[]; brandIds: string[] },
  techId: string,
  brandId: string
): boolean {
  const techOk = item.technologyIds.length === 0 || item.technologyIds.includes(techId);
  const brandOk = item.brandIds.length === 0 || item.brandIds.includes(brandId);
  return techOk && brandOk;
}
