import type { SapValidationState } from '@/modules/sap-integration';

export function normMatLot(value: unknown): string | null {
  const s = String(value ?? '').trim();
  return s ? s.toUpperCase() : null;
}

export function isIptvTechnologyName(name: string | null | undefined): boolean {
  return String(name ?? '')
    .trim()
    .toUpperCase() === 'IPTV';
}

export type ValuationBucket = 'valorado' | 'no_valorado';

/** Clasifica lote SAP en Valorado / No valorado (misma heurística que inventario). */
export function classifyValuationBucket(valuation: unknown): ValuationBucket | null {
  const raw = String(valuation ?? '').trim();
  if (!raw) return null;
  if (/novalorad|no\s*valorad/i.test(raw)) return 'no_valorado';
  if (/valorado/i.test(raw)) return 'valorado';
  return null;
}

/** ¿Misma regla de valoración para convivir en la misma Outbound? */
export function outboundValuationsMatch(boxValuation: unknown, eqValuation: unknown): boolean {
  const bv = normMatLot(boxValuation);
  const sv = normMatLot(eqValuation);
  if (!bv || !sv) return false;
  const bb = classifyValuationBucket(bv);
  const sb = classifyValuationBucket(sv);
  if (bb && sb) return bb === sb;
  return bv === sv;
}

export function materialsConflictForOutbound(
  aMat: unknown,
  aLot: unknown,
  bMat: unknown,
  bLot: unknown,
  options: { allowMultiMaterial: boolean }
): boolean {
  const am = normMatLot(aMat);
  const al = normMatLot(aLot);
  const bm = normMatLot(bMat);
  const bl = normMatLot(bLot);
  if (!options.allowMultiMaterial && am && bm && am !== bm) return true;
  if (al && bl && !outboundValuationsMatch(bl, al)) return true;
  return false;
}

export type OutboundScanMatValContext = {
  serial?: string | null;
  osLabel?: string | null;
};

/**
 * Material/Valoración vs caja Outbound.
 * IPTV: varios materiales; valoración (Valorado / No valorado) debe coincidir.
 */
export function checkOutboundScanMaterialValuation(
  eqMaterial: unknown,
  eqValuation: unknown,
  boxMat: unknown,
  boxVal: unknown,
  sapUnitStatus: SapValidationState,
  ctx: OutboundScanMatValContext,
  getSapStatusMeta: (status: SapValidationState) => { label: string },
  options: { allowMultiMaterial: boolean }
): { ok: true } | { ok: false; title: string; description: string } {
  const sm = normMatLot(eqMaterial);
  const sv = normMatLot(eqValuation);
  const bm = normMatLot(boxMat);
  const bv = normMatLot(boxVal);
  const sapLabel = getSapStatusMeta(sapUnitStatus).label;
  const who = [ctx.osLabel, ctx.serial].filter(Boolean).join(' · ') || 'Este equipo';
  const notValidated = sapUnitStatus !== 'Validado SAP';

  if (bm && !options.allowMultiMaterial) {
    if (!sm) {
      if (notValidated) {
        return {
          ok: false,
          title: 'Equipo no validado en Integración SAP',
          description:
            `${who} está en estado «${sapLabel}», por eso no tiene Material SAP y no puede entrar a esta Outbound (Material requerido: ${bm}). ` +
            `Vaya a Integración SAP → cargue/valide el Excel G985 (match) hasta «Validado SAP», luego vuelva a pistolear.`,
        };
      }
      return {
        ok: false,
        title: 'Sin Material SAP tras validación',
        description:
          `${who} figura «${sapLabel}» pero no trae Material en BD (la caja exige ${bm}). ` +
          `Re-sincronice en Integración SAP o corrija Material en la serie y reintente.`,
      };
    }
    if (sm !== bm) {
      return {
        ok: false,
        title: 'Material distinto al de la caja',
        description:
          `${who}: Material de la serie [${sm}] no coincide con el de la Outbound [${bm}]. ` +
          `No se pueden mezclar materiales en la misma caja.`,
      };
    }
  }

  if (options.allowMultiMaterial && !sm) {
    if (notValidated) {
      return {
        ok: false,
        title: 'Equipo no validado en Integración SAP',
        description:
          `${who} no tiene Material SAP. Valide en Integración SAP antes de pistoleo IPTV.`,
      };
    }
    return {
      ok: false,
      title: 'Sin Material SAP',
      description: `${who} debe tener Material SAP registrado (Outbound IPTV admite varios materiales, no series sin material).`,
    };
  }

  if (bv) {
    if (!sv) {
      if (notValidated) {
        return {
          ok: false,
          title: 'Equipo no validado en Integración SAP',
          description:
            `${who} está en estado «${sapLabel}», por eso no tiene Valoración (lote) SAP y no puede entrar a esta Outbound (Valoración requerida: ${bv}). ` +
            `Vaya a Integración SAP → valide el Excel G985 hasta «Validado SAP», luego vuelva a pistolear.`,
        };
      }
      return {
        ok: false,
        title: 'Sin Valoración SAP tras validación',
        description:
          `${who} figura «${sapLabel}» pero no trae Valoración en BD (la caja exige ${bv}). ` +
          `Re-sincronice en Integración SAP o corrija el lote y reintente.`,
      };
    }
    if (!outboundValuationsMatch(bv, sv)) {
      const bucket = classifyValuationBucket(bv);
      const bucketLabel =
        bucket === 'valorado' ? 'Valorado' : bucket === 'no_valorado' ? 'No valorado' : bv;
      return {
        ok: false,
        title: 'Valoración incompatible con la caja',
        description:
          `${who}: Valoración [${sv}] no coincide con la regla de la Outbound (${bucketLabel}). ` +
          (options.allowMultiMaterial
            ? 'En IPTV puede mezclar materiales, pero no mezclar Valorado con No valorado.'
            : 'No se pueden mezclar lotes en la misma caja.'),
      };
    }
  }
  return { ok: true };
}
