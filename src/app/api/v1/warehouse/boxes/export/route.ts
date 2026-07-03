import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import * as XLSX from 'xlsx';

export async function GET(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  if (!supabase) {
    return NextResponse.json({ error: 'SERVER_CLIENT_REQUIRED' }, { status: 500 });
  }

  try {
    // 1. Obtener catálogos para resolver IDs a Nombres (Marcas, Modelos, Tecnologías)
    const [techRes, brandRes, modelRes] = await Promise.all([
      supabase.from('technologies').select('id, name'),
      supabase.from('brands').select('id, name'),
      supabase.from('models').select('id, name, technology_id')
    ]);

    const techs = new Map((techRes.data || []).map(t => [t.id, t.name]));
    const brands = new Map((brandRes.data || []).map(b => [b.id, b.name]));
    const models = new Map((modelRes.data || []).map(m => [m.id, m]));

    // 2. Obtener TODAS las cajas y un muestreo de series para deducción
    const { data: boxes, error } = await supabase
      .from('boxes')
      .select(`
        id, box_code, rack_location, capacity, created_at,
        series (id, brand_id, model_id, current_status, recibio)
      `)
      .neq('rack_location', 'DESPACHO')
      .neq('rack_location', 'ELIMINADO')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // 3. Transformar los datos para el Excel
    const rows = (boxes || []).map(box => {
      const parts = String(box.rack_location || '').split(' - ');
      const isSinRack = !box.rack_location || box.rack_location === 'SIN RACK';
      const rackVal = isSinRack ? '' : parts[0]?.replace('RACK-', '') || box.rack_location || '';
      const nivelVal = parts[1]?.replace('NIVEL-', '') || '';
      const posicionVal = parts[2]?.replace('POSICION-', '') || '';

      const firstSeries = (box.series && box.series.length > 0) ? box.series[0] : null;
      const modelData = firstSeries?.model_id ? models.get(firstSeries.model_id) : null;
      const techId = modelData ? modelData.technology_id : null;
      
      const techName = techId ? techs.get(techId) : '---';
      const brandName = firstSeries?.brand_id ? brands.get(firstSeries.brand_id) : 'N/A';
      const modelName = modelData ? modelData.name : 'N/A';
      
      const seriesCount = box.series?.length || 0;
      const isFull = seriesCount >= (box.capacity || 1);
      const status = isFull ? 'Full' : 'Parcial';
      const receivedBy = firstSeries?.recibio || 'SISTEMA';

      return {
        'ID Caja': box.id,
        'Código Caja': box.box_code || '',
        'Fecha Ingreso': new Date(box.created_at).toLocaleString(),
        'Tecnología': techName || '---',
        'Marca': brandName || 'N/A',
        'Modelo': modelName || 'N/A',
        'Ubicación': isSinRack ? 'SIN RACK' : box.rack_location,
        'Rack': rackVal,
        'Nivel': nivelVal,
        'Posición': posicionVal,
        'Área': 'Bodega Central',
        'Unidades': seriesCount,
        'Capacidad': box.capacity || 0,
        'Estatus': status,
        'Usuario Ingreso': String(receivedBy).split('@')[0],
      };
    });

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No hay datos para exportar' }, { status: 404 });
    }

    // 4. Generar el Excel
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 38 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 15 },
      { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 20 },
    ];
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Detalle Cajas');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // 5. Retornar el archivo como descarga
    const today = new Date().toISOString().slice(0, 10);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Reporte_Detalle_Cajas_${today}.xlsx"`,
      },
    });
  } catch (err: any) {
    console.error('Export Error:', err);
    return NextResponse.json({ error: 'Error generando reporte' }, { status: 500 });
  }
}
