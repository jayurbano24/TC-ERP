import { NextResponse } from 'next/server';
import { COUNT_HEAD, SAP_UPLOAD_SELECT } from '@/shared/constants/dbProjections';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { resolveReadClient } from '@/shared/infrastructure/http/resolveReadClient';
import { logOnlyRoleCheck, ROLES_RETURNS_SAP } from '@/shared/authz/roleGuard';
import { fetchOsInventoryModules } from '@/lib/sap/osInventoryModules';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof NextResponse) return auth;
  const denied = await logOnlyRoleCheck(request, ROLES_RETURNS_SAP, {
    module: 'sap',
    action: 'dashboard',
  });
  if (denied) return denied;
  const { client: supabase } = resolveReadClient(auth.supabase);

  try {
    // Conteos en paralelo — evita spinner eterno por cadena secuencial.
    const [
      totalSeriesRes,
      seriesValidadasRes,
      seriesSinMatchRes,
      totalTCRes,
      validadosRes,
      pendientesRes,
      sinCoincidenciaRes,
      inconsistentesRes,
      lastUploadRes,
      osModules,
    ] = await Promise.all([
      supabase
        .from('series')
        .select(COUNT_HEAD, { count: 'exact', head: true })
        .not('service_order_id', 'is', null),
      supabase
        .from('series')
        .select(COUNT_HEAD, { count: 'exact', head: true })
        .not('service_order_id', 'is', null)
        .eq('sap_status', 'Validado'),
      supabase
        .from('series')
        .select(COUNT_HEAD, { count: 'exact', head: true })
        .not('service_order_id', 'is', null)
        .eq('sap_status', 'Sin Coincidencia'),
      supabase.from('service_orders').select(COUNT_HEAD, { count: 'exact', head: true }),
      supabase
        .from('service_orders')
        .select(COUNT_HEAD, { count: 'exact', head: true })
        .eq('sap_integration_status', 'Validado SAP'),
      supabase
        .from('service_orders')
        .select(COUNT_HEAD, { count: 'exact', head: true })
        .eq('sap_integration_status', 'Pendiente Validación'),
      supabase
        .from('service_orders')
        .select(COUNT_HEAD, { count: 'exact', head: true })
        .eq('sap_integration_status', 'Sin Coincidencia'),
      supabase
        .from('service_orders')
        .select(COUNT_HEAD, { count: 'exact', head: true })
        .eq('sap_integration_status', 'Pendiente Revisión'),
      supabase
        .from('sap_uploads')
        .select(SAP_UPLOAD_SELECT)
        .order('fecha', { ascending: false })
        .limit(1)
        .maybeSingle(),
      fetchOsInventoryModules(supabase),
    ]);

    const firstError =
      totalSeriesRes.error ||
      seriesValidadasRes.error ||
      seriesSinMatchRes.error ||
      totalTCRes.error ||
      validadosRes.error ||
      pendientesRes.error ||
      sinCoincidenciaRes.error ||
      inconsistentesRes.error;
    if (firstError) throw firstError;

    if (lastUploadRes.error) {
      console.warn('lastUpload skipped:', lastUploadRes.error.message);
    }

    // Opcional / puede fallar por schema cache — no tumba el dashboard.
    let equiposConSerie = 0;
    const eqSerieRes = await supabase
      .from('service_orders')
      .select('id, series!inner(id)', { count: 'exact', head: true });
    if (eqSerieRes.error) {
      console.warn('equiposConSerie count skipped:', eqSerieRes.error.message);
    } else {
      equiposConSerie = eqSerieRes.count || 0;
    }

    return NextResponse.json({
      success: true,
      kpis: {
        totalTC: totalTCRes.count || 0,
        equiposConSerie,
        validados: validadosRes.count || 0,
        pendientes: pendientesRes.count || 0,
        sinCoincidencia: sinCoincidenciaRes.count || 0,
        inconsistentes: inconsistentesRes.count || 0,
        totalSeries: totalSeriesRes.count || 0,
        seriesValidadas: seriesValidadasRes.count || 0,
        seriesSinMatch: seriesSinMatchRes.count || 0,
      },
      osModules,
      lastUpload: lastUploadRes.data || null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error fetching SAP dashboard metrics:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
