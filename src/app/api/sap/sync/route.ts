import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();

  try {
    const payload = await request.json();
    const { 
      fileInfo, // { name, hash, totalRows, user }
      results, // { encontrados, noEncontrados, inconsistencias, timeStr }
      validationDetails, // Array of sap_validation_details objects
      equiposUpdates, // Array of { id, sap_integration_status }
      seriesUpdates // Array of { id, sap_status }
    } = payload;

    // 1. Create upload record
    const { data: uploadData, error: uploadError } = await supabase
      .from('sap_uploads')
      .insert({
        archivo: fileInfo.name,
        hash_sha256: fileInfo.hash,
        usuario: fileInfo.user,
        registros: fileInfo.totalRows,
        encontrados: results.encontrados,
        no_encontrados: results.noEncontrados,
        inconsistencias: results.inconsistencias,
        tiempo_proceso: results.timeStr,
        estado: 'Completado'
      })
      .select()
      .single();

    if (uploadError) throw uploadError;

    // 2. Create validation session
    const { data: sessionData, error: sessionError } = await supabase
      .from('sap_validation_sessions')
      .insert({
        upload_id: uploadData.id,
        usuario: fileInfo.user,
        estado: 'Finalizado',
        fecha_fin: new Date().toISOString(),
        activa: true
      })
      .select()
      .single();

    if (sessionError) throw sessionError;

    const sessionId = sessionData.id;

    // Optional: Mark previous sessions as inactive (Obsoleto logic handled later or here)
    await supabase.from('sap_validation_sessions')
      .update({ activa: false })
      .neq('id', sessionId);

    // 3. Insert Validation Details in batches
    const BATCH_SIZE = 1000;
    for (let i = 0; i < validationDetails.length; i += BATCH_SIZE) {
      const batch = validationDetails.slice(i, i + BATCH_SIZE).map((d: any) => ({
        ...d,
        validation_id: sessionId
      }));
      const { error: detailError } = await supabase.from('sap_validation_details').insert(batch);
      if (detailError) console.error("Error inserting details batch:", detailError);
    }

    // 4. Update service_orders (Equipos) in batches
    for (let i = 0; i < equiposUpdates.length; i += BATCH_SIZE) {
      const batch = equiposUpdates.slice(i, i + BATCH_SIZE);
      // Supabase upsert requires all columns if not using RPC, but to just update we can loop or use a generic upsert if we select first. 
      // A better way is using an RPC, but since we don't have it, we can run concurrent updates
      await Promise.all(batch.map((eq: any) => 
        supabase.from('service_orders').update({
          sap_integration_status: eq.sap_integration_status,
          last_sap_sync: new Date().toISOString()
        }).eq('id', eq.id)
      ));
    }

    // 5. Update series in batches
    for (let i = 0; i < seriesUpdates.length; i += BATCH_SIZE) {
      const batch = seriesUpdates.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((s: any) => 
        supabase.from('series').update({
          sap_status: s.sap_status,
          sap_validation_id: sessionId
        }).eq('id', s.id)
      ));
    }

    return NextResponse.json({ success: true, sessionId });
  } catch (error: any) {
    console.error("Error syncing SAP data:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
