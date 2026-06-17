import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = getSupabaseServerClient();

  try {
    // 1. Total Equipos en TC (service_orders)
    const { count: totalTC, error: totalErr } = await supabase
      .from('service_orders')
      .select('*', { count: 'exact', head: true });

    // 2. Validados SAP
    const { count: validados, error: valErr } = await supabase
      .from('service_orders')
      .select('*', { count: 'exact', head: true })
      .eq('sap_integration_status', 'Validado SAP');

    // 3. Pendientes (Pendiente Validación)
    const { count: pendientes, error: pendErr } = await supabase
      .from('service_orders')
      .select('*', { count: 'exact', head: true })
      .eq('sap_integration_status', 'Pendiente Validación');

    // 4. Sin Coincidencia
    const { count: sinCoincidencia, error: sinErr } = await supabase
      .from('service_orders')
      .select('*', { count: 'exact', head: true })
      .eq('sap_integration_status', 'Sin Coincidencia');

    // 5. Inconsistencias (Múltiples materiales / Pendiente Revisión)
    const { count: inconsistentes, error: incErr } = await supabase
      .from('service_orders')
      .select('*', { count: 'exact', head: true })
      .eq('sap_integration_status', 'Pendiente Revisión');

    // 6. Último archivo (sap_uploads)
    const { data: lastUpload } = await supabase
      .from('sap_uploads')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      success: true,
      kpis: {
        totalTC: totalTC || 0,
        validados: validados || 0,
        pendientes: pendientes || 0,
        sinCoincidencia: sinCoincidencia || 0,
        inconsistentes: inconsistentes || 0,
      },
      lastUpload: lastUpload || null
    });
  } catch (error: any) {
    console.error("Error fetching SAP dashboard metrics:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
