"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { navigationGroups } from "@/lib/modules";
import { Badge } from "@/components/ui";
import { useTheme } from "@/components/theme-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getRolePermissions } from "@/lib/database/roles";
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
  Users
} from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, PackageSearch, Undo2, Laptop, Wrench, Warehouse, Truck, TrendingUp, CircleDollarSign, ShieldCheck, Activity, Users
};

export function ErpShell({ children }: { children: React.ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userPermissions, setUserPermissions] = useState<any[] | null>(null);
  const [isMobile, setIsMobile] = useState(false);

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
    async function loadUser() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        // Validación Avanzada de Sesión (Single PC + 5 Horas)
        if (session.user.id !== 'dev-user') {
          const localSessionId = localStorage.getItem('tcerp_session_id');
          if (!localSessionId) {
            handleLogout();
            return;
          }

          const { data: sessionData, error: sessionError } = await supabase
            .from('user_sessions')
            .select('created_at')
            .eq('id', localSessionId)
            .single();

          if (sessionError) {
             // Si el error es 'PGRST116', significa que la fila no existe (fue borrada / otro PC inició sesión)
             if (sessionError.code === 'PGRST116') {
                handleLogout();
                return;
             }
             // Si es otro error (ej. red caída), NO cerramos sesión por error temporal
          } else if (!sessionData) {
            // La sesión fue borrada
            handleLogout();
            return;
          } else {
             const sessionAgeHours = (new Date().getTime() - new Date(sessionData.created_at).getTime()) / (1000 * 60 * 60);
             if (sessionAgeHours > 5) {
               // Sesión excedió las 5 horas
               await supabase.from('user_sessions').delete().eq('id', localSessionId);
               handleLogout();
               return;
             }
          }
        }

        // Obtenemos el perfil y su rol
        const { data } = await supabase
          .from('profiles')
          .select('full_name, email, avatar_url, user_roles(role, role_id)')
          .eq('id', session.user.id)
          .single();
        if (data) {
          const role = data.user_roles && data.user_roles.length > 0 ? data.user_roles[0].role : 'Sin Rol';
          const roleId = data.user_roles && data.user_roles.length > 0 ? data.user_roles[0].role_id : null;
          
          setCurrentUser({
            id: session.user.id,
            email: data.email,
            full_name: data.full_name,
            avatar_url: data.avatar_url,
            role,
            role_id: roleId
          });

          if (role === 'ADMINISTRADOR' || data.email === 'gurbano@techcommwireless.com' || data.email === 'gurbnao@techcommwireless.com') {
             setUserPermissions([{ is_admin: true }]);
          } else if (roleId) {
             const perms = await getRolePermissions(roleId);
             setUserPermissions(perms || []);
          } else {
             setUserPermissions([]); // No role, no access
          }
        }
      } else {
        router.push('/');
      }
    }
    loadUser();
  }, [pathname]);

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
    router.push('/');
  };


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
          ${isSidebarOpen ? 'translate-x-0 w-72' : '-translate-x-full md:translate-x-0 w-0 md:w-20'} 
          fixed inset-y-0 left-0 z-40 bg-[#181c3a] text-white transition-all duration-300 md:relative shrink-0 flex flex-col shadow-2xl shadow-black/40
        `}>
          {/* Logo Section */}
          <div className="p-6 border-b border-white/5 flex justify-between items-center h-20">
            {isSidebarOpen ? (
              <div className="flex items-center gap-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-center">
                  <svg viewBox="0 0 565 280" className="h-8 w-auto rounded overflow-hidden">
                    <rect width="565" height="280" fill="#ffffff"/>
                    <g fill="#2e3165">
                      <rect x="8" y="9" width="232" height="60"/>
                      <rect x="92" y="9" width="65" height="271"/>
                    </g>
                    <g fill="#2e3165">
                      <circle cx="425" cy="140" r="140"/>
                      <circle cx="425" cy="140" r="85" fill="#ffffff"/>
                      <rect x="500" y="100" width="80" height="60" fill="#ffffff"/>
                      <circle cx="425" cy="140" r="35" fill="#2e3165"/>
                    </g>
                  </svg>
                </div>
                <div className="flex flex-col">
                  <h1 className="text-lg font-black tracking-tighter leading-none">MULTIMEDIA</h1>
                  <span className="text-[9px] font-bold text-white/40 uppercase tracking-[0.2em] mt-1">Enterprise System</span>
                </div>
              </div>
            ) : (
              <div className="w-full flex justify-center animate-in fade-in duration-300">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-[#2ec4f1]/20 bg-white overflow-hidden">
                  <svg viewBox="0 0 565 280" className="h-6 w-auto">
                    <g fill="#2e3165">
                      <rect x="8" y="9" width="232" height="60"/>
                      <rect x="92" y="9" width="65" height="271"/>
                    </g>
                    <g fill="#2e3165">
                      <circle cx="425" cy="140" r="140"/>
                      <circle cx="425" cy="140" r="85" fill="#ffffff"/>
                      <rect x="500" y="100" width="80" height="60" fill="#ffffff"/>
                      <circle cx="425" cy="140" r="35" fill="#2e3165"/>
                    </g>
                  </svg>
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-6 custom-scrollbar">
            {navigationGroups.map((group) => {
              // Filtrar items basados en permisos
              const filteredItems = group.items.filter(item => {
                // Si aún no cargan permisos, no mostrar nada
                if (!userPermissions) return false;
                
                // Administradores ven todo
                if (userPermissions.length > 0 && userPermissions[0].is_admin) return true;
                
                // Verificar matriz de permisos
                const perm = userPermissions.find(p => p.module_name === item.label);
                return perm ? perm.can_view === true : false;
              });

              // Si el grupo no tiene items después de filtrar, no lo renderizamos
              if (filteredItems.length === 0) return null;

              return (
              <div key={group.title} className="space-y-1">
                {isSidebarOpen ? (
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em] px-4 mb-3">
                    {group.title}
                  </p>
                ) : (
                  <div className="h-4 border-b border-white/5 mb-4 mx-4"></div>
                )}
                
                <div className="space-y-1">
                  {filteredItems.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon ? ICON_MAP[item.icon] : LayoutDashboard;
                    
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => { if (isMobile) setIsSidebarOpen(false); }}
                        title={!isSidebarOpen ? item.label : undefined}
                        className={`
                          group flex items-center rounded-xl p-3 transition-all duration-200
                          ${isActive 
                            ? 'bg-[#2ec4f1] text-white shadow-lg shadow-[#2ec4f1]/20' 
                            : 'hover:bg-white/5'}
                          ${isSidebarOpen ? 'justify-between px-4' : 'justify-center mx-2'}
                        `}
                      >
                        <div className="flex items-center gap-3 w-full">
                          {Icon && <Icon size={20} strokeWidth={2} className={`shrink-0 ${isActive ? 'text-white drop-shadow-md' : 'text-slate-300 group-hover:text-white transition-colors'}`} />}
                          
                          {isSidebarOpen && (
                            <div className="flex flex-col overflow-hidden animate-in fade-in duration-300">
                              <span className={`text-sm font-semibold truncate ${isActive ? 'text-white drop-shadow-md' : 'text-slate-200 group-hover:text-white transition-colors'}`}>{item.label}</span>
                              <span className={`text-[11px] font-medium truncate mt-0.5 transition-colors ${isActive ? 'text-white/90' : 'text-slate-400 group-hover:text-slate-300'}`}>
                                {item.descripcion}
                              </span>
                            </div>
                          )}
                        </div>
                        {(isActive && isSidebarOpen) && <ChevronRight className="w-4 h-4 opacity-50 shrink-0" />}
                      </Link>
                    );
                  })}
                </div>
              </div>
              );
            })}
          </nav>

          {/* User & Footer */}
          <div className={`p-4 border-t border-white/5 flex flex-col justify-end space-y-2 ${!isSidebarOpen && 'items-center'}`}>
            <Link 
              href="/configuracion"
              className={`flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors text-white/40 hover:text-white ${!isSidebarOpen && 'justify-center'}`}
              title={!isSidebarOpen ? "Configuración" : undefined}
            >
              <Settings size={18} />
              {isSidebarOpen && <span className="text-xs font-bold">Configuración</span>}
            </Link>
            <button 
              onClick={toggleTheme}
              className={`flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors text-white/40 hover:text-white ${!isSidebarOpen && 'justify-center'}`}
              title={!isSidebarOpen ? "Cambiar Tema" : undefined}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              {isSidebarOpen && <span className="text-xs font-bold">Cambiar Tema</span>}
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0 bg-[var(--background)] flex flex-col">
          {/* Top Bar / Global Actions */}
          <header className="h-20 bg-[var(--surface)] border-b border-[var(--border)] px-4 md:px-8 flex items-center justify-between sticky top-0 z-30">
            <div className="flex items-center gap-4 text-slate-400">
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
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#181c3a]">
                  {pathname?.split('/').pop()?.replace('-', ' ')}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-2 bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl px-3 py-1.5 mr-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest">Sistema Online</span>
              </div>
              
              {currentUser && (
                <div className="flex items-center gap-3 bg-[var(--surface-hover)] border border-[var(--border)] rounded-full p-1 pr-4 shadow-sm">
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 shrink-0">
                    {currentUser.avatar_url ? (
                      <img src={currentUser.avatar_url} alt="User avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-[#181c3a] text-white text-xs font-black uppercase">
                        {currentUser.full_name ? currentUser.full_name.substring(0,2) : 'US'}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold leading-tight">{currentUser.full_name || 'Cargando...'}</span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-[#2ec4f1]">{currentUser.role || 'SIN ROL'}</span>
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

          <main className="flex-1 p-4 md:p-10 max-w-[1600px] mx-auto w-full transition-all duration-500 overflow-x-hidden">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
