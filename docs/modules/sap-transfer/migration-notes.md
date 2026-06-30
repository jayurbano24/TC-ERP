# sap-transfer — Notas de migración

**Versión:** 1.0 | Estrategia: Strangler Fig

---

## 1. Estado actual (baseline)

| Componente | Ubicación | Estado |
|------------|-----------|--------|
| Lógica dominio | `src/lib/database/sapTransfers.ts` | Monolito lib |
| UI manifiesto | `src/app/(erp)/produccion/backoffice/page.tsx` | Acoplada |
| RPC create | `027_sap_transfer_rls_fix.sql` | Producción |
| RPC classify TX | `029_classify_equipment_batch_tx.sql` | Producción (flag) |
| RPC block return TX | `030_block_return_by_sap_transfer_tx.sql` | Listo — aplicar en Supabase |
| Módulo `modules/sap-transfer/` | `src/modules/sap-transfer/` | **CHG-003 cerrado** — 100% hexagonal/RPC, legacy bridge retirado |

---

## 2. Cambios planeados (sin código aún)

### CHG-001: RPC classify atómica

| Campo | Valor |
|-------|-------|
| **Impacto** | Alto positivo — elimina OS huérfanas |
| **Riesgo operativo** | Medio |
| **Flag** | `USE_ATOMIC_CLASSIFY=true` |
| **Rollback** | Flag false; legacy loop |
| **Tablas** | `service_orders`, `series` (write) |
| **Reglas** | R-030, R-031 |

Ver plantilla: `docs/architecture/impact-change-template.md`

### CHG-004: RPC block return atómica (co-dueño returns)

| Campo | Valor |
|-------|-------|
| **Impacto** | Alto positivo — elimina estados parciales en devolución bloque |
| **Riesgo operativo** | Medio |
| **Flag** | `USE_ATOMIC_BLOCK_RETURN=true` |
| **Migración** | `030_block_return_by_sap_transfer_tx.sql` |
| **Doc** | [CHG-004](../../changes/CHG-004-block-return-rpc.md) |
| **Reglas** | R-RN-30–35, R-031 |

### CHG-002: Sync `INGRESADO_BODEGA` ✓ IMPLEMENTADO

| Campo | Valor |
|-------|-------|
| **Módulo co-dueño** | `warehouse` |
| **Trigger** | Todas series SAP doc → `in_central_warehouse` (con caja) |
| **Implementación** | RPC `warehouse_sync_sap_for_series` (migración `055`) + `syncSapTransferIngresadoForSeries` en `warehouse.ts` |
| **Riesgo** | Bajo — aditivo, idempotente, sin flag |
| **Doc** | [CHG-002](../../changes/CHG-002-warehouse-sap-sync.md) |
| **Pendiente** | Aplicar migración `055` en Supabase |

### CHG-003: Extraer módulo interno ✓ CERRADO

| Campo | Valor |
|-------|-------|
| **Acción** | Lógica en `modules/sap-transfer/application/` (handlers) + `infrastructure/rpc/` (adapters atómicos) |
| **UI** | Backoffice / despacho consumen `classifyEquipmentBatch` / `processBlockReturnBySapTransfer` vía módulo (factory) |
| **Cierre** | RPC atómico es el único path vivo; adapters legacy y flags `USE_LEGACY_SAP_TRANSFER` (kill-switch falso, no cableado) eliminados |
| **Riesgo** | Nulo en runtime — el path legacy ya era inalcanzable antes de eliminarlo |

---

## 3. Orden de ejecución recomendado

```
1. ~~CHG-001 classify RPC~~ ✓
2. CHG-004 block return RPC — aplicar 030 + paridad
3. CHG-005 full reception return RPC
4. Default flags true (fuera de pico)
5. ~~CHG-003 extracción módulo sap-transfer~~ ✓ cerrado — 100% hexagonal/RPC, legacy retirado
6. ~~CHG-006 port returns ↔ sap-transfer~~ ✓ — `SapTransferReturnPort` inyectado en `returns/factory`
7. CHG-002 sync warehouse (con warehouse module)
```

---

## 4. Coexistencia legacy

| Legacy | Mantener hasta |
|--------|----------------|
| `sapTransfers.ts` exports | Fase 2 completa |
| Parsing SAP en notes | Fase 3 dual-read |
| `createOrGetSapTransfer` fallback insert | RPC siempre disponible |

---

## 5. Datos históricos

| Situación | Acción |
|-----------|--------|
| Equipos sin `sap_transfer_id` | `migrate_sap_transfers.js` (ventana nocturna) |
| OS sin SAP link | `repair_sap_linkage.js` |
| Clasificación en notes sin OS | `repair_orphan_cac.js` |

**Regla:** No backfill automático en horario pico.

---

## 6. Métricas post-migración

| Métrica | Query conceptual |
|---------|------------------|
| OS sin series | `service_orders` LEFT JOIN series WHERE series.id IS NULL |
| Series sin SAP en CAC reciente | `series` WHERE sap_transfer_id IS NULL AND source cac |
| SAP docs vacíos | `sap_transfer_documents` sin series |

---

## 7. Checklist antes de primer código

- [x] ADR-001 aprobado
- [x] Glosario publicado
- [x] Catálogo estados publicado
- [x] CHG-001 impacto redactado — [changes/CHG-001-classify-atomic-rpc.md](changes/CHG-001-classify-atomic-rpc.md)
- [ ] Paridad tests CHG-001 en staging
- [x] Feature flag naming acordado — `USE_ATOMIC_CLASSIFY`

---

## Referencias

- ADR: `../../architecture/ADR-001-monolith-modular-evolution.md`
- Integración returns: `../sap-transfer-returns/integration.md`
