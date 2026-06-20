# Módulo: sap-transfer

| Campo | Valor |
|-------|-------|
| **Bounded context** | `sap-transfer` |
| **Responsabilidad** | Agrupación de equipos por Documento SAP dentro de una guía courier |
| **Dueño datos** | `sap_transfer_documents`, FKs en `service_orders` y `series` |
| **Fase ADR-001** | Piloto Fase 1–2 |

---

## Propósito

Formaliza la relación:

```
ReceptionGuide (1) → SapTransferDocument (N) → ServiceOrder / Series (N)
```

Permite:

- Manifiesto Backoffice con N documentos SAP por guía.
- Clasificación batch de equipos vinculados a un SAP doc.
- Devolución en bloque por `sap_transfer_id`.
- Historial global agrupado por documento SAP.

---

## Límites del módulo

### Incluye

- Crear u obtener documento SAP (`createOrGetSapTransfer`).
- Validar agencia CAC ≠ courier.
- Clasificar equipos en batch (`classifyEquipmentBatch`).
- Consultar SAP doc por serie.
- Estados del documento SAP.

### No incluye

- Recepción CAC/ PX (→ `logistics-reception`).
- UI manifiesto / pistoleo (→ `production-classification`).
- Devolución (→ `returns`; consume `sap_transfer_id`).
- Ingreso físico bodega (→ `warehouse`).
- Validación SAP batch externa (→ `sap-integration`).

---

## Dependencias

| Módulo | Tipo | Contrato |
|--------|------|----------|
| `logistics-reception` | Upstream | Provee `receptions`, `reception_guides` |
| `production-classification` | Orquestador UI | Llama casos de uso SAP |
| `returns` | Downstream | `processBlockReturnBySapTransfer` |
| `platform/audit` | Transversal | `logAdvancedAudit` |
| `shared/cac-agency` | Shared kernel | `isCourierLabel`, `sanitizeCacAgencyRaw` |

---

## Estructura objetivo (hexagonal — ADR-004)

Ver [`hexagonal-layout.md`](../../architecture/hexagonal-layout.md). Resumen:

```
src/modules/sap-transfer/
├── domain/          # entidades, reglas, ports
├── application/     # classify-equipment-batch.handler.ts, etc.
├── infrastructure/  # supabase repo + rpc adapter + legacy bridge
└── interfaces/      # hooks para backoffice, API handlers
```

**Código legacy actual:** `src/lib/database/sapTransfers.ts` → envuelto por `infrastructure/legacy/` hasta CHG-003.  
**Migración:** Strangler — handlers delegan a legacy bridge; RPC reemplaza bridge con feature flag.

---

## Casos de uso (resumen)

| ID | Nombre | Doc detalle |
|----|--------|-------------|
| UC-ST-01 | RegisterSapDocument | `use-cases.md` |
| UC-ST-02 | ClassifyEquipmentBatch | `use-cases.md` |
| UC-ST-03 | GetSapTransferBySeries | `use-cases.md` |

---

## Documentación del módulo

| Documento | Contenido |
|-----------|-----------|
| `domain-model.md` | Entidades, agregados, VOs |
| `business-rules.md` | R-010 a R-013, R-020, R-030 |
| `state-machine.md` | Estados SAP doc |
| `use-cases.md` | Pre/post condiciones, errores |
| `tables-and-relations.md` | Schema, índices, RPC |
| `migration-notes.md` | Legacy, flags, CHG planeados |

---

## Métricas

| KPI | Descripción |
|-----|-------------|
| SAP docs sin equipos | Docs creados sin OS asociada |
| Clasificaciones huérfanas | OS sin series (debe → 0 post RPC) |
| Block return success rate | Devoluciones bloque completadas / intentadas |

---

## Referencias código actual

- `web/src/lib/database/sapTransfers.ts`
- `web/supabase/migrations/024_sap_transfer_documents.sql`
- `web/supabase/migrations/027_sap_transfer_rls_fix.sql`
- `web/src/lib/cacAgencyUtils.ts`
