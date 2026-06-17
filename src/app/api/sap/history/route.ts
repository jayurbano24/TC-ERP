import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = getSupabaseServerClient();
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50');

  try {
    const { data, error } = await supabase
      .from('sap_uploads')
      .select(`
        *,
        sap_validation_sessions(id, estado, activa, fecha_inicio, fecha_fin)
      `)
      .order('fecha', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error fetching SAP history:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
