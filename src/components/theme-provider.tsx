"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import {
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT_ID,
  getAccentPreset,
  isAccentPresetId,
  type AccentPreset,
  type AccentPresetId,
} from "@/lib/design/accent-presets";
import type { AppearancePrefs, AppearanceTheme } from "@/lib/design/appearance";
import {
  DEFAULT_FONT_ID,
  FONT_STORAGE_KEY,
  getFontPreset,
  isFontPresetId,
  type FontPreset,
  type FontPresetId,
} from "@/lib/design/font-presets";
import {
  DEFAULT_INK_ID,
  INK_STORAGE_KEY,
  getInkPreset,
  isInkPresetId,
  type InkPreset,
  type InkPresetId,
} from "@/lib/design/ink-presets";
import {
  DEFAULT_SEASON_ID,
  SEASON_STORAGE_KEY,
  getSeasonPreset,
  isSeasonPresetId,
  type SeasonPreset,
  type SeasonPresetId,
} from "@/lib/design/seasonal-presets";
import {
  DEFAULT_SIDEBAR_ID,
  SIDEBAR_STORAGE_KEY,
  getSidebarPreset,
  isSidebarPresetId,
  resolveSidebarTone,
  type SidebarPreset,
  type SidebarPresetId,
  type SidebarTone,
} from "@/lib/design/sidebar-presets";

type Theme = AppearanceTheme;

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  accentId: AccentPresetId;
  accent: AccentPreset;
  setAccentId: (id: AccentPresetId) => void;
  fontId: FontPresetId;
  font: FontPreset;
  setFontId: (id: FontPresetId) => void;
  sidebarId: SidebarPresetId;
  /** Tone activo según el tema claro/oscuro actual. */
  sidebar: SidebarTone;
  setSidebarId: (id: SidebarPresetId) => void;
  inkId: InkPresetId;
  ink: InkPreset;
  setInkId: (id: InkPresetId) => void;
  seasonId: SeasonPresetId;
  season: SeasonPreset;
  setSeasonId: (id: SeasonPresetId) => void;
  /** Apply without persisting (draft preview). */
  previewAppearance: (prefs: AppearancePrefs) => void;
  /** Persist + apply + update saved state. */
  saveAppearance: (prefs: AppearancePrefs) => void;
  /** Re-apply last saved prefs (discard draft preview). */
  restoreAppearance: () => void;
  getAppearancePrefs: () => AppearancePrefs;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function resolveTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const saved = localStorage.getItem("theme") as Theme | null;
    if (saved === "light" || saved === "dark") return saved;
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  } catch {
    /* private mode */
  }
  return "light";
}

function resolveStoredId<T extends string>(
  key: string,
  isValid: (v: string) => v is T,
  fallback: T,
): T {
  if (typeof window === "undefined") return fallback;
  try {
    const saved = localStorage.getItem(key);
    if (saved && isValid(saved)) return saved;
  } catch {
    /* private mode */
  }
  return fallback;
}

function persist(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

function applyThemeMode(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.classList.toggle("dark", theme === "dark");
}

function applyAccent(preset: AccentPreset) {
  const root = document.documentElement;
  root.style.setProperty("--accent", preset.accent);
  root.style.setProperty("--accent-foreground", preset.accentForeground);
  root.setAttribute("data-accent", preset.id);
}

function applyFont(preset: FontPreset) {
  const root = document.documentElement;
  root.style.setProperty("--font-sans", preset.stack);
  root.setAttribute("data-font", preset.id);
}

function applySidebar(preset: SidebarPreset, theme: Theme) {
  const tone = resolveSidebarTone(preset, theme);
  const root = document.documentElement;
  root.style.setProperty("--sidebar", tone.background);
  root.style.setProperty("--sidebar-foreground", tone.foreground);
  root.setAttribute("data-sidebar", preset.id);
}

function applyInk(preset: InkPreset, theme: Theme) {
  const root = document.documentElement;
  root.setAttribute("data-ink", preset.id);
  if (preset.id === "auto") {
    root.style.removeProperty("--foreground");
    root.style.removeProperty("--heading");
    root.style.removeProperty("--muted");
    return;
  }
  const tone = theme === "dark" ? preset.dark : preset.light;
  root.style.setProperty("--foreground", tone.foreground);
  root.style.setProperty("--heading", tone.heading);
  root.style.setProperty("--muted", tone.muted);
}

function applySeason(preset: SeasonPreset, accentFromId: AccentPreset) {
  const root = document.documentElement;
  root.setAttribute("data-season", preset.id);
  root.style.setProperty("--login-blob-1", preset.login.blob1);
  root.style.setProperty("--login-blob-2", preset.login.blob2);
  root.style.setProperty("--login-ribbon", preset.login.ribbon);

  if (preset.id === "classic") {
    applyAccent(accentFromId);
  } else {
    applyAccent({
      id: accentFromId.id,
      label: preset.label,
      description: preset.description,
      accent: preset.accent,
      accentForeground: preset.accentForeground,
    });
  }
}

function applyAppearancePrefs(prefs: AppearancePrefs) {
  applyThemeMode(prefs.theme);
  applyFont(getFontPreset(prefs.fontId));
  applySidebar(getSidebarPreset(prefs.sidebarId), prefs.theme);
  applyInk(getInkPreset(prefs.inkId), prefs.theme);
  applySeason(getSeasonPreset(prefs.seasonId), getAccentPreset(prefs.accentId));
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [accentId, setAccentIdState] = useState<AccentPresetId>(DEFAULT_ACCENT_ID);
  const [fontId, setFontIdState] = useState<FontPresetId>(DEFAULT_FONT_ID);
  const [sidebarId, setSidebarIdState] = useState<SidebarPresetId>(DEFAULT_SIDEBAR_ID);
  const [inkId, setInkIdState] = useState<InkPresetId>(DEFAULT_INK_ID);
  const [seasonId, setSeasonIdState] = useState<SeasonPresetId>(DEFAULT_SEASON_ID);

  const getAppearancePrefs = useCallback(
    (): AppearancePrefs => ({
      theme,
      accentId,
      fontId,
      sidebarId,
      inkId,
      seasonId,
    }),
    [theme, accentId, fontId, sidebarId, inkId, seasonId],
  );

  // DOM + estado React: el boot script ya puso data-theme; aquí reaplicamos
  // acento/sidebar/ink y sincronizamos el contexto antes del paint.
  useLayoutEffect(() => {
    const next: AppearancePrefs = {
      theme: resolveTheme(),
      accentId: resolveStoredId(ACCENT_STORAGE_KEY, isAccentPresetId, DEFAULT_ACCENT_ID),
      fontId: resolveStoredId(FONT_STORAGE_KEY, isFontPresetId, DEFAULT_FONT_ID),
      sidebarId: resolveStoredId(SIDEBAR_STORAGE_KEY, isSidebarPresetId, DEFAULT_SIDEBAR_ID),
      inkId: resolveStoredId(INK_STORAGE_KEY, isInkPresetId, DEFAULT_INK_ID),
      seasonId: resolveStoredId(SEASON_STORAGE_KEY, isSeasonPresetId, DEFAULT_SEASON_ID),
    };
    applyAppearancePrefs(next);
    setThemeState(next.theme);
    setAccentIdState(next.accentId);
    setFontIdState(next.fontId);
    setSidebarIdState(next.sidebarId);
    setInkIdState(next.inkId);
    setSeasonIdState(next.seasonId);
  }, []);

  // Multi-pestaña: si cambian el tema en otra ventana, reaplicar aquí.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (
        event.key &&
        event.key !== "theme" &&
        event.key !== ACCENT_STORAGE_KEY &&
        event.key !== FONT_STORAGE_KEY &&
        event.key !== SIDEBAR_STORAGE_KEY &&
        event.key !== INK_STORAGE_KEY &&
        event.key !== SEASON_STORAGE_KEY
      ) {
        return;
      }
      const next: AppearancePrefs = {
        theme: resolveTheme(),
        accentId: resolveStoredId(ACCENT_STORAGE_KEY, isAccentPresetId, DEFAULT_ACCENT_ID),
        fontId: resolveStoredId(FONT_STORAGE_KEY, isFontPresetId, DEFAULT_FONT_ID),
        sidebarId: resolveStoredId(SIDEBAR_STORAGE_KEY, isSidebarPresetId, DEFAULT_SIDEBAR_ID),
        inkId: resolveStoredId(INK_STORAGE_KEY, isInkPresetId, DEFAULT_INK_ID),
        seasonId: resolveStoredId(SEASON_STORAGE_KEY, isSeasonPresetId, DEFAULT_SEASON_ID),
      };
      setThemeState(next.theme);
      setAccentIdState(next.accentId);
      setFontIdState(next.fontId);
      setSidebarIdState(next.sidebarId);
      setInkIdState(next.inkId);
      setSeasonIdState(next.seasonId);
      applyAppearancePrefs(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persistAppearance = (prefs: AppearancePrefs) => {
    persist("theme", prefs.theme);
    persist(ACCENT_STORAGE_KEY, prefs.accentId);
    persist(FONT_STORAGE_KEY, prefs.fontId);
    persist(SIDEBAR_STORAGE_KEY, prefs.sidebarId);
    persist(INK_STORAGE_KEY, prefs.inkId);
    persist(SEASON_STORAGE_KEY, prefs.seasonId);
  };

  const previewAppearance = useCallback((prefs: AppearancePrefs) => {
    applyAppearancePrefs(prefs);
  }, []);

  const saveAppearance = useCallback((prefs: AppearancePrefs) => {
    setThemeState(prefs.theme);
    setAccentIdState(prefs.accentId);
    setFontIdState(prefs.fontId);
    setSidebarIdState(prefs.sidebarId);
    setInkIdState(prefs.inkId);
    setSeasonIdState(prefs.seasonId);
    persistAppearance(prefs);
    applyAppearancePrefs(prefs);
  }, []);

  const restoreAppearance = useCallback(() => {
    applyAppearancePrefs({
      theme,
      accentId,
      fontId,
      sidebarId,
      inkId,
      seasonId,
    });
  }, [theme, accentId, fontId, sidebarId, inkId, seasonId]);

  const setTheme = useCallback(
    (next: Theme) => {
      saveAppearance({
        theme: next,
        accentId,
        fontId,
        sidebarId,
        inkId,
        seasonId,
      });
    },
    [saveAppearance, accentId, fontId, sidebarId, inkId, seasonId],
  );

  const toggleTheme = useCallback(() => {
    // Preferir DOM (boot script / preview) sobre estado React aún no sincronizado.
    const fromDom = document.documentElement.getAttribute("data-theme");
    const current: Theme =
      fromDom === "dark" || fromDom === "light" ? fromDom : theme;
    setTheme(current === "light" ? "dark" : "light");
  }, [setTheme, theme]);

  const setAccentId = useCallback(
    (id: AccentPresetId) => {
      // Ajuste fino de acento: vuelve a clásico para no pelear con estación
      saveAppearance({
        theme,
        accentId: id,
        fontId,
        sidebarId,
        inkId,
        seasonId: "classic",
      });
    },
    [saveAppearance, theme, fontId, sidebarId, inkId],
  );

  const setFontId = useCallback(
    (id: FontPresetId) => {
      saveAppearance({ theme, accentId, fontId: id, sidebarId, inkId, seasonId });
    },
    [saveAppearance, theme, accentId, sidebarId, inkId, seasonId],
  );

  const setSidebarId = useCallback(
    (id: SidebarPresetId) => {
      saveAppearance({ theme, accentId, fontId, sidebarId: id, inkId, seasonId });
    },
    [saveAppearance, theme, accentId, fontId, inkId, seasonId],
  );

  const setInkId = useCallback(
    (id: InkPresetId) => {
      saveAppearance({ theme, accentId, fontId, sidebarId, inkId: id, seasonId });
    },
    [saveAppearance, theme, accentId, fontId, sidebarId, seasonId],
  );

  const setSeasonId = useCallback(
    (id: SeasonPresetId) => {
      const season = getSeasonPreset(id);
      saveAppearance({
        theme,
        accentId,
        fontId,
        sidebarId: season.sidebarId,
        inkId,
        seasonId: id,
      });
    },
    [saveAppearance, theme, accentId, fontId, inkId],
  );

  const season = getSeasonPreset(seasonId);
  const accentResolved: AccentPreset =
    seasonId === "classic"
      ? getAccentPreset(accentId)
      : {
          ...getAccentPreset(accentId),
          accent: season.accent,
          accentForeground: season.accentForeground,
          label: season.label,
          description: season.description,
        };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
        setTheme,
        accentId,
        accent: accentResolved,
        setAccentId,
        fontId,
        font: getFontPreset(fontId),
        setFontId,
        sidebarId,
        sidebar: resolveSidebarTone(getSidebarPreset(sidebarId), theme),
        setSidebarId,
        inkId,
        ink: getInkPreset(inkId),
        setInkId,
        seasonId,
        season,
        setSeasonId,
        previewAppearance,
        saveAppearance,
        restoreAppearance,
        getAppearancePrefs,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
