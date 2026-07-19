export type FontPresetId =
  | 'inter'
  | 'manrope'
  | 'jakarta'
  | 'source'
  | 'dm'
  | 'outfit'
  | 'grotesk';

export type FontPreset = {
  id: FontPresetId;
  label: string;
  description: string;
  /** CSS font-family stack using next/font variables. */
  stack: string;
  /** Sample weight hint for UI. */
  weight: '400' | '500' | '600';
};

export const FONT_STORAGE_KEY = 'tcerp_font';
export const DEFAULT_FONT_ID: FontPresetId = 'inter';

export const FONT_PRESETS: FontPreset[] = [
  {
    id: 'inter',
    label: 'Inter',
    description: 'Neutra y legible (por defecto)',
    stack: 'var(--font-inter), system-ui, sans-serif',
    weight: '500',
  },
  {
    id: 'manrope',
    label: 'Manrope',
    description: 'Geométrica moderna',
    stack: 'var(--font-manrope), system-ui, sans-serif',
    weight: '500',
  },
  {
    id: 'jakarta',
    label: 'Plus Jakarta',
    description: 'Producto SaaS limpio',
    stack: 'var(--font-jakarta), system-ui, sans-serif',
    weight: '500',
  },
  {
    id: 'source',
    label: 'Source Sans',
    description: 'Corporativa clásica',
    stack: 'var(--font-source-sans), system-ui, sans-serif',
    weight: '400',
  },
  {
    id: 'dm',
    label: 'DM Sans',
    description: 'Densa y contemporánea',
    stack: 'var(--font-dm-sans), system-ui, sans-serif',
    weight: '500',
  },
  {
    id: 'outfit',
    label: 'Outfit',
    description: 'Display suave ERP',
    stack: 'var(--font-outfit), system-ui, sans-serif',
    weight: '500',
  },
  {
    id: 'grotesk',
    label: 'Space Grotesk',
    description: 'Técnica / tech',
    stack: 'var(--font-space-grotesk), system-ui, sans-serif',
    weight: '500',
  },
];

export function getFontPreset(id: string | null | undefined): FontPreset {
  return FONT_PRESETS.find((p) => p.id === id) ?? FONT_PRESETS[0];
}

export function isFontPresetId(value: string): value is FontPresetId {
  return FONT_PRESETS.some((p) => p.id === value);
}
