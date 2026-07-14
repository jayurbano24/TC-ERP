/** Agrupa series enriquecidas por OS → filas UI (S1–S4) como en BodegaGestionV1. */
export function groupSeriesToUiRows(rawSeries: any[]): any[] {
  const grouped = (rawSeries || []).reduce((acc: Record<string, any[]>, s: any) => {
    const key = s.service_order_id || s.serial_number;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  return Object.values(grouped).map((group: any[]) => {
    group.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const main = group[0];
    const notes = main.receptions?.notes || '';
    const normalizedNotes = String(notes).replace(/\\n/g, '\n');
    const seriesNotes = String(main.notes || '').replace(/\\n/g, '\n');
    const agenciaFromSeries = seriesNotes.split('Agencia: ')[1]?.split('|')[0]?.split('\n')[0]?.trim();
    const guiaFromSeries = seriesNotes.split('Guía: ')[1]?.split('\n')[0]?.trim();
    const piloto = normalizedNotes.split('Piloto: ')[1]?.split('\n')[0]?.trim() || '---';
    const agenciaCAC =
      agenciaFromSeries ||
      normalizedNotes.split('Backoffice_Agency: ')[1]?.split('\n')[0]?.trim() ||
      main.receptions?.carrier ||
      '---';
    const techId =
      main.models?.technology_id ||
      normalizedNotes.split('Backoffice_Tech: ')[1]?.split('\n')[0]?.trim() ||
      '';
    const brandId =
      main.brand_id ||
      main.models?.brand_id ||
      normalizedNotes.split('Backoffice_Brand: ')[1]?.split('\n')[0]?.trim() ||
      '';
    const modelId =
      main.model_id ||
      main.models?.name ||
      normalizedNotes.split('Backoffice_Model: ')[1]?.split('\n')[0]?.trim() ||
      '';
    const reentryCount = main.service_orders?.reentry_count || 1;

    return {
      notes: main.notes,
      sn: main.serial_number,
      serial_number: main.serial_number,
      s1: group[0]?.serial_number || '',
      s2: group[1]?.serial_number || '',
      s3: group[2]?.serial_number || '',
      s4: group[3]?.serial_number || '',
      allSeries: group.map((g) => g.serial_number),
      material: main.material || '',
      lote: main.valuation || '',
      marca: brandId,
      modelo: modelId,
      tecnologia: techId,
      origen: main.receptions?.carrier || 'Desconocida',
      agenciaCAC,
      piloto,
      guia: guiaFromSeries || main.receptions?.guide_number || 'S/G',
      recibio:
        normalizedNotes.split('Recibido Por: ')[1]?.split('\n')[0]?.trim() ||
        main.receptions?.received_by ||
        'SISTEMA',
      estatus: main.receptions?.status || 'N/A',
      current_status: main.current_status || '',
      ordenServicio: main.service_orders?.os_label || 'S/OS',
      ingreso: `${reentryCount}° Ingreso`,
      sap_status: main.service_orders?.sap_integration_status || main.sap_status || 'Pendiente Validación',
      sap_integration_status: main.service_orders?.sap_integration_status,
      fechaHora: main.receptions?.created_at
        ? new Date(main.receptions.created_at).toLocaleString()
        : new Date(main.created_at).toLocaleString(),
      fechaRecepcion: new Date(main.created_at).toLocaleDateString(),
      timestamp: new Date(main.created_at).toLocaleTimeString(),
      service_orders: main.service_orders,
    };
  });
}
