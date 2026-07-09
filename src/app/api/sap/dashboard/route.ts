import { NextResponse } from "next/server";
import { COUNT_HEAD, SAP_UPLOAD_SELECT } from '@/shared/constants/dbProjections';
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_request: Request) {
  const supabase = getSupabaseServerClient();

  try {
    // Universo ETL: series ligadas a OS (lo que el G985 puede cruzar)
    const { count: totalSeries, error: seriesErr } = await supabase
      .from('series')
      .select(COUNT_HEAD, { count: 'exact', head: true })
      .not('service_order_id', 'is', null);
    if (seriesErr) throw seriesErr;

    const { count: seriesValidadas, error: seriesValErr } = await supabase
      .from('series')
      .select(COUNT_HEAD, { count: 'exact', head: true })
      .not('service_order_id', 'is', null)
      .eq('sap_status', 'Validado');
    if (seriesValErr) throw seriesValErr;

    const { count: seriesSinMatch, error: seriesSinErr } = await supabase
      .from('series')
      .select(COUNT_HEAD, { count: 'exact', head: true })
      .not('service_order_id', 'is', null)
      .eq('sap_status', 'Sin Coincidencia');
    if (seriesSinErr) throw seriesSinErr;

    // Equipos = service_orders (OS). Un equipo puede tener varias series (S1–S4).
    const { count: totalTC, error: totalErr } = await supabase
      .from('service_orders')
      .select(COUNT_HEAD, { count: 'exact', head: true });
    if (totalErr) throw totalErr;

    const { count: validados, error: valErr } = await supabase
      .from('service_orders')
      .select(COUNT_HEAD, { count: 'exact', head: true })
      .eq('sap_integration_status', 'Validado SAP');
    if (valErr) throw valErr;

    const { count: pendientes, error: pendErr } = await supabase
      .from('service_orders')
      .select(COUNT_HEAD, { count: 'exact', head: true })
      .eq('sap_integration_status', 'Pendiente Validación');
    if (pendErr) throw pendErr;

    const { count: sinCoincidencia, error: sinErr } = await supabase
      .from('service_orders')
      .select(COUNT_HEAD, { count: 'exact', head: true })
      .eq('sap_integration_status', 'Sin Coincidencia');
    if (sinErr) throw sinErr;

    const { count: inconsistentes, error: incErr } = await supabase
      .from('service_orders')
      .select(COUNT_HEAD, { count: 'exact', head: true })
      .eq('sap_integration_status', 'Pendiente Revisión');
    if (incErr) throw incErr;

    // Equipos con al menos una serie (universo que el sync marca Validado / Sin Coincidencia)
    const { count: equiposConSerie, error: eqSerieErr } = await supabase
      .from('service_orders')
      .select('id, series!inner(id)', { count: 'exact', head: true });
    if (eqSerieErr) {
      // Relación no disponible en schema cache: no tumbar dashboard
      console.warn('equiposConSerie count skipped:', eqSerieErr.message);
    }

    const { data: lastUpload } = await supabase
      .from('sap_uploads')
      .select(SAP_UPLOAD_SELECT)
      .order('fecha', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      success: true,
      kpis: {
        totalTC: totalTC || 0,
        equiposConSerie: equiposConSerie || 0,
        validados: validados || 0,
        pendientes: pendientes || 0,
        sinCoincidencia: sinCoincidencia || 0,
        inconsistentes: inconsistentes || 0,
        totalSeries: totalSeries || 0,
        seriesValidadas: seriesValidadas || 0,
        seriesSinMatch: seriesSinMatch || 0,
      },
      lastUpload: lastUpload || null
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error fetching SAP dashboard metrics:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
