import { NextRequest, NextResponse } from 'next/server';
import { queryTransferEligibleSeries } from '@/lib/database/cacTrayUnits';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const techId = sp.get('techId');
    const brandId = sp.get('brandId');
    const modelId = sp.get('modelId');

    if (!techId || !brandId || !modelId) {
      return NextResponse.json({ error: 'techId, brandId y modelId son requeridos' }, { status: 400 });
    }

    const items = await queryTransferEligibleSeries(techId, brandId, modelId);
    return NextResponse.json({ items });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al consultar equipos elegibles';
    console.error('cac-history/transfer-eligible:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
