export type SidebarPresetId =
  | 'navy'
  | 'midnight'
  | 'gray'
  | 'slate'
  | 'graphite'
  | 'stone'
  | 'cloud'
  | 'ocean'
  | 'forest'
  | 'wine';

export type SidebarTone = {
  background: string;
  foreground: string;
};

export type SidebarPreset = {
  id: SidebarPresetId;
  label: string;
  description: string;
  /** Apariencia en modo claro */
  light: SidebarTone;
  /** Apariencia en modo oscuro (tono opuesto / complementario) */
  dark: SidebarTone;
};

export const SIDEBAR_STORAGE_KEY = 'tcerp_sidebar';
export const DEFAULT_SIDEBAR_ID: SidebarPresetId = 'navy';

export const SIDEBAR_PRESETS: SidebarPreset[] = [
  {
    id: 'navy',
    label: 'Navy TC',
    description: 'Azul corporativo ↔ cielo suave',
    light: { background: '#181c3a', foreground: '#f8fafc' },
    dark: { background: '#e8eaf6', foreground: '#181c3a' },
  },
  {
    id: 'midnight',
    label: 'Medianoche',
    description: 'Casi negro ↔ blanco puro',
    light: { background: '#030712', foreground: '#f1f5f9' },
    dark: { background: '#f8fafc', foreground: '#030712' },
  },
  {
    id: 'gray',
    label: 'Gris',
    description: 'Gris neutro ↔ gris claro',
    light: { background: '#4b5563', foreground: '#f9fafb' },
    dark: { background: '#e5e7eb', foreground: '#111827' },
  },
  {
    id: 'slate',
    label: 'Pizarra',
    description: 'Gris azulado ↔ niebla',
    light: { background: '#1e293b', foreground: '#f8fafc' },
    dark: { background: '#e2e8f0', foreground: '#0f172a' },
  },
  {
    id: 'graphite',
    label: 'Grafito',
    description: 'Gris zinc oscuro ↔ zinc claro',
    light: { background: '#27272a', foreground: '#fafafa' },
    dark: { background: '#f4f4f5', foreground: '#18181b' },
  },
  {
    id: 'stone',
    label: 'Piedra',
    description: 'Gris cálido ↔ arena clara',
    light: { background: '#57534e', foreground: '#fafaf9' },
    dark: { background: '#e7e5e4', foreground: '#1c1917' },
  },
  {
    id: 'cloud',
    label: 'Nube',
    description: 'Sidebar claro ↔ slate oscuro',
    light: { background: '#f1f5f9', foreground: '#0f172a' },
    dark: { background: '#0f172a', foreground: '#f8fafc' },
  },
  {
    id: 'ocean',
    label: 'Océano',
    description: 'Azul profundo ↔ aqua claro',
    light: { background: '#0c4a6e', foreground: '#f0f9ff' },
    dark: { background: '#e0f2fe', foreground: '#0c4a6e' },
  },
  {
    id: 'forest',
    label: 'Bosque',
    description: 'Verde oscuro ↔ menta',
    light: { background: '#14532d', foreground: '#f0fdf4' },
    dark: { background: '#dcfce7', foreground: '#14532d' },
  },
  {
    id: 'wine',
    label: 'Vino',
    description: 'Burdeos ↔ rosa claro',
    light: { background: '#4c0519', foreground: '#fff1f2' },
    dark: { background: '#ffe4e6', foreground: '#4c0519' },
  },
];

export function getSidebarPreset(id: string | null | undefined): SidebarPreset {
  return SIDEBAR_PRESETS.find((p) => p.id === id) ?? SIDEBAR_PRESETS[0];
}

export function resolveSidebarTone(
  preset: SidebarPreset,
  theme: 'light' | 'dark',
): SidebarTone {
  return theme === 'dark' ? preset.dark : preset.light;
}

export function isSidebarPresetId(value: string): value is SidebarPresetId {
  return SIDEBAR_PRESETS.some((p) => p.id === value);
}
