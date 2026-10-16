export const MODEL_PORTFOLIO_VIGENCIA_VALUES = ['vigente', 'obsoleto'] as const;

export type ModelPortfolioVigencia = (typeof MODEL_PORTFOLIO_VIGENCIA_VALUES)[number];

export const MODEL_PORTFOLIO_VIGENCIA_LABEL: Record<ModelPortfolioVigencia, string> = {
  vigente: 'Vigente',
  obsoleto: 'Obsoleto',
};

export function normalizeModelPortfolioVigencia(
  raw: string | null | undefined,
): ModelPortfolioVigencia {
  const v = String(raw ?? '').trim().toLowerCase();
  return v === 'obsoleto' ? 'obsoleto' : 'vigente';
}

export function labelModelPortfolioVigencia(raw: string | null | undefined): string {
  return MODEL_PORTFOLIO_VIGENCIA_LABEL[normalizeModelPortfolioVigencia(raw)];
}
