/**
 * Política de backfill de pre-diagnóstico (stock histórico).
 *
 * No ejecuta SQL; define repartos determinísticos y payloads sintéticos
 * alineados al catálogo filtrado por tecnología/marca/modelo.
 *
 * Mezcla carcasa (sobre población asignada): A 11.5%, B 45%, C 25%, D 18%.
 * Dictamen (sobre no-scrap): RC reacondicionado 60%, RP reparado 40%; scrap → irreparable.
 *
 * Reparados: marcar ítems cosméticos/funcionamiento del catálogo del modelo
 * según temas (puertos oxidados, antena rota, etc.) solo si el ítem existe en perfil.
 *
 * Fechas (creado_en / actualizado_en): 80% entre ingreso+3d e ingreso+5d;
 * 20% posteriores a ingreso+5d (hasta +30d), sin superar `asOf`.
 */

import type { PrediagnosticoCatalogRow } from './resolvePrediagnosticoCatalog';
import type { ShellClass, Verdict } from './validatePrediagnostico';

/** Pesos carcasa en base 1000 (11.5 + 45 + 25 + 18 = 99.5 → 115+450+250+180). C↔D vs mix original. */
export const SHELL_CLASS_WEIGHTS: ReadonlyArray<{ shell: ShellClass; weight: number }> = [
  { shell: 'A', weight: 115 },
  { shell: 'B', weight: 450 },
  { shell: 'C', weight: 250 },
  { shell: 'D', weight: 180 },
];

export const VERDICT_REACONDICIONADO_WEIGHT = 600;
export const VERDICT_REPARADO_WEIGHT = 400;
export const VERDICT_WEIGHT_BASIS = 1000;

/** 80% pre-diagnóstico entre día 3 y 5 post-ingreso; 20% después del día 5. */
export const PREDIAG_WITHIN_3_TO_5_DAYS_WEIGHT = 800;
export const PREDIAG_AFTER_5_DAYS_WEIGHT = 200;
export const PREDIAG_DAYS_MIN_AFTER_INGRESS = 3;
export const PREDIAG_DAYS_MAX_WITHIN_WINDOW = 5;
export const PREDIAG_LATE_MIN_DAYS_AFTER_INGRESS = 6;
export const PREDIAG_LATE_MAX_DAYS_AFTER_INGRESS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type BackfillDefectTheme = {
  id: string;
  label: string;
  /** Coincidencia sobre nombre del ítem en catálogo (es). */
  namePatterns: RegExp[];
  /** Valor cosmético o de funcionamiento al aplicar el tema. */
  cosmeticValue?: 'danado';
  functionValue?: 'no';
  preferredKind: 'cosmetico' | 'funcionamiento' | 'either';
};

/**
 * Temas operativos para equipos en dictamen reparado.
 * Solo se aplican si el modelo tiene un ítem cuyo nombre coincide (perfil + tech/marca).
 */
export const REPAIR_DEFECT_THEMES: readonly BackfillDefectTheme[] = [
  {
    id: 'oxidized_ports',
    label: 'Puertos oxidados',
    namePatterns: [/oxid/i, /óxid/i, /corrosi/i],
    cosmeticValue: 'danado',
    preferredKind: 'cosmetico',
  },
  {
    id: 'mechanical_port_defect',
    label: 'Puertos con defectos mecánicos',
    namePatterns: [/mec[aá]nic/i, /defecto.*puerto/i, /puerto.*da[ñn]/i],
    cosmeticValue: 'danado',
    preferredKind: 'cosmetico',
  },
  {
    id: 'casing_damage',
    label: 'Carcasa deformada / dañada / rota',
    namePatterns: [/carcasa/i, /deform/i, /golpe/i, /fisura/i, /rota/i],
    cosmeticValue: 'danado',
    preferredKind: 'cosmetico',
  },
  {
    id: 'broken_antenna',
    label: 'Antena rota',
    namePatterns: [/antena/i],
    cosmeticValue: 'danado',
    preferredKind: 'cosmetico',
  },
  {
    id: 'broken_pins',
    label: 'Pines quebrados',
    namePatterns: [/pin/i, /conector.*da[ñn]/i],
    cosmeticValue: 'danado',
    preferredKind: 'cosmetico',
  },
  {
    id: 'rf_port_broken',
    label: 'Puerto RF quebrado',
    namePatterns: [/\brf\b/i, /coax/i, /f\s*connector/i, /puerto.*rf/i],
    cosmeticValue: 'danado',
    preferredKind: 'cosmetico',
  },
  {
    id: 'hard_buttons',
    label: 'Botones duros',
    namePatterns: [/bot[oó]n/i, /button/i, /reset/i],
    functionValue: 'no',
    preferredKind: 'funcionamiento',
  },
  {
    id: 'label_damage',
    label: 'Etiqueta dañada',
    namePatterns: [/etiqueta/i, /label/i, /sticker/i],
    cosmeticValue: 'danado',
    preferredKind: 'cosmetico',
  },
  {
    id: 'wifi_antenna',
    label: 'Antenas WiFi',
    namePatterns: [/wifi.*antena/i, /antena.*wifi/i],
    cosmeticValue: 'danado',
    preferredKind: 'cosmetico',
  },
  {
    id: 'ethernet_ports',
    label: 'Puertos Ethernet',
    namePatterns: [/ethernet/i, /lan\s*\d/i, /puerto.*eth/i],
    cosmeticValue: 'danado',
    preferredKind: 'cosmetico',
  },
];

export type BackfillCatalogItem = Pick<PrediagnosticoCatalogRow, 'id' | 'name' | 'kind'>;

export type SyntheticPrediagnosticoPayload = {
  shellClass: ShellClass;
  verdict: Verdict;
  cosmetics: Record<string, string>;
  functionChecks: Record<string, string>;
  notes: string;
  /** Fecha sintética de registro (creado_en / actualizado_en). */
  recordedAt: Date;
};

export type PrediagBackfillTimingBucket = 'within_3_5_days' | 'after_5_days';

/** Slot 0..999 → clase carcasa según mix acordado. */
export function shellClassForSlot(slot: number): ShellClass {
  const s = ((slot % VERDICT_WEIGHT_BASIS) + VERDICT_WEIGHT_BASIS) % VERDICT_WEIGHT_BASIS;
  let acc = 0;
  for (const row of SHELL_CLASS_WEIGHTS) {
    acc += row.weight;
    if (s < acc) return row.shell;
  }
  return 'D';
}

/** Slot 0..999 → dictamen reacondicionado vs reparado (no usar en scrap). */
export function repairVerdictForSlot(slot: number): 'reacondicionado' | 'reparado' {
  const s = ((slot % VERDICT_WEIGHT_BASIS) + VERDICT_WEIGHT_BASIS) % VERDICT_WEIGHT_BASIS;
  return s < VERDICT_REACONDICIONADO_WEIGHT ? 'reacondicionado' : 'reparado';
}

function stableSlot(seed: string, basis = VERDICT_WEIGHT_BASIS): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h % basis;
}

function clampDateNotAfter(candidate: Date, asOf: Date): Date {
  return candidate.getTime() > asOf.getTime() ? new Date(asOf.getTime()) : candidate;
}

function addDaysAtWorkHour(base: Date, wholeDays: number, seed: string): Date {
  const d = new Date(base.getTime() + wholeDays * MS_PER_DAY);
  const hour = 8 + (stableSlot(`${seed}:h`, 9) % 9);
  const minute = stableSlot(`${seed}:m`, 60) % 60;
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Días calendario completos entre fecha de ingreso y fecha de pre-diagnóstico (ambos a 00:00). */
export function calendarDaysAfterIngress(ingressAt: Date, recordedAt: Date): number {
  const ingress = new Date(ingressAt);
  ingress.setHours(0, 0, 0, 0);
  const recorded = new Date(recordedAt);
  recorded.setHours(0, 0, 0, 0);
  return Math.round((recorded.getTime() - ingress.getTime()) / MS_PER_DAY);
}

/** @deprecated Preferir calendarDaysAfterIngress para reglas de negocio. */
export function daysAfterIngress(ingressAt: Date, recordedAt: Date): number {
  return calendarDaysAfterIngress(ingressAt, recordedAt);
}

export function classifyPrediagBackfillTiming(
  ingressAt: Date,
  recordedAt: Date
): PrediagBackfillTimingBucket {
  const days = calendarDaysAfterIngress(ingressAt, recordedAt);
  if (days >= PREDIAG_DAYS_MIN_AFTER_INGRESS && days <= PREDIAG_DAYS_MAX_WITHIN_WINDOW) {
    return 'within_3_5_days';
  }
  return 'after_5_days';
}

/**
 * Fecha de pre-diagnóstico backfill respecto a ingreso del equipo.
 * 80%: entre +3 y +5 días; 20%: +6 … +30 días (sin pasar `asOf`).
 */
export function backfillPrediagnosticoRecordedAt(
  ingressAt: Date,
  seed: string,
  asOf: Date = new Date()
): Date {
  const slot = stableSlot(`${seed}:prediagDate`);
  if (slot < PREDIAG_WITHIN_3_TO_5_DAYS_WEIGHT) {
    const span = PREDIAG_DAYS_MAX_WITHIN_WINDOW - PREDIAG_DAYS_MIN_AFTER_INGRESS + 1;
    const dayOffset = PREDIAG_DAYS_MIN_AFTER_INGRESS + (slot % span);
    return clampDateNotAfter(addDaysAtWorkHour(ingressAt, dayOffset, seed), asOf);
  }

  const lateSpan =
    PREDIAG_LATE_MAX_DAYS_AFTER_INGRESS - PREDIAG_LATE_MIN_DAYS_AFTER_INGRESS + 1;
  const lateOffset = PREDIAG_LATE_MIN_DAYS_AFTER_INGRESS + (slot % lateSpan);
  return clampDateNotAfter(addDaysAtWorkHour(ingressAt, lateOffset, `${seed}:late`), asOf);
}

function findItemForTheme(
  items: BackfillCatalogItem[],
  theme: BackfillDefectTheme
): BackfillCatalogItem | undefined {
  const kindFiltered =
    theme.preferredKind === 'either'
      ? items
      : items.filter((i) => i.kind === theme.preferredKind);
  return kindFiltered.find((item) => theme.namePatterns.some((re) => re.test(item.name)));
}

/** Ítems del catálogo ya filtrados por tech/marca/modelo. */
export function defaultChecksForItems(items: BackfillCatalogItem[]): {
  cosmetics: Record<string, string>;
  functionChecks: Record<string, string>;
} {
  const cosmetics: Record<string, string> = {};
  const functionChecks: Record<string, string> = {};
  for (const item of items) {
    if (item.kind === 'cosmetico') cosmetics[item.id] = 'bien';
    else functionChecks[item.id] = 'si';
  }
  return { cosmetics, functionChecks };
}

/**
 * Aplica 2–4 temas de reparación sobre ítems que existan para el modelo.
 * Nunca inventa IDs: solo claves del catálogo resuelto.
 */
export function applyRepairDefectThemes(
  items: BackfillCatalogItem[],
  seed: string,
  maxDefects = 3
): { cosmetics: Record<string, string>; functionChecks: Record<string, string> } {
  const base = defaultChecksForItems(items);
  const slot = stableSlot(`${seed}:defects`);
  const themes = [...REPAIR_DEFECT_THEMES];
  const start = slot % themes.length;
  let applied = 0;

  for (let i = 0; i < themes.length && applied < maxDefects; i += 1) {
    const theme = themes[(start + i) % themes.length];
    const match = findItemForTheme(items, theme);
    if (!match) continue;
    if (theme.cosmeticValue && match.kind === 'cosmetico') {
      base.cosmetics[match.id] = theme.cosmeticValue;
      applied += 1;
    } else if (theme.functionValue && match.kind === 'funcionamiento') {
      base.functionChecks[match.id] = theme.functionValue;
      applied += 1;
    } else if (theme.cosmeticValue && match.kind === 'funcionamiento') {
      base.functionChecks[match.id] = 'no';
      applied += 1;
    }
  }

  return base;
}

export type BuildSyntheticOptions = {
  serialOrOrderKey: string;
  /** Fecha de ingreso del equipo / OS (recepción o creación OS). */
  ingressAt: Date;
  /** Tope superior para fechas sintéticas (p. ej. fecha del backfill). */
  asOf?: Date;
  isScrap: boolean;
  scrapReason?: string;
  /** Ítems visibles para este equipo (filterPrediagnosticoCatalogForEquipment + perfil modelo). */
  catalogItems: BackfillCatalogItem[];
};

export function buildSyntheticPrediagnostico(options: BuildSyntheticOptions): SyntheticPrediagnosticoPayload {
  const { serialOrOrderKey, ingressAt, asOf, isScrap, scrapReason, catalogItems } = options;
  const slot = stableSlot(serialOrOrderKey);
  const shellClass = shellClassForSlot(slot);
  const recordedAt = backfillPrediagnosticoRecordedAt(ingressAt, serialOrOrderKey, asOf ?? new Date());

  if (isScrap) {
    const { cosmetics, functionChecks } = defaultChecksForItems(catalogItems);
    for (const item of catalogItems) {
      if (item.kind === 'cosmetico') cosmetics[item.id] = 'danado';
      else functionChecks[item.id] = 'no';
    }
    const reason =
      (scrapReason || '').trim() ||
      '[BACKFILL] Equipo en estatus scrap/irreparable en planta; dictamen irreparable.';
    return {
      shellClass: 'D',
      verdict: 'irreparable',
      cosmetics,
      functionChecks,
      notes: reason.startsWith('[BACKFILL]') ? reason : `[BACKFILL] ${reason}`,
      recordedAt,
    };
  }

  const verdict = repairVerdictForSlot(slot);
  if (verdict === 'reacondicionado') {
    const { cosmetics, functionChecks } = defaultChecksForItems(catalogItems);
    const shell =
      shellClass === 'D' ? 'B' : shellClass === 'C' && slot % 3 === 0 ? 'B' : shellClass;
    return {
      shellClass: shell,
      verdict: 'reacondicionado',
      cosmetics,
      functionChecks,
      notes: '[BACKFILL] Pre-diagnóstico sintético — reacondicionado (stock histórico).',
      recordedAt,
    };
  }

  const { cosmetics, functionChecks } = applyRepairDefectThemes(catalogItems, serialOrOrderKey);
  const shellForRepair: ShellClass =
    shellClass === 'A' ? 'B' : shellClass === 'D' ? 'C' : shellClass;

  return {
    shellClass: shellForRepair,
    verdict: 'reparado',
    cosmetics,
    functionChecks,
    notes:
      '[BACKFILL] Pre-diagnóstico sintético — reparado; defectos según catálogo del modelo/tecnología.',
    recordedAt,
  };
}

/** Conteo esperado de carcasas en N equipos (útil para dry-run). */
export function expectedShellCounts(total: number): Record<ShellClass, number> {
  const out: Record<ShellClass, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (let i = 0; i < total; i += 1) {
    out[shellClassForSlot(i)] += 1;
  }
  return out;
}

/** Distribución de buckets de fecha en N equipos (dry-run). */
export function expectedPrediagTimingCounts(
  total: number,
  ingressAt: Date,
  asOf: Date
): Record<PrediagBackfillTimingBucket, number> {
  const out: Record<PrediagBackfillTimingBucket, number> = {
    within_3_5_days: 0,
    after_5_days: 0,
  };
  for (let i = 0; i < total; i += 1) {
    const recordedAt = backfillPrediagnosticoRecordedAt(ingressAt, `dry-${i}`, asOf);
    out[classifyPrediagBackfillTiming(ingressAt, recordedAt)] += 1;
  }
  return out;
}
