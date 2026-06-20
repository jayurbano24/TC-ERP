import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Box,
  CheckCircle2,
  ChevronLeft,
  Download,
  Eye,
  Filter,
  History,
  Lock,
  Package,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Scan,
  Search,
  Trash2,
  Upload,
  Warehouse,
  X,
  type LucideIcon,
} from 'lucide-react';

/** Iconografía estándar ERP — usar estos nombres en lugar de importar Lucide suelto. */
export const ErpIcons = {
  search: Search,
  filter: Filter,
  add: Plus,
  edit: Pencil,
  delete: Trash2,
  save: Save,
  export: Download,
  import: Upload,
  print: Printer,
  view: Eye,
  back: ChevronLeft,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  close: X,
  refresh: RefreshCw,
  scan: Scan,
  box: Box,
  package: Package,
  warehouse: Warehouse,
  history: History,
  success: CheckCircle2,
  warning: AlertCircle,
  lock: Lock,
} as const satisfies Record<string, LucideIcon>;

export type ErpIconName = keyof typeof ErpIcons;

const defaultClass = 'w-4 h-4 shrink-0';

type ErpIconProps = {
  name: ErpIconName;
  className?: string;
  size?: number;
};

export function ErpIcon({ name, className, size }: ErpIconProps) {
  const Icon = ErpIcons[name];
  return <Icon className={className ?? defaultClass} size={size} strokeWidth={2} aria-hidden />;
}
