"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { navigationGroups } from "@/lib/modules";
import { canViewNavItem } from "@/lib/navigation-permissions";
import { useAuthz } from "@/components/authz";
import { useTheme } from "@/components/theme-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { registerUserSession, touchUserSession } from "@/lib/userSession";
import {
  SESSION_ACTIVITY_THROTTLE_MS,
  SESSION_HEARTBEAT_MS,
  SESSION_IDLE_MINUTES,
  isSessionIdle,
} from "@/lib/session/idlePolicy";
import { 
  LayoutDashboard, 
  Settings, 
  Moon, 
  Sun, 
  Menu,
  X,
  PackageSearch,
  Undo2,
  Laptop,
  Wrench,
  Warehouse,
  Truck,
  TrendingUp,
  CircleDollarSign,
  ShieldCheck,
  Activity,
  HeartPulse,
  Users,
  FileSpreadsheet,
  Boxes,
  Database
} from "lucide-react";
import {
  ErpNavItem,
  ErpSidebarBrand,
  ErpTopBar,
  isNavActive,
} from "@/components/shell";

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, PackageSearch, Undo2, Laptop, Wrench, Warehouse, Truck,
  TrendingUp, CircleDollarSign, ShieldCheck, Activity, HeartPulse, Users,
  FileSpreadsheet, Boxes, Database,
};

// Marcador de "usuario recurrente": permite no cerrar sesión ante errores
// transitorios de lectura de `user_sessions` (gracia de sesión, comportamiento
// preexistente). Los permisos ya NO se cachean aquí: viven en el authz centralizado.
const LAST_USER_KEY = 'tcerp_last_user_id';

function isReturningUser(userId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(LAST_USER_KEY) === userId;
  } catch {
    return false;
  }
}

function markUser(userId: string) {
  try {
    localStorage.setItem(LAST_USER_KEY, userId);
  } catch {
    /* quota / private mode */
  }
}

type CurrentUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
  role_id: string | null;
};

export function ErpShell({ children }: { children: React.ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  // Autorización centralizada (solo UX). Sembrada desde el servidor → sin flicker.
  const authz = useAuthz();

  const handleLogout = async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const localSessionId = localStorage.getItem('tcerp_session_id');
      if (localSessionId && currentUser?.id !== 'dev-user') {
        await supabase.from('user_sessions').delete().eq('id', localSessionId);
      }
      await supabase.auth.signOut();
    }
    localStorage.removeItem('tcerp_session_id');
    localStorage.removeItem('tcerp_dev_session');
    localStorage.removeItem(LAST_USER_KEY);
    router.push('/');
  };

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setIsSidebarOpen(false);
      else setIsSidebarOpen(true);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      try {
        const supabase = getSupabaseBrowserClient();
        const session = supabase ? (await supabase.auth.getSession()).data.session : null;

        if (!supabase) {
          if (!session?.user) router.push('/');
          return;
        }

        if (!session?.user) {
          router.push('/');
          return;
        }

        const userId = session.user.id;
        // Gracia de sesión: a un usuario recurrente no se le cierra sesión por
        // errores transitorios de lectura de `user_sessions`.
        const returning = isReturningUser(userId);

        {
          let localSessionId = localStorage.getItem('tcerp_session_id');
          if (!localSessionId) {
            localSessionId = await registerUserSession(userId);
            if (!localSessionId) {
              if (!returning) handleLogout();
              return;
            }
          }

          const { data: sessionData, error: sessionError } = await supabase
            .from('user_sessions')
            .select('created_at, last_seen')
            .eq('id', localSessionId)
            .single();

          if (sessionError?.code === 'PGRST116' || (!sessionError && !sessionData)) {
            if (!returning) handleLogout();
            return;
          }

          if (sessionData) {
            if (isSessionIdle(sessionData.last_seen ?? sessionData.created_at)) {
              await supabase.from('user_sessions').delete().eq('id', localSessionId);
              handleLogout();
              return;
            }

            const sessionAgeHours =
              (Date.now() - new Date(sessionData.created_at).getTime()) / (1000 * 60 * 60);
            if (sessionAgeHours > 16) {
              await supabase.from('user_sessions').delete().eq('id', localSessionId);
              if (!returning) handleLogout();
              return;
            }
          }
        }

        const { data, error: profileError } = await supabase
          .from('profiles')
          .select('full_name, email, avatar_url, user_roles(role, role_id)')
          .eq('id', userId)
          .single();

        if (cancelled) return;

        if (profileError || !data) {
          console.warn('No se pudo cargar perfil para menú:', profileError?.message);
          return;
        }

        const role = data.user_roles && data.user_roles.length > 0 ? data.user_roles[0].role : 'Sin Rol';
        const roleId = data.user_roles && data.user_roles.length > 0 ? data.user_roles[0].role_id : null;

        setCurrentUser({
          id: userId,
          email: data.email,
          full_name: data.full_name,
          avatar_url: data.avatar_url,
          role,
          role_id: roleId,
        });
        markUser(userId);
      } catch (err) {
        console.error('Error cargando sesión/menú:', err);
      }
    }

    void loadUser();

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void loadUser();
    };
    window.addEventListener('pageshow', onPageShow);

    return () => {
      cancelled = true;
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  // Presencia: solo renueva last_seen con actividad real; idle > 45 min → logout.
  useEffect(() => {
    if (!currentUser?.id || currentUser.id === 'dev-user') return;

    let lastActivityAt = Date.now();
    let lastMarkedAt = 0;
    let lastTouchSentAt = 0;
    let disposed = false;

    const onActivity = () => {
      const now = Date.now();
      if (now - lastMarkedAt < SESSION_ACTIVITY_THROTTLE_MS) return;
      lastMarkedAt = now;
      lastActivityAt = now;
    };

    const events: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'click',
    ];
    for (const ev of events) {
      window.addEventListener(ev, onActivity, { passive: true });
    }

    const tick = window.setInterval(() => {
      void (async () => {
        if (disposed) return;
        const sessionId = localStorage.getItem('tcerp_session_id');
        if (!sessionId) return;

        const idleMs = Date.now() - lastActivityAt;
        if (idleMs >= SESSION_IDLE_MINUTES * 60_000) {
          handleLogout();
          return;
        }

        // Sin actividad reciente: no renovar last_seen (cron + idle local expulsan).
        if (idleMs > SESSION_HEARTBEAT_MS) return;
        if (document.visibilityState === 'hidden') return;
        if (Date.now() - lastTouchSentAt < SESSION_HEARTBEAT_MS) return;

        lastTouchSentAt = Date.now();
        const ok = await touchUserSession(sessionId);
        if (!ok && !disposed) {
          handleLogout();
        }
      })();
    }, SESSION_HEARTBEAT_MS);

    return () => {
      disposed = true;
      window.clearInterval(tick);
      for (const ev of events) {
        window.removeEventListener(ev, onActivity);
      }
    };
  }, [currentUser?.id]);

  return (
    <div className="min-h-screen bg-background font-sans text-foreground antialiased transition-colors duration-300">
      <div className="sticky top-0 z-50 flex items-center justify-between border-b border-border bg-surface p-4 md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--sidebar)]">
            <span className="text-[10px] font-bold tracking-tight text-white">TC</span>
          </div>
          <span className="font-semibold tracking-tight">TC-ERP</span>
        </div>
        <button
          type="button"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:bg-surface-hover hover:text-foreground"
          aria-label={isSidebarOpen ? 'Cerrar menú' : 'Abrir menú'}
        >
          {isSidebarOpen ? <X /> : <Menu />}
        </button>
      </div>

      <div className="relative mx-auto flex min-h-screen overflow-x-hidden">
        {isMobile && isSidebarOpen ? (
          <div
            className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsSidebarOpen(false)}
            aria-hidden
          />
        ) : null}

        <aside
          className={[
            'fixed inset-y-0 left-0 z-40 flex shrink-0 flex-col bg-[var(--sidebar)] text-[var(--sidebar-foreground)] shadow-xl shadow-black/30 transition-all duration-300 md:relative',
            isSidebarOpen
              ? 'w-60 translate-x-0'
              : 'w-0 -translate-x-full md:w-16 md:translate-x-0',
          ].join(' ')}
        >
          <ErpSidebarBrand expanded={isSidebarOpen} />

          <nav className="custom-scrollbar flex-1 space-y-3 overflow-y-auto px-2 py-3">
            {authz.isLoading ? (
              <div className="space-y-2 px-1 animate-pulse">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-9 rounded-xl bg-white/5" />
                ))}
                <p className="pt-1 text-center text-[10px] font-semibold tracking-wide text-[var(--sidebar-foreground)]/40 uppercase">
                  Cargando menú…
                </p>
              </div>
            ) : (
              navigationGroups.map((group) => {
                const filteredItems = group.items.filter((item) =>
                  canViewNavItem(item, authz),
                );
                if (filteredItems.length === 0) return null;

                return (
                  <div key={group.title} className="space-y-0.5">
                    {isSidebarOpen ? (
                      <p className="mb-1.5 px-2 text-[10px] font-semibold tracking-wide text-[var(--sidebar-foreground)]/40 uppercase">
                        {group.title}
                      </p>
                    ) : (
                      <div className="mx-2 mb-2 h-px border-b border-[var(--sidebar-foreground)]/10" />
                    )}

                    <div className="space-y-0.5">
                      {filteredItems.map((item) => (
                        <ErpNavItem
                          key={item.href}
                          href={item.href}
                          label={item.label}
                          description={item.descripcion}
                          icon={item.icon ? ICON_MAP[item.icon] : LayoutDashboard}
                          active={isNavActive(pathname, item.href)}
                          expanded={isSidebarOpen}
                          onNavigate={() => {
                            if (isMobile) setIsSidebarOpen(false);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </nav>

          <div
            className={[
              'flex flex-col justify-end space-y-0.5 border-t border-[var(--sidebar-foreground)]/10 px-2 py-2',
              !isSidebarOpen ? 'items-center' : '',
            ].join(' ')}
          >
            <Link
              href="/configuracion"
              className={[
                'flex min-h-11 items-center gap-2 rounded-xl px-2 py-2 text-[var(--sidebar-foreground)] transition-colors hover:bg-[var(--sidebar-foreground)]/10',
                !isSidebarOpen ? 'justify-center' : '',
              ].join(' ')}
              title={!isSidebarOpen ? 'Configuración' : undefined}
            >
              <Settings size={15} strokeWidth={2.25} aria-hidden />
              {isSidebarOpen ? (
                <span className="text-xs font-semibold">Configuración</span>
              ) : null}
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              className={[
                'flex min-h-11 items-center gap-2 rounded-xl px-2 py-2 text-[var(--sidebar-foreground)] transition-colors hover:bg-[var(--sidebar-foreground)]/10',
                !isSidebarOpen ? 'justify-center' : '',
              ].join(' ')}
              title={!isSidebarOpen ? 'Cambiar tema' : undefined}
            >
              {theme === 'dark' ? <Sun size={15} aria-hidden /> : <Moon size={15} aria-hidden />}
              {isSidebarOpen ? (
                <span className="text-xs font-semibold">Cambiar Tema</span>
              ) : null}
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col bg-background">
          <ErpTopBar
            pathname={pathname}
            sidebarOpen={isSidebarOpen}
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            currentUser={currentUser}
            onLogout={handleLogout}
          />

          <main className="mx-auto w-full max-w-[1600px] min-w-0 flex-1 overflow-x-hidden p-4 transition-all duration-300 sm:p-6 lg:p-8 xl:p-10">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
