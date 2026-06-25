import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * SEC-04: el número de serie es input no confiable. Se acota longitud y charset
 * (alfanumérico + separadores habituales) antes de usarlo en la consulta.
 */
const QuerySchema = z.object({
  sn: z
    .string()
    .trim()
    .min(1, "Parámetro 'sn' es requerido")
    .max(120)
    .regex(/^[A-Za-z0-9._\-/ ]+$/, "Formato de serie inválido"),
});

export async function GET(request: Request) {
  const supabase = getSupabaseServerClient();
  const { searchParams } = new URL(request.url);

  const parsed = QuerySchema.safeParse({ sn: searchParams.get('sn') ?? '' });
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Parámetro 'sn' inválido" },
      { status: 400 }
    );
  }
  const sn = parsed.data.sn;

  try {
    // 1. Fetch series and service order
    const { data: seriesData, error: seriesError } = await supabase
      .from('series')
      .select(`
        *,
        service_orders(
          id, os_label, sap_integration_status, last_sap_sync,
          series(serial_number, sap_status)
        )
      `)
      .eq('serial_number', sn)
      .single();

    if (seriesError || !seriesData) {
       return NextResponse.json({ success: false, error: "Serie no encontrada en inventario TC" }, { status: 404 });
    }

    const equipoId = seriesData.service_orders?.id;

    // 2. Fetch latest validation details for this equipo
    let validationDetails = null;
    if (equipoId) {
       const { data: vData, error: vError } = await supabase
         .from('sap_validation_details')
         .select(`
            *,
            sap_validation_sessions(fecha_fin, upload_id, sap_uploads(archivo, hash_sha256))
         `)
         .eq('equipo_id', equipoId)
         .order('id', { ascending: false })
         .limit(4);
         
       if (!vError && vData) {
         validationDetails = vData;
       }
    }

    return NextResponse.json({ success: true, data: { series: seriesData, validations: validationDetails } });
  } catch (error: any) {
    console.error("Error querying SAP series:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
