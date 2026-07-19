import {
  ChevronRight,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

type ErpTopBarUser = {
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
};

type ErpTopBarProps = {
  pathname: string | null;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  currentUser: ErpTopBarUser | null;
  onLogout: () => void;
  breadcrumbLabel?: string;
};

export function ErpTopBar({
  pathname,
  sidebarOpen,
  onToggleSidebar,
  currentUser,
  onLogout,
  breadcrumbLabel,
}: ErpTopBarProps) {
  const segment = breadcrumbLabel
    ?? pathname?.split('/').filter(Boolean).pop()?.replace(/-/g, ' ')
    ?? 'Inicio';

  return (
    <header className="sticky top-0 z-30 flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-3 py-3 sm:px-4 md:px-6 lg:h-16 lg:px-8 lg:py-0">
      <div className="flex min-w-0 items-center gap-2 text-muted sm:gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="hidden min-h-11 min-w-11 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-hover hover:text-foreground md:flex"
          title={sidebarOpen ? 'Ocultar menú' : 'Mostrar menú'}
          aria-label={sidebarOpen ? 'Ocultar menú' : 'Mostrar menú'}
        >
          {sidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
        </button>
        <div className="hidden items-center gap-2 md:flex">
          <LayoutDashboard className="h-4 w-4" aria-hidden />
          <span className="text-xs font-semibold tracking-wide uppercase">Dashboard</span>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <span className="truncate text-xs font-semibold tracking-wide text-foreground uppercase">
            {segment}
          </span>
        </div>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="hidden items-center gap-2 rounded-xl border border-border bg-surface-hover px-3 py-1.5 lg:flex">
          <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
          <span className="text-[10px] font-semibold tracking-wide text-muted uppercase">
            Sistema Online
          </span>
        </div>

        {currentUser ? (
          <div className="flex max-w-[12rem] items-center gap-2 rounded-full border border-border bg-surface-hover p-1 pr-2 shadow-sm sm:max-w-none sm:gap-3 sm:pr-3">
            <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-surface">
              {currentUser.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentUser.avatar_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[var(--sidebar)] text-xs font-bold text-white uppercase">
                  {currentUser.full_name
                    ? currentUser.full_name.substring(0, 2)
                    : 'US'}
                </div>
              )}
            </div>
            <div className="hidden min-w-0 flex-col sm:flex">
              <span className="truncate text-xs font-semibold leading-tight">
                {currentUser.full_name || 'Cargando...'}
              </span>
              <span className="truncate text-[10px] font-semibold tracking-wide text-accent uppercase">
                {currentUser.role || 'Sin rol'}
              </span>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onLogout}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-danger/20 bg-danger/10 text-danger transition-colors hover:bg-danger hover:text-white"
          title="Cerrar Sesión"
          aria-label="Cerrar sesión"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
