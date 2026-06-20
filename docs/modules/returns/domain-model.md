# returns — Modelo de dominio

**Versión:** 1.0

---

## 1. Value Object: `ReturnRequest`

Datos mínimos para registrar una devolución.

| Campo | Tipo | Req | Notas |
|-------|------|-----|-------|
| `serialNumber` | string | Individual | SN principal |
| `motivo` | string | Sí | Razón devolución |
| `guiaSalida` | string | Sí | Tracking salida |
| `observaciones` | string | No | Lote / bloque |
| `originalGuide` | string | No | Validación cruzada |

---

## 2. Value Object: `BlockReturnRequest`

| Campo | Tipo | Req |
|-------|------|-----|
| `sapTransferId` | UUID | Sí |
| `motivo` | string | Sí |
| `guiaSalida` | string | Sí |
| `registeredBy` | string | Sí |

---

## 3. Política de dominio: `BlockReturnPolicy`

**Responsabilidad única:** decidir si devolución individual está permitida.

### Input
- `series` con `sap_transfer_id`, `current_status`
- Count de series activas mismo SAP doc

### Output
- `allowed: boolean`
- `requiresBlockReturn: boolean`
- `reason: string`

### Reglas encapsuladas
- R-RN-10: serie debe existir
- R-RN-11: si SAP doc tiene >1 unidad en `RECEPCIONADO_BODEGA_GENERAL` → block required
- R-RN-12: bloque solo si todas en estado elegible

---

## 4. Agregados afectados (vista returns)

| Agregado | Rol en devolución |
|----------|-------------------|
| `Series` | Estado → RETURNED; notes devolución |
| `ServiceOrder` | Estado → DEVUELTO (bloque) |
| `SapTransferDocument` | Estado → DEVUELTO_BLOQUE |
| `Reception` | Estado → DEVUELTO (lote); notes |

---

## 5. Domain Events (objetivo)

| Evento | Cuándo |
|--------|--------|
| `IndividualReturnRegisteredEvent` | UC-RN-01 éxito |
| `FullReceptionReturnedEvent` | UC-RN-02 |
| `BlockReturnCompletedEvent` | UC-RN-03 |
| `ReturnUndoneEvent` | UC-RN-04 |

---

## 6. Integración con sap-transfer

```
returns.application.ProcessBlockReturnBySap
    → sap-transfer.infrastructure (puerto)
        → UPDATE sap_transfer_documents
        → (coordinado con series + OS)
```

**Estado actual:** función en `sapTransfers.ts` importada por `returns.ts` — acoplamiento directo a refactorizar en Fase 2.

---

## Referencias

- Reglas: `business-rules.md`
- Casos de uso: `use-cases.md`
- Integración: `../sap-transfer-returns/integration.md`
