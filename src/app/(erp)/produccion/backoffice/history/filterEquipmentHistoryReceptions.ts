/** Filtra recepciones CAC para la bandeja de historial de equipos (excluye accesorios/teléfonos y estados finales). */
export function filterEquipmentHistoryReceptions(data: any[]): any[] {
  const filtered = data
    .map((rec: any) => {
      const boxedOsIds = new Set(
        (rec.series || [])
          .filter((s: any) => s.current_box_id && s.service_orders?.id)
          .map((s: any) => s.service_orders.id)
      );

      return {
        ...rec,
        series: rec.series
          ? rec.series.filter((s: any) => {
              if (s.current_box_id) return false;
              if (s.service_orders?.id && boxedOsIds.has(s.service_orders.id)) return false;
              const cStatus = (s.current_status || '').toLowerCase().trim();
              const shouldFilter = [
                'in_workshop',
                'in_qc',
                'in_l3',
                'in_scraps',
                'in_control_warehouse',
                'in_central_warehouse',
                'ready_to_dispatch',
                'dispatched',
              ].includes(cStatus);
              if (shouldFilter) return false;
              return true;
            })
          : [],
      };
    })
    .filter((rec: any) => {
      const notes = (rec.notes || '').toLowerCase();
      const recStatus = (rec.status || '').toUpperCase().trim();

      const EXCLUDED_STATUSES = [
        'ELIMINADO',
        'ELIMINADO POR BODEGA',
        'DEVUELTO_A_AGENCIA',
        'FINALIZADO',
        'PROCESADO',
      ];
      if (EXCLUDED_STATUSES.includes(recStatus)) return false;

      const guideCategories: string[] = (rec.reception_guides || []).map((rg: any) =>
        (rg.category || '').toLowerCase()
      );
      const evidenceAccesorio =
        guideCategories.some((c: string) => c === 'accesorio') ||
        notes.includes('backoffice_category: accesorio');
      const evidenceTelefono =
        guideCategories.some((c: string) => c === 'telefono') ||
        notes.includes('backoffice_category: teléfono') ||
        notes.includes('backoffice_category: movil');
      const evidenceEquipo =
        guideCategories.some((c: string) => c === 'equipo') ||
        notes.includes('backoffice_category: equipo');
      const hasEquipMeta =
        notes.includes('backoffice_tech:') ||
        notes.includes('backoffice_brand:') ||
        notes.includes('backoffice_model:');

      if (evidenceAccesorio && !evidenceEquipo && !hasEquipMeta) return false;
      if (evidenceTelefono && !evidenceEquipo && !hasEquipMeta) return false;

      const validSeriesCount = (rec.series || []).filter((s: any) => !!s.brand_id).length;
      if (validSeriesCount > 0) return true;

      if (evidenceEquipo || hasEquipMeta) return true;

      const BACKOFFICE_PROCESSED_STATUSES = [
        'CLASIFICADA',
        'RECIBIDO_BACKOFFICE',
        'PENDIENTE DE CLASIFICAR',
        'EN_PROCESO_BACKOFFICE',
      ];
      if (BACKOFFICE_PROCESSED_STATUSES.includes(recStatus) && !evidenceAccesorio && !evidenceTelefono) {
        const hasSeries = (rec.series || []).length > 0;
        const hasReceptionGuides = (rec.reception_guides || []).length > 0;
        const hasClassifNotes =
          notes.includes('guías procesadas:') ||
          notes.includes('--- detalles backoffice') ||
          notes.includes('backoffice_agency:');
        return hasSeries || hasReceptionGuides || hasClassifNotes;
      }

      return false;
    });

  return filtered;
}
