// Limpio para nuevo diseño
import "@/components/ui/ui.css";
import { redirect } from "next/navigation";
import { ErpShell } from "@/components/erp-shell";
import { getSupabaseUserServerClient } from "@/lib/supabase/server-user";
import { AuthzProvider } from "@/components/authz";
import { loadUserAuthz } from "@/shared/authz/permissions";
import type { UserAuthz } from "@/shared/authz/canDo";

export default async function ErpLayout({ children }: { children: React.ReactNode }) {
  // Guard server-side: sin sesión válida no se renderiza el ERP (defensa antes
  // del guard client-side de ErpShell). Si Supabase no está configurado, se deja
  // pasar para no bloquear entornos sin backend.
  let initialAuthz: UserAuthz | null = null;
  const supabase = await getSupabaseUserServerClient();
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      redirect("/");
    }
    // Snapshot de permisos calculado en servidor → siembra el cache del cliente
    // y evita "permission flicker" en el primer render.
    try {
      initialAuthz = await loadUserAuthz(data.user.id);
    } catch {
      initialAuthz = null;
    }
  }

  return (
    <AuthzProvider initial={initialAuthz}>
      <ErpShell>{children}</ErpShell>
    </AuthzProvider>
  );
}
