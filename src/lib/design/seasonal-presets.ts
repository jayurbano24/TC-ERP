import type { SidebarPresetId } from './sidebar-presets';

/**
 * Temas de apariencia (clásico + estaciones + Navidad).
 * Se aplican en ERP (acento/sidebar) y atmósfera del login.
 */
export type SeasonPresetId =
  | 'classic'
  | 'spring'
  | 'summer'
  | 'autumn'
  | 'winter'
  | 'christmas';

export type SeasonPreset = {
  id: SeasonPresetId;
  label: string;
  description: string;
  /** Swatch para la tarjeta de selección */
  swatch: string;
  accent: string;
  accentForeground: string;
  sidebarId: SidebarPresetId;
  login: {
    blob1: string;
    blob2: string;
    ribbon: string;
  };
};

export const SEASON_STORAGE_KEY = 'tcerp_season';
export const DEFAULT_SEASON_ID: SeasonPresetId = 'classic';

/** Único usuario autorizado a ver/editar Tema / Colores en Configuración. */
export const THEME_CONFIG_ALLOWED_EMAIL = 'gurbano@techcommwireless.com';

export function canConfigureThemes(email: string | null | undefined): boolean {
  return String(email || '').trim().toLowerCase() === THEME_CONFIG_ALLOWED_EMAIL;
}

export const SEASON_PRESETS: SeasonPreset[] = [
  {
    id: 'classic',
    label: 'Clásico TC',
    description: 'Apariencia corporativa Tech Corps',
    swatch: '#2ec4f1',
    accent: '#2ec4f1',
    accentForeground: '#0a0e17',
    sidebarId: 'navy',
    login: {
      blob1: 'color-mix(in srgb, #2ec4f1 22%, transparent)',
      blob2: 'color-mix(in srgb, #181c3a 14%, transparent)',
      ribbon: '#2ec4f1',
    },
  },
  {
    id: 'spring',
    label: 'Primavera',
    description: 'Verdes frescos y floración',
    swatch: '#86efac',
    accent: '#22c55e',
    accentForeground: '#052e16',
    sidebarId: 'forest',
    login: {
      blob1: 'color-mix(in srgb, #86efac 45%, transparent)',
      blob2: 'color-mix(in srgb, #f9a8d4 35%, transparent)',
      ribbon: '#4ade80',
    },
  },
  {
    id: 'summer',
    label: 'Verano',
    description: 'Turquesa, sol y costa',
    swatch: '#22d3ee',
    accent: '#06b6d4',
    accentForeground: '#083344',
    sidebarId: 'ocean',
    login: {
      blob1: 'color-mix(in srgb, #fde047 40%, transparent)',
      blob2: 'color-mix(in srgb, #22d3ee 40%, transparent)',
      ribbon: '#06b6d4',
    },
  },
  {
    id: 'autumn',
    label: 'Otoño',
    description: 'Ámbar, hojas y tierra',
    swatch: '#f97316',
    accent: '#ea580c',
    accentForeground: '#fff7ed',
    sidebarId: 'wine',
    login: {
      blob1: 'color-mix(in srgb, #fb923c 42%, transparent)',
      blob2: 'color-mix(in srgb, #78350f 28%, transparent)',
      ribbon: '#c2410c',
    },
  },
  {
    id: 'winter',
    label: 'Invierno',
    description: 'Pinos, nieve y bosque',
    swatch: '#166534',
    accent: '#15803d',
    accentForeground: '#f0fdf4',
    sidebarId: 'forest',
    login: {
      blob1: 'color-mix(in srgb, #93c5fd 35%, transparent)',
      blob2: 'color-mix(in srgb, #14532d 30%, transparent)',
      ribbon: '#166534',
    },
  },
  {
    id: 'christmas',
    label: 'Navidad',
    description: 'Rojo, verde y luces festivas',
    swatch: '#dc2626',
    accent: '#dc2626',
    accentForeground: '#fff1f2',
    sidebarId: 'wine',
    login: {
      blob1: 'color-mix(in srgb, #dc2626 38%, transparent)',
      blob2: 'color-mix(in srgb, #166534 32%, transparent)',
      ribbon: '#b91c1c',
    },
  },
];

export function getSeasonPreset(id: string | null | undefined): SeasonPreset {
  return SEASON_PRESETS.find((p) => p.id === id) ?? SEASON_PRESETS[0];
}

export function isSeasonPresetId(value: string): value is SeasonPresetId {
  return SEASON_PRESETS.some((p) => p.id === value);
}
