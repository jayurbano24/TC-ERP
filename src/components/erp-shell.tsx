"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { navigationGroups } from "@/lib/modules";
import { canViewNavItem } from "@/lib/navigation-permissions";
import { useAuthz } from "@/components/authz";
import { useTheme } from "@/components/theme-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { registerUserSession } from "@/lib/userSession";
import { 
  LayoutDashboard, 
  Settings, 
  LogOut, 
  Moon, 
  Sun, 
  ChevronRight,
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
  PanelLeftClose,
  PanelLeftOpen,
  Activity,
  Users,
  FileSpreadsheet,
  Boxes,
  Database
} from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, PackageSearch, Undo2, Laptop, Wrench, Warehouse, Truck,
  TrendingUp, CircleDollarSign, ShieldCheck, Activity, Users,
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
            .select('created_at')
            .eq('id', localSessionId)
            .single();

          if (sessionError?.code === 'PGRST116' || (!sessionError && !sessionData)) {
            if (!returning) handleLogout();
            return;
          }

          if (sessionData) {
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


  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300 font-sans antialiased">
      {/* Top Mobile Nav */}
      <div className="md:hidden flex items-center justify-between p-4 bg-[var(--surface)] border-b border-[var(--border)] sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#181c3a] rounded-lg flex items-center justify-center">
            <span className="text-white text-[10px] font-black tracking-tighter">TC</span>
          </div>
          <span className="font-bold tracking-tight">TC-ERP</span>
        </div>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
          {isSidebarOpen ? <X /> : <Menu />}
        </button>
      </div>

      <div className="mx-auto flex min-h-screen relative overflow-x-hidden">
        {/* Mobile Sidebar Overlay */}
        {isMobile && isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/60 z-30 backdrop-blur-sm transition-opacity"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={`
          ${isSidebarOpen ? 'translate-x-0 w-56' : '-translate-x-full md:translate-x-0 w-0 md:w-16'} 
          fixed inset-y-0 left-0 z-40 bg-[var(--sidebar)] text-[var(--sidebar-foreground)] transition-all duration-300 md:relative shrink-0 flex flex-col shadow-2xl shadow-black/40
        `}>
          {/* Logo Section */}
          <div className="px-3 py-3 border-b border-white/5 flex justify-between items-center min-h-[3.25rem]">
            {isSidebarOpen ? (
              <div className="flex items-center gap-2.5 min-w-0 animate-in fade-in duration-300">
                <div className="flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 565 280" className="h-6 w-auto drop-shadow-md">
                    <g fill="#ffffff">
                      <rect x="8" y="9" width="232" height="60"/>
                      <rect x="92" y="9" width="65" height="271"/>
                    </g>
                    <g fill="#ffffff">
                      <circle cx="425" cy="140" r="140"/>
                      <circle cx="425" cy="140" r="85" fill="#181c3a"/>
                      <rect x="500" y="100" width="80" height="60" fill="#181c3a"/>
                      <circle cx="425" cy="140" r="35" fill="#ffffff"/>
                    </g>
                  </svg>
                </div>
                <div className="flex flex-col min-w-0">
                  <h1 className="text-sm font-black tracking-tight leading-none truncate">MULTIMEDIA</h1>
                  <span className="text-[7px] font-bold text-white/60 uppercase tracking-[0.15em] mt-0.5 truncate">Enterprise</span>
                </div>
              </div>
            ) : (
              <div className="w-full flex justify-center animate-in fade-in duration-300">
                <div className="w-8 h-8 flex items-center justify-center">
                  <svg viewBox="0 0 565 280" className="h-5 w-auto drop-shadow-md">
                    <g fill="#ffffff">
                      <rect x="8" y="9" width="232" height="60"/>
                      <rect x="92" y="9" width="65" height="271"/>
                    </g>
                    <g fill="#ffffff">
                      <circle cx="425" cy="140" r="140"/>
                      <circle cx="425" cy="140" r="85" fill="#181c3a"/>
                      <rect x="500" y="100" width="80" height="60" fill="#181c3a"/>
                      <circle cx="425" cy="140" r="35" fill="#ffffff"/>
                    </g>
                  </svg>
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-3 custom-scrollbar">
            {authz.isLoading ? (
              <div className="space-y-2 px-1 animate-pulse">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-8 rounded-lg bg-white/5" />
                ))}
                <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest text-center pt-1">
                  Cargando menú…
                </p>
              </div>
            ) : (
            navigationGroups.map((group) => {
              // Filtrar items basados en permisos
              const filteredItems = group.items.filter((item) =>
                canViewNavItem(item, authz)
              );

              // Si el grupo no tiene items después de filtrar, no lo renderizamos
              if (filteredItems.length === 0) return null;

              return (
              <div key={group.title} className="space-y-0.5">
                {isSidebarOpen ? (
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.12em] px-2 mb-1.5">
                    {group.title}
                  </p>
                ) : (
                  <div className="h-3 border-b border-white/5 mb-2 mx-2"></div>
                )}
                
                <div className="space-y-0.5">
                  {filteredItems.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon ? ICON_MAP[item.icon] : LayoutDashboard;
                    
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => { if (isMobile) setIsSidebarOpen(false); }}
                        title={!isSidebarOpen ? item.label : item.descripcion}
                        className={`
                          group flex items-center rounded-lg py-2 transition-all duration-200
                          ${isActive 
                            ? 'bg-[#2ec4f1] text-[#181c3a] shadow-md shadow-[#2ec4f1]/15' 
                            : 'hover:bg-white/5'}
                          ${isSidebarOpen ? 'justify-between px-2.5' : 'justify-center mx-1'}
                        `}
                      >
                        <div className="flex items-center gap-2 w-full min-w-0">
                          {Icon && <Icon size={16} strokeWidth={2} className={`shrink-0 ${isActive ? 'text-[#181c3a]' : 'text-slate-400 group-hover:text-white transition-colors'}`} />}
                          
                          {isSidebarOpen && (
                            <div className="flex flex-col overflow-hidden min-w-0 animate-in fade-in duration-300">
                              <span className={`text-xs font-semibold truncate leading-tight ${isActive ? 'text-[#181c3a]' : 'text-slate-200 group-hover:text-white transition-colors'}`}>{item.label}</span>
                              <span className={`text-[9px] font-medium truncate leading-tight transition-colors ${isActive ? 'text-[#181c3a]/75' : 'text-slate-500 group-hover:text-slate-300'}`}>
                                {item.descripcion}
                              </span>
                            </div>
                          )}
                        </div>
                        {(isActive && isSidebarOpen) && <ChevronRight className="w-3 h-3 opacity-50 shrink-0" />}
                      </Link>
                    );
                  })}
                </div>
              </div>
              );
            })
            )}
          </nav>

          {/* User & Footer */}
          <div className={`px-2 py-2 border-t border-white/5 flex flex-col justify-end space-y-0.5 ${!isSidebarOpen && 'items-center'}`}>
            <Link 
              href="/configuracion"
              className={`flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors text-white/70 hover:text-white ${!isSidebarOpen && 'justify-center'}`}
              title={!isSidebarOpen ? "Configuración" : undefined}
            >
              <Settings size={15} />
              {isSidebarOpen && <span className="text-[10px] font-bold">Configuración</span>}
            </Link>
            <button 
              onClick={toggleTheme}
              className={`flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors text-white/70 hover:text-white ${!isSidebarOpen && 'justify-center'}`}
              title={!isSidebarOpen ? "Cambiar Tema" : undefined}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              {isSidebarOpen && <span className="text-[10px] font-bold">Cambiar Tema</span>}
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0 bg-[var(--background)] flex flex-col">
          {/* Top Bar / Global Actions */}
          <header className="min-h-16 lg:h-20 bg-[var(--surface)] border-b border-[var(--border)] px-3 sm:px-4 md:px-6 lg:px-8 py-3 lg:py-0 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-30">
            <div className="flex items-center gap-2 sm:gap-4 text-[var(--muted)] min-w-0">
              <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="hidden md:flex p-2 rounded-xl hover:bg-[var(--surface-hover)] transition-colors text-[var(--muted)] hover:text-[var(--foreground)] mr-2"
                title={isSidebarOpen ? "Ocultar menú" : "Mostrar menú"}
              >
                {isSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
              </button>
              <div className="hidden md:flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Dashboard</span>
                <ChevronRight className="w-3 h-3" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--foreground)]">
                  {pathname?.split('/').pop()?.replace('-', ' ')}
                </span>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 ml-auto">
              <div className="hidden lg:flex items-center gap-2 bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl px-3 py-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest">Sistema Online</span>
              </div>
              
              {currentUser && (
                <div className="flex items-center gap-2 sm:gap-3 bg-[var(--surface-hover)] border border-[var(--border)] rounded-full p-1 pr-2 sm:pr-4 shadow-sm max-w-[12rem] sm:max-w-none">
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 shrink-0">
                    {currentUser.avatar_url ? (
                      <img src={currentUser.avatar_url} alt="User avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[#181c3a] text-white text-xs font-black uppercase">
                        {currentUser.full_name ? currentUser.full_name.substring(0,2) : 'US'}
                      </div>
                    )}
                  </div>
                  <div className="hidden sm:flex flex-col min-w-0">
                    <span className="text-xs font-bold leading-tight truncate">{currentUser.full_name || 'Cargando...'}</span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-cyan-800 truncate">{currentUser.role || 'SIN ROL'}</span>
                  </div>
                </div>
              )}



              <button 
                onClick={handleLogout}
                className="p-2 rounded-xl bg-rose-50 text-rose-500 hover:text-white hover:bg-rose-500 border border-rose-100 transition-all ml-1"
                title="Cerrar Sesión"
              >
                <LogOut size={18} />
              </button>
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6 lg:p-8 xl:p-10 max-w-[1600px] mx-auto w-full min-w-0 transition-all duration-500 overflow-x-hidden">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
