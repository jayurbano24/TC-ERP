import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

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
      record_id: body.record_id,
      action: body.action,
      severity: body.severity || "INFO",
      old_values: body.old_values || null,
      new_values: body.new_values || null,
      user_agent: body.user_agent || null,
      observations: body.observations || null,
    });

    if (error) {
      console.error("Audit API insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
