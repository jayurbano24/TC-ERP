import { NextResponse } from 'next/server';
import { COUNT_HEAD, SAP_UPLOAD_SELECT } from '@/shared/constants/dbProjections';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { resolveReadClient } from '@/shared/infrastructure/http/resolveReadClient';
import { logOnlyRoleCheck, ROLES_RETURNS_SAP } from '@/shared/authz/roleGuard';
import { fetchOsInventoryModules } from '@/lib/sap/osInventoryModules';
import { fetchSapIntegrationKpis } from '@/lib/sap/sapDashboardKpis';

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
    const [
      totalSeriesRes,
      seriesValidadasRes,
      seriesSinMatchRes,
      totalTCRes,
      lastUploadRes,
      osModules,
      sapKpis,
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
        .from('sap_uploads')
        .select(SAP_UPLOAD_SELECT)
        .order('fecha', { ascending: false })
        .limit(1)
        .maybeSingle(),
      fetchOsInventoryModules(supabase),
      fetchSapIntegrationKpis(supabase),
    ]);

    const firstError =
      totalSeriesRes.error || seriesValidadasRes.error || seriesSinMatchRes.error || totalTCRes.error;
    if (firstError) throw firstError;

    if (lastUploadRes.error) {
      console.warn('lastUpload skipped:', lastUploadRes.error.message);
    }

    let equiposConSerie = 0;
    const eqSerieRes = await supabase
      .from('service_orders')
      .select('id, series!inner(id)', { count: 'exact', head: true });
    if (eqSerieRes.error) {
      console.warn('equiposConSerie count skipped:', eqSerieRes.error.message);
    } else {
      equiposConSerie = eqSerieRes.count || 0;
    }

    const historico = sapKpis?.historico ?? totalTCRes.count ?? 0;
    const despachadas = sapKpis?.despachadas ?? Number(osModules?.despachado ?? 0);
    const devueltas = sapKpis?.devueltas ?? Number(osModules?.devuelto ?? 0);
    const enPlanta =
      sapKpis?.enPlanta ?? Math.max(0, historico - despachadas - devueltas);

    const kpisEnPlanta = sapKpis
      ? {
          validados: sapKpis.validados,
          pendientes: sapKpis.pendientes,
          sinCoincidencia: sapKpis.sinCoincidencia,
          inconsistentes: sapKpis.inconsistentes,
          obsoletos: sapKpis.obsoletos,
        }
      : null;

    const kpisHistorico = sapKpis
      ? {
          validados: sapKpis.historicoValidados,
          pendientes: sapKpis.historicoPendientes,
          sinCoincidencia: sapKpis.historicoSinCoincidencia,
          inconsistentes: sapKpis.historicoInconsistentes,
          obsoletos: sapKpis.historicoObsoletos,
        }
      : null;

    return NextResponse.json({
      success: true,
      kpis: {
        totalTC: historico,
        equiposConSerie,
        validados: kpisEnPlanta?.validados ?? 0,
        pendientes: kpisEnPlanta?.pendientes ?? 0,
        sinCoincidencia: kpisEnPlanta?.sinCoincidencia ?? 0,
        inconsistentes: kpisEnPlanta?.inconsistentes ?? 0,
        obsoletos: kpisEnPlanta?.obsoletos ?? 0,
        totalSeries: totalSeriesRes.count || 0,
        seriesValidadas: seriesValidadasRes.count || 0,
        seriesSinMatch: seriesSinMatchRes.count || 0,
      },
      kpisHistorico,
      despachadas,
      devueltas,
      enPlanta,
      pctDenominator: enPlanta,
      pctDenominatorLabel:
        'OS en planta (histórico − despachadas − devueltas) — base tarjetas SAP y %',
      osModules,
      lastUpload: lastUploadRes.data || null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error fetching SAP dashboard metrics:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
