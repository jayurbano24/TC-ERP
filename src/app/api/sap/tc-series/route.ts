import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const PAGE_SIZE = 1000;

async function fetchAllRows<T extends Record<string, unknown>>(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  table: string,
  select: string,
  filter?: { column: string; op: 'not.is'; value: null }
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;

  while (true) {
    let query = supabase.from(table).select(select).range(from, from + PAGE_SIZE - 1);
    if (filter) {
      query = query.not(filter.column, 'is', filter.value);
    }
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;
    all.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}

export async function GET() {
  const supabase = getSupabaseServerClient();

  try {
    const series = await fetchAllRows<{ id: string; serial_number: string; service_order_id: string }>(
      supabase,
      'series',
      'id, serial_number, service_order_id',
      { column: 'service_order_id', op: 'not.is', value: null }
    );

    const equipos = await fetchAllRows<{ id: string; main_serial: string }>(
      supabase,
      'service_orders',
      'id, main_serial'
    );

    return NextResponse.json({
      success: true,
      series,
      equipos,
      total_series: series.length,
      total_equipos: equipos.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('Error fetching TC series:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
