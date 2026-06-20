import { NextResponse } from 'next/server';

/** @deprecated Use /api/backoffice/cac-history/tray */
export async function GET() {
  return NextResponse.json(
    {
      error: 'Endpoint deprecado. Use GET /api/backoffice/cac-history/tray',
      migrate: 'Ejecute migración 033_cac_tray_units.sql en Supabase',
    },
    { status: 410 }
  );
}
