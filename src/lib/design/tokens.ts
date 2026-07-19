/** Tokens visuales compartidos — usar en todos los módulos ERP. */
export const erpColors = {
  primary: '#181c3a',
  accent: '#2ec4f1',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#f43f5e',
} as const;

export const erpTypography = {
  pageTitle: 'text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-[var(--foreground)]',
  sectionTitle: 'text-lg sm:text-xl font-black text-[var(--heading)] uppercase tracking-tight',
  label: 'text-[10px] sm:text-xs font-black uppercase tracking-widest text-[var(--muted)]',
  body: 'text-sm font-medium text-[var(--muted)]',
  mono: 'font-mono text-sm font-bold text-[var(--foreground)]',
} as const;

export const erpLayout = {
  page: 'flex flex-col gap-6 lg:gap-8 w-full max-w-full min-w-0',
  pageHeader: 'flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between min-w-0',
  cardGrid: 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4',
  statGrid: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4',
  formGrid: 'grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6',
  tableWrap: 'erp-table-wrap overflow-x-auto custom-scrollbar -mx-1 px-1',
} as const;

export const erpInputClass =
  'w-full h-11 sm:h-12 rounded-xl border-2 border-[var(--border)] bg-[var(--surface-hover)] px-4 text-sm font-bold text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--accent)]';

/** Selects / inputs densos en modales ERP. */
export const erpFieldClass =
  'w-full rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] p-3 text-sm font-bold text-[var(--foreground)] outline-none transition-colors focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60';

export const erpLabelClass =
  'text-[10px] font-black uppercase tracking-widest text-[var(--muted)]';

/** Segmented control / tab pills — claro y oscuro. */
export const erpTab = {
  list: 'inline-flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] p-1',
  trigger:
    'rounded-lg px-4 py-2 text-[10px] font-black tracking-widest uppercase transition-all',
  triggerActive: 'bg-[var(--surface)] text-[var(--heading)] shadow-sm',
  triggerInactive: 'text-[var(--muted)] hover:text-[var(--foreground)]',
} as const;

/** Soft status / KPI tiles — reemplaza pasteles *-50. */
export const erpSoftStat = {
  accent: 'border border-[var(--accent)]/30 bg-[var(--accent)]/15 text-[var(--accent)]',
  success: 'border border-[var(--success)]/30 bg-[var(--success)]/15 text-[var(--success)]',
  warning: 'border border-[var(--warning)]/30 bg-[var(--warning)]/15 text-[var(--warning)]',
  danger: 'border border-[var(--danger)]/30 bg-[var(--danger)]/15 text-[var(--danger)]',
  muted: 'border border-[var(--border)] bg-[var(--surface-hover)] text-[var(--muted)]',
} as const;

export const erpCard = {
  /** Tarjeta de listado (bandeja, inbox) — sin bloque sólido oscuro */
  list: 'overflow-hidden border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] shadow-sm hover:border-[var(--border)] transition-colors',
  listMeta:
    'p-4 sm:p-5 sm:min-w-[12rem] lg:min-w-[14rem] border-b sm:border-b-0 sm:border-r border-[var(--border)]',
  listMetaAccent: {
    default: 'bg-[var(--surface-hover)] border-l-4 border-l-[var(--accent)]',
    warning: 'bg-[var(--surface-hover)] border-l-4 border-l-[var(--danger)]',
    success: 'bg-[var(--surface-hover)] border-l-4 border-l-[var(--success)]',
    neutral: 'bg-[var(--surface-hover)] border-l-4 border-l-[var(--muted)]',
  },
  listBody: 'flex-1 p-4 sm:p-5 flex flex-col justify-between min-w-0',
} as const;

/** Cabecera DataTable temática. */
export const erpTableHeader =
  'border-b border-[var(--border)] bg-[var(--surface-hover)]';
export const erpTableHeaderText = 'text-[var(--muted)]';
