# sap-transfer — Modelo de dominio

**Versión:** 1.0 | **Fecha:** 2026-06-18

---

## 1. Agregado raíz: `SapTransferDocument`

Representa un **Documento SAP** dentro de una guía courier específica.

### 1.1 Identidad

| Campo | Tipo | Obligatorio |
|-------|------|-------------|
| `id` | UUID | Sí (generado) |
| `receptionId` | UUID | Sí |
| `receptionGuideId` | UUID | Sí |
| `sapDocumentNumber` | `SapDocumentNumber` VO | Sí |

**Invariante:** `(receptionGuideId, sapDocumentNumber)` único — constraint `uq_sap_transfer_per_guide`.

### 1.2 Atributos

| Campo | Tipo | Reglas |
|-------|------|--------|
| `agency` | string | Agencia CAC; ≠ courier |
| `registeredBy` | string | Usuario que registra |
| `status` | `SapTransferStatus` | Ver state-machine.md |
| `createdAt` | timestamp | Auto |
| `updatedAt` | timestamp | Auto |

### 1.3 Relaciones (fuera del agregado)

| Relación | Cardinalidad | Tabla |
|----------|--------------|-------|
| → ServiceOrder | 1:N | `service_orders.sap_transfer_id` |
| → Series | 1:N | `series.sap_transfer_id` |
| → ReceptionGuide | N:1 | `reception_guides.id` |
| → Reception | N:1 | `receptions.id` |

---

## 2. Value Object: `SapDocumentNumber`

| Regla | Descripción |
|-------|-------------|
| No vacío | Tras `trim()` |
| Normalización | `trim()`; conservar case original |
| Unicidad | Por guía, no global |

**Responsabilidad única:** validar formato mínimo del número SAP.

---

## 3. Entidad relacionada: `EquipmentUnit` (no persistida como tabla)

Agregado lógico usado en clasificación batch.

| Campo | Descripción |
|-------|-------------|
| `mainSerial` | S1 — identificador principal |
| `allSeries` | `[S1, S2?, S3?, S4?]` |
| `modelId` | FK models |
| `brandId` | FK brands |
| `material` | Opcional (EMTA) |
| `sapTransferId` | FK al documento SAP |

**Invariante:** `mainSerial === allSeries[0]`.

---

## 4. Entidad: `ServiceOrder` (vista parcial del módulo)

Campos relevantes para sap-transfer:

| Campo | Seteado por sap-transfer |
|-------|--------------------------|
| `reception_id` | Sí |
| `reception_guide_id` | Sí (desde SAP doc) |
| `sap_transfer_id` | Sí |
| `main_serial` | Sí |
| `model_id`, `brand_id` | Sí |
| `reentry_count` | Sí (calculado) |
| `status` | `INGRESADO` |
| `os_label` | Generado DB (`TC-XXXXX`) |

---

## 5. Entidad: `Series` (vista parcial)

| Campo | Seteado por classify batch |
|-------|----------------------------|
| `serial_number` | Sí (upsert) |
| `service_order_id` | Sí |
| `sap_transfer_id` | Sí |
| `current_reception_id` | Sí |
| `current_status` | `RECEPCIONADO_BODEGA_GENERAL` |
| `model_id`, `brand_id` | Sí |

---

## 6. Domain Events (objetivo Fase 2)

| Evento | Payload mínimo | Consumidores |
|--------|----------------|--------------|
| `SapTransferRegisteredEvent` | sapTransferId, guideId, sapNumber | audit, timeline |
| `EquipmentClassifiedEvent` | sapTransferId, osId, serials[] | audit, traceability |
| `SapTransferBlockReturnedEvent` | sapTransferId, unitsCount | returns, audit |

**Fase 1:** audit vía `logAdvancedAudit` (legacy).  
**Fase 2:** dual-write a `domain_events`.

---

## 7. Shared kernel: CAC Agency

Reglas compartidas con `production-classification` y `returns`:

| Función dominio | Legacy |
|-----------------|--------|
| `isCourierLabel(name, carrier)` | `cacAgencyUtils.ts` |
| `sanitizeCacAgencyRaw(raw, carrier, agencies)` | `cacAgencyUtils.ts` |

**Destino:** `shared/domain/cac-agency/` (única copia).

---

## 8. Diagrama de agregados

```
┌─────────────────────┐
│  Reception (ext)    │
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│  ReceptionGuide     │
└──────────┬──────────┘
           │ 1:N
┌──────────▼──────────────────┐
│  SapTransferDocument (AR)   │
│  - sapDocumentNumber        │
│  - agency (CAC)             │
│  - status                   │
└──────────┬──────────────────┘
           │ 1:N
    ┌──────┴──────┐
    ▼             ▼
ServiceOrder    Series[]
```

---

## Referencias

- Tablas: `tables-and-relations.md`
- Reglas: `business-rules.md`
- Estados: `state-machine.md`
