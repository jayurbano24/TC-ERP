import { getSupabaseServerClient } from '@/lib/supabase/server';
import { groupPxSeriesByEquipment } from '@/app/(erp)/recepcion/utils/pxSeriesUtils';

const RECEPTION_GUIDE_SELECT =
  'id, reception_id, guide_number, category, status, classified_at, created_at';

export async function getPxReceptionPrintData(receptionId: string) {
  const supabase = getSupabaseServerClient();

  const [{ data: boxes, error: boxError }, { data: series }, { data: serviceOrders }] =
    await Promise.all([
      supabase
        .from('boxes')
        .select('*, brands(name), models(name, technologies(name))')
        .eq('reception_id', receptionId),
      supabase
        .from('series')
        .select('serial_number, service_order_id, current_box_id, material')
        .eq('current_reception_id', receptionId),
      supabase
        .from('service_orders')
        .select('id, main_serial')
        .eq('reception_id', receptionId),
    ]);

  if (boxError) throw new Error(boxError.message);

  const boxCodeById = Object.fromEntries((boxes || []).map((b) => [b.id, b.box_code]));
  const equipments = groupPxSeriesByEquipment(series || [], serviceOrders || [], boxCodeById);

  return { boxes: boxes || [], equipments };
}

export async function getCacReceptionGuideSerials(receptionId: string): Promise<string[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('series')
    .select('serial_number')
    .eq('current_reception_id', receptionId);

  if (error) throw new Error(error.message);
  return (data || []).map((r) => r.serial_number).filter(Boolean);
}

export async function getCacReceptionGuides(receptionIds: string[]) {
  if (receptionIds.length === 0) return [];
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('reception_guides')
    .select(RECEPTION_GUIDE_SELECT)
    .in('reception_id', receptionIds);

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getReceptionHistoryKpis() {
  const supabase = getSupabaseServerClient();
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [{ value: mo }, , { value: da }, , { value: ye }] = formatter.formatToParts(now);
  const startOfDayUtc = new Date(`${ye}-${mo}-${da}T00:00:00.000-06:00`).toISOString();
  const endOfDayUtc = new Date(`${ye}-${mo}-${da}T23:59:59.999-06:00`).toISOString();

  const COUNT_HEAD = 'id';
  const [guiasRes, equiposRes, esperaRes] = await Promise.all([
    supabase
      .from('reception_guides')
      .select(COUNT_HEAD, { count: 'exact', head: true })
      .gte('created_at', startOfDayUtc)
      .lte('created_at', endOfDayUtc),
    supabase
      .from('reception_guides')
      .select(COUNT_HEAD, { count: 'exact', head: true })
      .eq('category', 'equipo')
      .gte('classified_at', startOfDayUtc)
      .lte('classified_at', endOfDayUtc),
    supabase
      .from('reception_guides')
      .select(COUNT_HEAD, { count: 'exact', head: true })
      .is('category', null)
      .gte('created_at', startOfDayUtc)
      .lte('created_at', endOfDayUtc),
  ]);

  if (guiasRes.error || equiposRes.error || esperaRes.error) {
    throw new Error(
      guiasRes.error?.message || equiposRes.error?.message || esperaRes.error?.message || 'KPI error',
    );
  }

  return {
    guiasHoy: guiasRes.count || 0,
    equiposHoy: equiposRes.count || 0,
    enEspera: esperaRes.count || 0,
  };
}

export async function updateReceptionSapDocument(receptionId: string, sapDocument: string) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from('receptions')
    .update({ sap_document: sapDocument })
    .eq('id', receptionId);
  if (error) throw new Error(error.message);
}

export async function markReceptionDeletedByWarehouse(receptionId: string) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from('receptions')
    .update({ status: 'ELIMINADO POR BODEGA' })
    .eq('id', receptionId);
  if (error) throw new Error(error.message);
}

export async function lookupSeriesBySerial(serial: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('series')
    .select(
      'id, serial_number, current_status, current_reception_id, service_order_id, receptions:current_reception_id(guide_number, created_at, status, source, sap_document)',
    )
    .eq('serial_number', serial.toUpperCase())
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function getLatestServiceOrderForSeries(seriesId: string, mainSerial?: string) {
  const supabase = getSupabaseServerClient();

  const { data: series } = await supabase
    .from('series')
    .select('service_order_id, serial_number')
    .eq('id', seriesId)
    .maybeSingle();

  if (series?.service_order_id) {
    const { data: linked } = await supabase
      .from('service_orders')
      .select('os_label, status, reentry_count')
      .eq('id', series.service_order_id)
      .maybeSingle();
    if (linked) return linked;
  }

  const main = (mainSerial || series?.serial_number || '').trim().toUpperCase();
  if (!main) return null;

  const { data } = await supabase
    .from('service_orders')
    .select('os_label, status, reentry_count')
    .eq('main_serial', main)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}
