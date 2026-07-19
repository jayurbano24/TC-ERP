export type AccentPresetId =
  | 'cyan'
  | 'blue'
  | 'indigo'
  | 'emerald'
  | 'teal'
  | 'amber'
  | 'rose'
  | 'violet';

export type AccentPreset = {
  id: AccentPresetId;
  label: string;
  description: string;
  /** Brand accent (buttons, active nav, links). */
  accent: string;
  /** Text/icons on top of accent surfaces. */
  accentForeground: string;
};

export const ACCENT_PRESETS: AccentPreset[] = [
  {
    id: 'cyan',
    label: 'Cian TC',
    description: 'Acento original Tech Corps',
    accent: '#2ec4f1',
    accentForeground: '#0a0e17',
  },
  {
    id: 'blue',
    label: 'Azul',
    description: 'Corporativo clásico',
    accent: '#3b82f6',
    accentForeground: '#0a0e17',
  },
  {
    id: 'indigo',
    label: 'Índigo',
    description: 'Enfoque producto SaaS',
    accent: '#6366f1',
    accentForeground: '#ffffff',
  },
  {
    id: 'emerald',
    label: 'Esmeralda',
    description: 'Operaciones / éxito',
    accent: '#10b981',
    accentForeground: '#052e1b',
  },
  {
    id: 'teal',
    label: 'Verde azulado',
    description: 'Frescos y densos',
    accent: '#14b8a6',
    accentForeground: '#042f2e',
  },
  {
    id: 'amber',
    label: 'Ámbar',
    description: 'Alto contraste cálido',
    accent: '#f59e0b',
    accentForeground: '#1c1403',
  },
  {
    id: 'rose',
    label: 'Rosa',
    description: 'Prioridad / alertas suaves',
    accent: '#f43f5e',
    accentForeground: '#ffffff',
  },
  {
    id: 'violet',
    label: 'Violeta',
    description: 'Gestión y BI',
    accent: '#8b5cf6',
    accentForeground: '#ffffff',
  },
];

export const DEFAULT_ACCENT_ID: AccentPresetId = 'cyan';
export const ACCENT_STORAGE_KEY = 'tcerp_accent';

export function getAccentPreset(id: string | null | undefined): AccentPreset {
  return ACCENT_PRESETS.find((p) => p.id === id) ?? ACCENT_PRESETS[0];
}

export function isAccentPresetId(value: string): value is AccentPresetId {
  return ACCENT_PRESETS.some((p) => p.id === value);
}
