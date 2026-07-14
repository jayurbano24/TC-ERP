import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { logAdvancedAudit } from "@/lib/database/audit";
import { sanitizeOrFilterValue } from "@/lib/database/postgrestSafe";
import { expandBoxCodeSearchVariants } from "@/modules/inventario/client/warehouseBoxDisplay";

/**
 * Tope de seguridad para consultas de series sin paginación server-side.
 * Evita traer 100k+ filas a memoria/DOM. La UI pagina en cliente sobre este
 * subconjunto, priorizando los registros más recientes. Cuando exista
 * paginación server-side real, este límite debe sustituirse por `.range()`.
 */
const SERIES_SAFETY_LIMIT = 1000;

export type DbSeries = {
  id?: string;
  serial_number: string;
  brand_id?: string;
  model_id?: string;
  current_status: string;
  current_box_id?: string;
  current_reception_id?: string;
  updated_at?: string;
};

export async function getSeries(filters?: any) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  let query = supabase.from('series').select(`
    *,
    receptions (guide_number, carrier),
    boxes (box_code, rack_location)
  `);

  if (filters?.status) query = query.eq('current_status', filters.status);
  if (filters?.serial) query = query.ilike('serial_number', `%${filters.serial}%`);

  query = query.order('updated_at', { ascending: false }).limit(SERIES_SAFETY_LIMIT);

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching series:", error);
    return [];
  }
  return data;
}

// Tope de IDs candidatos por sub-consulta ligera (sin embeds).
const CANDIDATE_LIMIT = SERIES_SAFETY_LIMIT;
// Tope del fetch de detalle (embed pesado) + longitud segura del filtro IN en la URL.
const DETAIL_LIMIT = 300;

export async function searchSeriesDetailed(filters: { os?: string, imei?: string, cliente?: string, ticket?: string, tracking?: string, box?: string }) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  // ---------------------------------------------------------------------------
  // Fase 1: resolver IDs de series candidatos con consultas LIGERAS por filtro
  // (sin el embed pesado) e intersectarlos. Antes se traían 1000 series ordenadas
  // por updated_at con todos los joins y se filtraba en memoria, lo que provocaba
  // "statement timeout" (57014) al escanear toda la tabla. Empujar los filtros a
  // la BD reduce el set a unos pocos registros antes del embed.
  // ---------------------------------------------------------------------------
  const idSets: Array<Set<string>> = [];

  const seriesIdsByForeign = async (column: string, values: string[]): Promise<Set<string>> => {
    if (values.length === 0) return new Set<string>();
    const { data, error } = await supabase
      .from('series').select('id').in(column, values).limit(CANDIDATE_LIMIT);
    if (error) throw error;
    return new Set<string>((data || []).map((r: any) => r.id));
  };

  // Filtros que dependen de `receptions` (doble vía: serie.current_reception_id
  // O serie.service_order_id -> service_orders.reception_id).
  const seriesIdsByReception = async (orExpr: string): Promise<Set<string>> => {
    const { data: recs, error } = await supabase
      .from('receptions').select('id').or(orExpr).limit(CANDIDATE_LIMIT);
    if (error) throw error;
    const recIds = (recs || []).map((r: any) => r.id);
    if (recIds.length === 0) return new Set<string>();
    const direct = await seriesIdsByForeign('current_reception_id', recIds);
    const { data: sos } = await supabase
      .from('service_orders').select('id').in('reception_id', recIds).limit(CANDIDATE_LIMIT);
    const viaSo = await seriesIdsByForeign('service_order_id', (sos || []).map((s: any) => s.id));
    viaSo.forEach((id) => direct.add(id));
    return direct;
  };

  try {
    // IMEI / Serie: columnas directas en `series`.
    if (filters.imei) {
      const v = sanitizeOrFilterValue(filters.imei);
      if (v) {
        const { data, error } = await supabase
          .from('series').select('id')
          .or(`serial_number.ilike.%${v}%,s2.ilike.%${v}%,s3.ilike.%${v}%,s4.ilike.%${v}%`)
          .limit(CANDIDATE_LIMIT);
        if (error) throw error;
        idSets.push(new Set<string>((data || []).map((r: any) => r.id)));
      } else {
        idSets.push(new Set<string>());
      }
    }

    // Caja: boxes.box_code -> series.current_box_id.
    // UI muestra TCW-BOX-045; BD guarda BOX-45 / BOX-045.
    if (filters.box) {
      const variants = expandBoxCodeSearchVariants(filters.box)
        .map((t) => sanitizeOrFilterValue(t))
        .filter(Boolean);
      let set = new Set<string>();
      if (variants.length > 0) {
        const { data: exactBoxes, error: exactErr } = await supabase
          .from('boxes')
          .select('id')
          .in('box_code', variants)
          .limit(CANDIDATE_LIMIT);
        if (exactErr) throw exactErr;

        let boxIds = (exactBoxes || []).map((b: { id: string }) => b.id);

        if (boxIds.length === 0) {
          // Fallback parcial (códigos legacy / texto libre)
          const orExpr = variants
            .slice(0, 8)
            .map((t) => `box_code.ilike.%${t}%`)
            .join(',');
          const { data: fuzzyBoxes, error: fuzzyErr } = await supabase
            .from('boxes')
            .select('id')
            .or(orExpr)
            .limit(CANDIDATE_LIMIT);
          if (fuzzyErr) throw fuzzyErr;
          boxIds = (fuzzyBoxes || []).map((b: { id: string }) => b.id);
        }

        // Series actualmente en la caja
        set = await seriesIdsByForeign('current_box_id', boxIds);

        // Si ya no están vinculadas (p. ej. despachadas), buscar por movimientos
        if (set.size === 0 && boxIds.length > 0) {
          const { data: movs } = await supabase
            .from('warehouse_movements')
            .select('series_ids')
            .in('box_id', boxIds)
            .order('created_at', { ascending: false })
            .limit(40);
          const fromMov = new Set<string>();
          for (const mov of movs || []) {
            const ids = (mov as { series_ids?: string[] | null }).series_ids || [];
            for (const id of ids) if (id) fromMov.add(id);
          }
          if (fromMov.size > 0) set = fromMov;
        }
      }
      idSets.push(set);
    }

    // Orden de servicio: service_orders.os_label / os_number -> series.service_order_id.
    if (filters.os) {
      const v = sanitizeOrFilterValue(filters.os);
      let set = new Set<string>();
      if (v) {
        const orParts = [`os_label.ilike.%${v}%`];
        if (/^\d+$/.test(v)) orParts.push(`os_number.eq.${v}`);
        const { data: sos } = await supabase
          .from('service_orders').select('id').or(orParts.join(',')).limit(CANDIDATE_LIMIT);
        set = await seriesIdsByForeign('service_order_id', (sos || []).map((s: any) => s.id));
      }
      idSets.push(set);
    }

    // Cliente (courier): receptions.carrier.
    if (filters.cliente) {
      const v = sanitizeOrFilterValue(filters.cliente);
      idSets.push(v ? await seriesIdsByReception(`carrier.ilike.%${v}%`) : new Set<string>());
    }

    // Tracking: receptions.guide_number.
    if (filters.tracking) {
      const v = sanitizeOrFilterValue(filters.tracking);
      idSets.push(v ? await seriesIdsByReception(`guide_number.ilike.%${v}%`) : new Set<string>());
    }

    // Ticket / SAP: receptions.sap_document O sap_transfer_documents.sap_document_number.
    if (filters.ticket) {
      const v = sanitizeOrFilterValue(filters.ticket);
      let set = new Set<string>();
      if (v) {
        set = await seriesIdsByReception(`sap_document.ilike.%${v}%`);
        const { data: docs } = await supabase
          .from('sap_transfer_documents').select('id').ilike('sap_document_number', `%${v}%`).limit(CANDIDATE_LIMIT);
        const docIds = (docs || []).map((d: any) => d.id);
        if (docIds.length) {
          const { data: sos } = await supabase
            .from('service_orders').select('id').in('sap_transfer_id', docIds).limit(CANDIDATE_LIMIT);
          const viaDoc = await seriesIdsByForeign('service_order_id', (sos || []).map((s: any) => s.id));
          viaDoc.forEach((id) => set.add(id));
        }
      }
      idSets.push(set);
    }

    if (idSets.length === 0) return [];

    // Intersección de todos los filtros activos.
    let finalIds = [...idSets[0]];
    for (let i = 1; i < idSets.length; i++) {
      const s = idSets[i];
      finalIds = finalIds.filter((id) => s.has(id));
    }
    if (finalIds.length === 0) return [];
    finalIds = finalIds.slice(0, DETAIL_LIMIT);

    // -------------------------------------------------------------------------
    // Fase 2: traer el detalle (embed pesado) SOLO para los IDs candidatos.
    // Acotado por PK, sin sort de tabla completa -> evita el timeout.
    // -------------------------------------------------------------------------
    const { data, error } = await supabase.from('series').select(`
    *,
    receptions:current_reception_id (
      source,
      guide_number,
      sap_document,
      carrier,
      notes,
      processed_guides,
      reception_time,
      created_at,
      reception_guides (guide_number, agency, category),
      received_by_profile:received_by (full_name)
    ),
    boxes:current_box_id (box_code, rack_location),
    service_orders:service_order_id (
      os_label,
      os_number,
      reception_id,
      sap_transfer_id,
      receptions:reception_id (
        source,
        guide_number,
        sap_document,
        carrier,
        notes,
        processed_guides,
        reception_time,
        created_at,
        reception_guides (guide_number, agency, category),
        received_by_profile:received_by (full_name)
      ),
      sap_transfer_documents:sap_transfer_id (id, sap_document_number, status)
    ),
    brands:brand_id (name),
    models:model_id (name, technologies (name))
  `)
      .in('id', finalIds)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching detailed series:', error);
      return [];
    }

    return (data || []).map((row: any) => {
      const reception =
        row.receptions ||
        row.service_orders?.receptions ||
        null;
      const sapDoc =
        row.service_orders?.sap_transfer_documents?.sap_document_number ||
        reception?.sap_document ||
        null;
      return {
        ...row,
        receptions: reception
          ? { ...reception, sap_document: reception.sap_document || sapDoc }
          : null,
      };
    });
  } catch (error) {
    console.error('Error fetching detailed series:', error);
    return [];
  }
}

export async function updateSeriesStatus(id: string, status: string, additionalData?: any) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { data, error } = await supabase
    .from('series')
    .update({ 
      current_status: status,
      ...additionalData,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select();

  if (error) return { error: error.message };

  await logAdvancedAudit({
    module: 'Trazabilidad',
    tableName: 'series',
    recordId: id,
    action: 'CAMBIO_ESTATUS',
    newValues: { status, ...additionalData },
    observations: `Estatus actualizado a: ${status}`
  });

  return { data };
}

export async function updateBulkSeriesStatus(ids: string[], status: string, additionalData?: any) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { error } = await supabase
    .from('series')
    .update({ 
      current_status: status,
      ...additionalData,
      updated_at: new Date().toISOString()
    })
    .in('id', ids);

  if (error) return { error: error.message };

  // Log para cada serie actualizada
  const auditPromises = ids.map(id => logAdvancedAudit({
    module: 'Trazabilidad',
    tableName: 'series',
    recordId: id,
    action: 'CAMBIO_ESTATUS',
    newValues: { status, ...additionalData },
    observations: `Estatus actualizado en lote a: ${status}`
  }));
  await Promise.allSettled(auditPromises);

  return { success: true };
}

