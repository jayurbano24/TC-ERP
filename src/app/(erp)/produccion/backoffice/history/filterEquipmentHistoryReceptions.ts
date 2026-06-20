/** Filtra recepciones CAC para la bandeja de historial de equipos (excluye accesorios/teléfonos y estados finales de recepción). */
export function filterEquipmentHistoryReceptions(data: any[]): any[] {
  /** Estados de serie que no deben aparecer en historial global (salida definitiva). */
  const EXCLUDED_SERIES_STATUSES = new Set(['in_scraps', 'dispatched']);

  const filtered = data
    .map((rec: any) => ({
      ...rec,
      series: (rec.series || []).filter((s: any) => {
        if (!s.brand_id) return false;
        const cStatus = (s.current_status || '').toLowerCase().trim();
        if (EXCLUDED_SERIES_STATUSES.has(cStatus)) return false;
        return true;
      }),
    }))
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
