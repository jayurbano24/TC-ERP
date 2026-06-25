import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { withErrorHandler } from "@/shared/infrastructure/http/apiHandler";
import { parseJsonBody } from "@/shared/validation/parseRequest";

export const dynamic = "force-dynamic";

/**
 * SEC-04: validación de entrada del log de auditoría. Esquema permisivo para no
 * romper a los emisores existentes (siempre envían `module`/`table_name`/`action`),
 * pero acota tipos/longitudes antes de insertar con service role.
 */
const AuditSchema = z.object({
  user_id: z.string().nullish(),
  user_role: z.string().max(120).nullish(),
  branch_id: z.string().nullish(),
  module: z.string().min(1).max(120),
  table_name: z.string().min(1).max(160),
  record_id: z.union([z.string(), z.number()]).nullish(),
  action: z.string().min(1).max(120),
  severity: z.string().max(40).nullish(),
  old_values: z.unknown().nullish(),
  new_values: z.unknown().nullish(),
  user_agent: z.string().max(1000).nullish(),
  observations: z.string().max(4000).nullish(),
});

export const POST = withErrorHandler(async (req: Request) => {
  const body = await parseJsonBody(req, AuditSchema);

  // Use service_role key on the server side to bypass RLS
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase.from("erp_audit_logs").insert({
    user_id: body.user_id || null,
    user_role: body.user_role || "Desconocido",
    branch_id: body.branch_id || null,
    module: body.module,
    table_name: body.table_name,
    record_id: body.record_id ?? null,
    action: body.action,
    severity: body.severity || "INFO",
    old_values: body.old_values ?? null,
    new_values: body.new_values ?? null,
    user_agent: body.user_agent || null,
    observations: body.observations || null,
  });

  if (error) {
    console.error("Audit API insert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}, { module: "audit", action: "create" });
