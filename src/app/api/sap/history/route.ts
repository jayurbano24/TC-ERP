import { NextResponse } from "next/server";
import { requireApiUser } from "@/shared/infrastructure/http/requireApiUser";
import { resolveReadClient } from "@/shared/infrastructure/http/resolveReadClient";
import { logOnlyRoleCheck, ROLES_RETURNS_SAP } from "@/shared/authz/roleGuard";

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof NextResponse) return auth;

  const denied = await logOnlyRoleCheck(request, ROLES_RETURNS_SAP, {
    module: "sap",
    action: "history",
  });
  if (denied) return denied;

  const { client: supabase } = resolveReadClient(auth.supabase);
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "50");

  try {
    const { data, error } = await supabase
      .from("sap_uploads")
      .select(`
        *,
        sap_validation_sessions(id, estado, activa, fecha_inicio, fecha_fin)
      `)
      .order("fecha", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error";
    console.error("Error fetching SAP history:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
