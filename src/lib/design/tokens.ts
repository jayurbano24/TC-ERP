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
  sectionTitle: 'text-lg sm:text-xl font-black text-[#181c3a] uppercase tracking-tight',
  label: 'text-[10px] sm:text-xs font-black uppercase tracking-widest text-slate-400',
  body: 'text-sm font-medium text-slate-600',
  mono: 'font-mono text-sm font-bold text-[#181c3a]',
} as const;

export const erpLayout = {
  page: 'flex flex-col gap-6 lg:gap-8 w-full max-w-[100vw]',
  pageHeader: 'flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between',
  cardGrid: 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4',
  statGrid: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4',
  formGrid: 'grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6',
  tableWrap: 'erp-table-wrap overflow-x-auto custom-scrollbar -mx-1 px-1',
} as const;

export const erpInputClass =
  'w-full h-11 sm:h-12 bg-slate-50 border-2 border-slate-100 rounded-xl px-4 text-sm font-bold outline-none focus:border-[#2ec4f1] transition-colors';

export const erpCard = {
  /** Tarjeta de listado (bandeja, inbox) — sin bloque sólido oscuro */
  list: 'overflow-hidden border border-slate-100 bg-white shadow-sm hover:border-slate-200 transition-colors',
  listMeta: 'p-4 sm:p-5 sm:min-w-[12rem] lg:min-w-[14rem] border-b sm:border-b-0 sm:border-r border-slate-100',
  listMetaAccent: {
    default: 'bg-slate-50 border-l-4 border-l-[#2ec4f1]',
    warning: 'bg-rose-50/80 border-l-4 border-l-rose-400',
    success: 'bg-emerald-50/50 border-l-4 border-l-emerald-500',
    neutral: 'bg-slate-50 border-l-4 border-l-slate-300',
  },
  listBody: 'flex-1 p-4 sm:p-5 flex flex-col justify-between min-w-0',
} as const;
