import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { computeWarrantyExportRows } from '@/modules/warranty/server/warrantySummaryService';

export const maxDuration = 180;

function fmt(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('es-GT');
}

export const GET = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
    }

    const rows = await computeWarrantyExportRows(supabase);
    const sheetRows = rows.map((r) => ({
      'Orden de Servicio': r.osLabel,
      'Serie principal': r.mainSerial,
      Tecnología: r.technology,
      Marca: r.brand,
      Modelo: r.model,
      'Elegible garantía': r.elegibleGarantia,
      Perfil: r.profile,
      'Fecha despacho': fmt(r.dispatchedAt),
      'Vence garantía': fmt(r.warrantyEndsAt),
      'Estado garantía':
        r.warrantyStatus === 'en_garantia'
          ? 'Vigente'
          : r.warrantyStatus === 'vencida'
            ? 'Vencida'
            : 'N/A',
    }));

    const ws = XLSX.utils.json_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Warranty Pack');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const stamp = new Date().toISOString().slice(0, 10);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="WARRANTY_PACK_${stamp}.xlsx"`,
      },
    });
  },
  { module: 'despacho', action: 'warranty_export', roles: ROLES_BODEGA_DESPACHO }
);
