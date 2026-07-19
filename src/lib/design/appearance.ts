import type { AccentPresetId } from './accent-presets';
import type { FontPresetId } from './font-presets';
import type { InkPresetId } from './ink-presets';
import type { SeasonPresetId } from './seasonal-presets';
import type { SidebarPresetId } from './sidebar-presets';

export type AppearanceTheme = 'light' | 'dark';

export type AppearancePrefs = {
  theme: AppearanceTheme;
  accentId: AccentPresetId;
  fontId: FontPresetId;
  sidebarId: SidebarPresetId;
  inkId: InkPresetId;
  seasonId: SeasonPresetId;
};

export function appearanceEquals(a: AppearancePrefs, b: AppearancePrefs): boolean {
  return (
    a.theme === b.theme &&
    a.accentId === b.accentId &&
    a.fontId === b.fontId &&
    a.sidebarId === b.sidebarId &&
    a.inkId === b.inkId &&
    a.seasonId === b.seasonId
  );
}
