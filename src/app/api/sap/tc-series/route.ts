import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = getSupabaseServerClient();

  try {
    // We only need the serial numbers and their equipment IDs (service_order_id)
    // We will pull the latest ones to perform the match in the browser.
    // To handle 28k+, we can do a paginated fetch or a single fetch if within limits.
    // Supabase JS client defaults to 1000 limits unless specified, but we can bypass it by requesting just the required columns.
    
    // We get all series to cross-reference in the browser
    const { data: seriesData, error: seriesError } = await supabase
      .from('series')
      .select('id, serial_number, service_order_id')
      .not('service_order_id', 'is', null);

    if (seriesError) throw seriesError;

    // We get the service_orders (Equipos) to know their main_serial
    const { data: equiposData, error: equiposError } = await supabase
      .from('service_orders')
      .select('id, main_serial');

    if (equiposError) throw equiposError;

    return NextResponse.json({
      success: true,
      series: seriesData,
      equipos: equiposData,
    });
  } catch (error: any) {
    console.error("Error fetching TC series:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
