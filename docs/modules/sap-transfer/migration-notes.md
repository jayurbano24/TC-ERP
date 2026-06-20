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
| Módulo `modules/sap-transfer/` | `src/modules/sap-transfer/` | **CHG-003 en curso** |

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

### CHG-002: Sync `INGRESADO_BODEGA`

| Campo | Valor |
|-------|-------|
| **Módulo co-dueño** | `warehouse` |
| **Trigger** | Todas series SAP doc → `IN_CENTRAL_WAREHOUSE` |
| **Riesgo** | Bajo |
| **Fase** | 2 |

### CHG-003: Extraer módulo interno

| Campo | Valor |
|-------|-------|
| **Acción** | Mover lógica a `modules/sap-transfer/application/` |
| **UI** | Backoffice delega a use cases |
| **Riesgo** | Bajo (misma API pública) |
| **Fase** | 2 |

---

## 3. Orden de ejecución recomendado

```
1. ~~CHG-001 classify RPC~~ ✓
2. CHG-004 block return RPC — aplicar 030 + paridad
3. CHG-005 full reception return RPC
4. Default flags true (fuera de pico)
5. ~~CHG-003 extracción módulo sap-transfer~~ en curso — handlers + adapters
6. CHG-006 port returns ↔ sap-transfer
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
