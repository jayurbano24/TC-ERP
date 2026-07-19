"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Moon,
  Palette,
  PanelLeft,
  RotateCcw,
  Save,
  Sparkles,
  Sun,
  Type,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { appearanceEquals, type AppearancePrefs } from "@/lib/design/appearance";
import {
  ACCENT_PRESETS,
  getAccentPreset,
  type AccentPresetId,
} from "@/lib/design/accent-presets";
import { FONT_PRESETS, type FontPresetId } from "@/lib/design/font-presets";
import { getInkPreset, INK_PRESETS, type InkPresetId } from "@/lib/design/ink-presets";
import {
  getSeasonPreset,
  SEASON_PRESETS,
  type SeasonPresetId,
} from "@/lib/design/seasonal-presets";
import {
  getSidebarPreset,
  resolveSidebarTone,
  SIDEBAR_PRESETS,
  type SidebarPresetId,
} from "@/lib/design/sidebar-presets";
import { notify } from "@/components/ui";
import { LoginSeasonBadge } from "@/components/auth/LoginSeasonalScene";

export function ThemeColorsView() {
  const {
    theme,
    accentId,
    fontId,
    sidebarId,
    inkId,
    seasonId,
    previewAppearance,
    saveAppearance,
    restoreAppearance,
  } = useTheme();

  const savedPrefs = useMemo<AppearancePrefs>(
    () => ({ theme, accentId, fontId, sidebarId, inkId, seasonId }),
    [theme, accentId, fontId, sidebarId, inkId, seasonId],
  );

  const [draft, setDraft] = useState<AppearancePrefs>(savedPrefs);

  useEffect(() => {
    setDraft(savedPrefs);
  }, [savedPrefs]);

  // If user leaves with unsaved preview, restore last saved prefs
  useEffect(() => {
    return () => {
      restoreAppearance();
    };
  }, [restoreAppearance]);

  const dirty = !appearanceEquals(draft, savedPrefs);

  const updateDraft = (patch: Partial<AppearancePrefs>) => {
    setDraft((prev) => {
      let next = { ...prev, ...patch };
      if (patch.seasonId) {
        const season = getSeasonPreset(patch.seasonId);
        next = { ...next, sidebarId: season.sidebarId, seasonId: patch.seasonId };
      } else if (patch.accentId) {
        // Acento manual: salir del pack estacional
        next = { ...next, seasonId: 'classic' };
      }
      previewAppearance(next);
      return next;
    });
  };

  const handleSave = () => {
    saveAppearance(draft);
    notify.success("Apariencia guardada", {
      description: "Tema, tipografía, colores y sidebar aplicados en este navegador.",
    });
  };

  const handleDiscard = () => {
    setDraft(savedPrefs);
    restoreAppearance();
    notify.warning("Cambios descartados", {
      description: "Se restauró la última configuración guardada.",
    });
  };

  const accent = getAccentPreset(draft.accentId);
  const sidebarPreset = getSidebarPreset(draft.sidebarId);
  const sidebar = resolveSidebarTone(sidebarPreset, draft.theme);
  const ink = getInkPreset(draft.inkId);
  const inkTone = draft.theme === "dark" ? ink.dark : ink.light;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-[var(--card-shadow)] sm:p-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <Palette className="h-6 w-6" aria-hidden />
            </div>
            <div>
              <h2 className="text-lg font-bold text-heading">Tema y colores</h2>
              <p className="mt-1 text-sm text-muted">
                Seleccione opciones y pulse <strong>Guardar</strong> para
                aplicarlas en todo el ERP.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDiscard}
              disabled={!dirty}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-muted transition-colors hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              Descartar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-accent-foreground transition-colors hover:bg-accent/90 disabled:pointer-events-none disabled:opacity-40"
            >
              <Save className="h-4 w-4" aria-hidden />
              Guardar
            </button>
          </div>
        </div>

        {dirty ? (
          <p className="mb-6 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
            Hay cambios sin guardar. La vista previa ya refleja el borrador; pulse
            Guardar para confirmarlos.
          </p>
        ) : null}

        <div className="mb-8">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Temas de temporada ({SEASON_PRESETS.length})
          </p>
          <p className="mb-3 text-xs text-muted">
            Incluye acento, sidebar y atmósfera del login. Clásico restaura el look
            corporativo TC.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {SEASON_PRESETS.map((preset) => {
              const selected = draft.seasonId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() =>
                    updateDraft({ seasonId: preset.id as SeasonPresetId })
                  }
                  className={[
                    "flex flex-col gap-3 rounded-xl border p-3 text-left transition-colors",
                    selected
                      ? "border-accent bg-accent/10 ring-2 ring-accent/30"
                      : "border-border bg-surface-hover hover:border-accent/40",
                  ].join(" ")}
                  aria-pressed={selected}
                >
                  <span
                    className="relative flex h-16 w-full items-end justify-between overflow-hidden rounded-lg px-2 py-1.5"
                    style={{
                      background: `linear-gradient(135deg, ${preset.login.blob1}, ${preset.swatch} 55%, ${preset.login.blob2})`,
                    }}
                  >
                    <span className="absolute left-2 top-2 scale-90 opacity-90">
                      {preset.id !== 'classic' ? (
                        <LoginSeasonBadge seasonId={preset.id} />
                      ) : (
                        <span
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-black text-white"
                          style={{ background: preset.accent }}
                        >
                          TC
                        </span>
                      )}
                    </span>
                    <span
                      className="h-1.5 w-10 rounded-full"
                      style={{ background: preset.login.ribbon }}
                    />
                    {selected ? (
                      <Check className="h-4 w-4 text-white drop-shadow" aria-hidden />
                    ) : null}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground">
                      {preset.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted">
                      {preset.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-8">
          <p className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
            Modo de apariencia
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                { id: "light" as const, label: "Claro", hint: "Fondos claros", Icon: Sun },
                {
                  id: "dark" as const,
                  label: "Oscuro",
                  hint: "Alta densidad nocturna",
                  Icon: Moon,
                },
              ] as const
            ).map(({ id, label, hint, Icon }) => {
              const selected = draft.theme === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => updateDraft({ theme: id })}
                  className={[
                    "flex min-h-14 items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                    selected
                      ? "border-accent bg-accent/10"
                      : "border-border bg-surface-hover hover:border-accent/40",
                  ].join(" ")}
                >
                  <Icon className="h-5 w-5 text-accent" aria-hidden />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{label}</p>
                    <p className="text-xs text-muted">{hint}</p>
                  </div>
                  {selected ? (
                    <Check className="ml-auto h-4 w-4 text-accent" aria-hidden />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-8">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
            <Type className="h-3.5 w-3.5" aria-hidden />
            Tipografía
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FONT_PRESETS.map((preset) => {
              const selected = draft.fontId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => updateDraft({ fontId: preset.id as FontPresetId })}
                  className={[
                    "rounded-xl border p-4 text-left transition-colors",
                    selected
                      ? "border-accent bg-accent/10 ring-2 ring-accent/30"
                      : "border-border bg-surface-hover hover:border-accent/40",
                  ].join(" ")}
                  aria-pressed={selected}
                  style={{ fontFamily: preset.stack }}
                >
                  <p className="text-lg font-semibold text-foreground">{preset.label}</p>
                  <p className="mt-1 text-xs text-muted">{preset.description}</p>
                  <p className="mt-3 text-sm text-foreground/80">Aa Bb Cc · Dashboard 123</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-8">
          <p className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
            Color de letras
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {INK_PRESETS.map((preset) => {
              const selected = draft.inkId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => updateDraft({ inkId: preset.id as InkPresetId })}
                  className={[
                    "flex flex-col gap-3 rounded-xl border p-3 text-left transition-colors",
                    selected
                      ? "border-accent bg-accent/10 ring-2 ring-accent/30"
                      : "border-border bg-surface-hover hover:border-accent/40",
                  ].join(" ")}
                  aria-pressed={selected}
                >
                  <span
                    className="flex h-10 w-full items-center justify-center rounded-lg border border-border/60 bg-surface text-sm font-bold"
                    style={{ color: preset.swatch }}
                  >
                    Aa
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground">
                      {preset.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted">
                      {preset.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-8">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
            <PanelLeft className="h-3.5 w-3.5" aria-hidden />
            Color del sidebar
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SIDEBAR_PRESETS.map((preset) => {
              const selected = draft.sidebarId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() =>
                    updateDraft({ sidebarId: preset.id as SidebarPresetId })
                  }
                  className={[
                    "flex flex-col gap-3 rounded-xl border p-3 text-left transition-colors",
                    selected
                      ? "border-accent bg-accent/10 ring-2 ring-accent/30"
                      : "border-border bg-surface-hover hover:border-accent/40",
                  ].join(" ")}
                  aria-pressed={selected}
                >
                  <span className="flex h-12 w-full gap-1 overflow-hidden rounded-lg">
                    <span
                      className="flex flex-1 items-end px-1.5 py-1 text-[9px] font-semibold"
                      style={{
                        backgroundColor: preset.light.background,
                        color: preset.light.foreground,
                      }}
                    >
                      Claro
                    </span>
                    <span
                      className="flex flex-1 items-end px-1.5 py-1 text-[9px] font-semibold"
                      style={{
                        backgroundColor: preset.dark.background,
                        color: preset.dark.foreground,
                      }}
                    >
                      Oscuro
                    </span>
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground">
                      {preset.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted">
                      {preset.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
            Color de acento
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ACCENT_PRESETS.map((preset) => {
              const selected = draft.accentId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() =>
                    updateDraft({ accentId: preset.id as AccentPresetId })
                  }
                  className={[
                    "flex flex-col gap-3 rounded-xl border p-3 text-left transition-colors",
                    selected
                      ? "border-accent bg-accent/10 ring-2 ring-accent/30"
                      : "border-border bg-surface-hover hover:border-accent/40",
                  ].join(" ")}
                  aria-pressed={selected}
                >
                  <span
                    className="flex h-10 w-full items-center justify-center rounded-lg text-xs font-bold"
                    style={{
                      backgroundColor: preset.accent,
                      color: preset.accentForeground,
                    }}
                  >
                    Aa
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground">
                      {preset.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted">
                      {preset.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div
        className="rounded-2xl border border-border p-5"
        style={{
          backgroundColor: sidebar.background,
          color: sidebar.foreground,
          fontFamily: "var(--font-sans)",
        }}
      >
        <p className="mb-3 text-xs font-semibold tracking-wide uppercase opacity-50">
          Vista previa del menú
        </p>
        <div className="flex max-w-xs flex-col gap-1.5">
          <div
            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold"
            style={{
              backgroundColor: accent.accent,
              color: accent.accentForeground,
            }}
          >
            <span className="h-2 w-2 rounded-full bg-current opacity-70" />
            Dashboard · activo
          </div>
          <div className="rounded-xl px-3 py-2.5 text-sm font-medium opacity-70">
            Consulta
          </div>
          <div className="rounded-xl px-3 py-2.5 text-sm font-medium opacity-70">
            Recursos Humanos
          </div>
        </div>
        <p className="mt-4 text-xs opacity-70" style={{ color: inkTone.muted }}>
          Texto de contenido:{" "}
          <span style={{ color: inkTone.foreground }}>{ink.label}</span>
        </p>
      </div>

      <div className="sticky bottom-4 z-20 flex justify-end gap-2 sm:hidden">
        <button
          type="button"
          onClick={handleDiscard}
          disabled={!dirty}
          className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold shadow-lg disabled:opacity-40"
        >
          Descartar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty}
          className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-accent-foreground shadow-lg disabled:opacity-40"
        >
          <Save className="h-4 w-4" aria-hidden />
          Guardar
        </button>
      </div>
    </div>
  );
}
