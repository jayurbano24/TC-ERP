# sap-transfer — Reglas de negocio

**Versión:** 1.0 | **IDs prefijo:** R-ST (sap-transfer) + R-shared

---

## Reglas compartidas (shared kernel)

| ID | Regla | Validación | Legacy |
|----|-------|------------|--------|
| **R-010** | Courier ≠ Agencia CAC | `isCourierLabel(agency, reception.carrier)` debe ser false | `cacAgencyUtils.ts` |
| **R-011** | Una guía puede tener N documentos SAP | UNIQUE `(reception_guide_id, sap_document_number)` | Migration 024 |
| **R-012** | Un documento SAP agrupa N equipos | `series.sap_transfer_id`, `service_orders.sap_transfer_id` | Migration 024 |
| **R-013** | CAC requiere Backoffice antes de bodega | Fuera de este módulo; precondición upstream | backoffice |

---

## Reglas de registro SAP

| ID | Regla | Precondición | Error usuario |
|----|-------|--------------|---------------|
| **R-ST-01** | Número SAP obligatorio | `sapDocumentNumber.trim() !== ''` | "El número de Documento SAP es obligatorio" |
| **R-ST-02** | Agencia CAC obligatoria | `agency.trim() !== ''` | "Debe indicar la Agencia CAC" |
| **R-ST-03** | Agencia no puede ser courier | R-010 | "El valor corresponde al Courier, no a Agencia CAC" |
| **R-ST-04** | Idempotencia por guía+SAP | Si existe, retornar existente | RPC `create_or_get_sap_transfer_document` |
| **R-ST-05** | Completar agency vacía | Si doc existe sin agency, actualizar si agency válida | `createOrGetSapTransfer` L77–93 |

---

## Reglas de clasificación batch

| ID | Regla | Precondición | Postcondición |
|----|-------|--------------|---------------|
| **R-ST-10** | Al menos 1 equipo | `units.length > 0` | — |
| **R-ST-11** | main_serial obligatorio por unidad | Skip si vacío | — |
| **R-ST-12** | OS única por equipo | Insert `service_orders`; label TC-XXX único | `uq_service_orders_os_label` |
| **R-ST-13** | Reentry count | `count(existing OS for main_serial) + 1` | Campo `reentry_count` |
| **R-ST-14** | Series upsert | `onConflict: serial_number` | Rollback OS si falla series |
| **R-ST-15** | Estado inicial serie | `RECEPCIONADO_BODEGA_GENERAL` | — |
| **R-ST-16** | Estado inicial OS | `INGRESADO` | — |
| **R-ST-17** | Vínculo SAP | OS y series llevan `sap_transfer_id` | — |
| **R-ST-20** | Documento SAP en manifiesto | UI: botón Agregar disabled sin SAP | R-020 production |

---

## Reglas de atomicidad (objetivo Fase 1 — CHG pendiente)

| ID | Regla | Estado actual | Objetivo |
|----|-------|---------------|----------|
| **R-030** | Clasificar = 1 transacción | Loop secuencial; rollback parcial OS | RPC `classify_equipment_batch_tx` |
| **R-031** | Fallo = rollback completo | Solo rollback OS si falla series en 1 unidad | TX PostgreSQL |

**Impacto CHG-001:** Ver `migration-notes.md`

---

## Reglas de consulta

| ID | Regla | Descripción |
|----|-------|-------------|
| **R-ST-30** | Get by series | Si `series.sap_transfer_id` null → null |
| **R-ST-31** | Historial por SAP | Agrupar entries por `sapTransferId` en traceability |

---

## Matriz regla → implementación actual

| ID | Archivo | Función |
|----|---------|---------|
| R-ST-01–05 | `sapTransfers.ts` | `createOrGetSapTransfer` |
| R-ST-10–17 | `sapTransfers.ts` | `classifyEquipmentBatch` |
| R-ST-04 | `027_sap_transfer_rls_fix.sql` | RPC |
| R-010 | `cacAgencyUtils.ts` | `isCourierLabel` |
| R-ST-20 | `backoffice/page.tsx` | `isActiveSapDocumentFilled` |

---

## Anti-patrones detectados (no duplicar)

| Problema | Ubicación | Acción Fase 2 |
|----------|-----------|---------------|
| Reglas courier duplicadas en parsing notes | `historyTrayUtils.ts` | Usar shared domain |
| Loop + N queries reentry | `classifyEquipmentBatch` | RPC batch |
| Audit N+1 en loop | `classifyEquipmentBatch` L187–194 | Evento único post-TX |

---

## Referencias

- Casos de uso: `use-cases.md`
- Estados: `state-machine.md`
- Returns (downstream): `../returns/business-rules.md` R-RN-10–12
