export type InkPresetId = 'auto' | 'slate' | 'ink' | 'navy' | 'soft' | 'graphite';

export type InkTone = {
  foreground: string;
  heading: string;
  muted: string;
};

export type InkPreset = {
  id: InkPresetId;
  label: string;
  description: string;
  /** Swatch shown in the catalog (light-mode sample). */
  swatch: string;
  light: InkTone;
  dark: InkTone;
};

export const INK_STORAGE_KEY = 'tcerp_ink';
export const DEFAULT_INK_ID: InkPresetId = 'auto';

export const INK_PRESETS: InkPreset[] = [
  {
    id: 'auto',
    label: 'Automático',
    description: 'Según modo claro / oscuro',
    swatch: '#0f172a',
    light: { foreground: '#0f172a', heading: '#181c3a', muted: '#475569' },
    dark: { foreground: '#f8fafc', heading: '#f1f5f9', muted: '#94a3b8' },
  },
  {
    id: 'slate',
    label: 'Pizarra',
    description: 'Gris azulado legible',
    swatch: '#334155',
    light: { foreground: '#334155', heading: '#0f172a', muted: '#64748b' },
    dark: { foreground: '#e2e8f0', heading: '#f8fafc', muted: '#94a3b8' },
  },
  {
    id: 'ink',
    label: 'Tinta',
    description: 'Negro suave alto contraste',
    swatch: '#111827',
    light: { foreground: '#111827', heading: '#030712', muted: '#4b5563' },
    dark: { foreground: '#f9fafb', heading: '#ffffff', muted: '#9ca3af' },
  },
  {
    id: 'navy',
    label: 'Navy',
    description: 'Azul corporativo en texto',
    swatch: '#1e3a5f',
    light: { foreground: '#1e3a5f', heading: '#0b1f3a', muted: '#5b7a9d' },
    dark: { foreground: '#dbeafe', heading: '#eff6ff', muted: '#93c5fd' },
  },
  {
    id: 'soft',
    label: 'Suave',
    description: 'Contraste reducido',
    swatch: '#57534e',
    light: { foreground: '#44403c', heading: '#292524', muted: '#78716c' },
    dark: { foreground: '#e7e5e4', heading: '#fafaf9', muted: '#a8a29e' },
  },
  {
    id: 'graphite',
    label: 'Grafito',
    description: 'Neutral zinc',
    swatch: '#3f3f46',
    light: { foreground: '#3f3f46', heading: '#18181b', muted: '#71717a' },
    dark: { foreground: '#f4f4f5', heading: '#fafafa', muted: '#a1a1aa' },
  },
];

export function getInkPreset(id: string | null | undefined): InkPreset {
  return INK_PRESETS.find((p) => p.id === id) ?? INK_PRESETS[0];
}

export function isInkPresetId(value: string): value is InkPresetId {
  return INK_PRESETS.some((p) => p.id === value);
}
