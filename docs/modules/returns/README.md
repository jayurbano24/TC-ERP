# Módulo: returns

| Campo | Valor |
|-------|-------|
| **Bounded context** | `returns` |
| **Responsabilidad** | Devolución de equipos: individual, lote y bloque por Documento SAP |
| **Dueño datos** | Mutación `series`, `service_orders`, `receptions`, `sap_transfer_documents` |
| **Fase ADR-001** | Piloto Fase 1–2 (junto con sap-transfer) |

---

## Propósito

Gestionar la **salida reversa** de equipos del flujo operativo:

1. **Devolución individual** — una serie por SN.
2. **Devolución de lote** — toda la recepción.
3. **Devolución en bloque SAP** — todas las unidades de un `sap_transfer_id`.
4. **Reversión** — regresar lote a Backoffice (`PENDIENTE_BACKOFFICE`).

---

## Límites del módulo

### Incluye

- Validar elegibilidad para devolución.
- Aplicar estado `RETURNED` / `returned` en series.
- Actualizar OS y SAP doc en devolución bloque.
- Auditoría de devoluciones.
- Undo de devolución de lote.

### No incluye

- Registro de guías categoría `devolucion` en recepción (→ `logistics-reception`).
- UI bandeja devoluciones completa (orquestación en page; reglas aquí).
- Clasificación inicial (→ `sap-transfer` + `production-classification`).

---

## Dependencias

| Módulo | Tipo | Contrato |
|--------|------|----------|
| `sap-transfer` | Upstream | `sap_transfer_id`, `processBlockReturnBySapTransfer` |
| `logistics-reception` | Upstream | `receptions`, guides categoría devolución |
| `production-classification` | UI entry | Block return desde historial |
| `platform/audit` | Transversal | `logAdvancedAudit` |

**Acoplamiento actual:** `returns.ts` re-exporta `processBlockReturnBySapTransfer` desde `sapTransfers.ts`.  
**Objetivo Fase 2:** `returns` consume puerto `SapTransferReturnPort` implementado por `sap-transfer`.

---

## Estructura objetivo

```
modules/returns/
├── domain/
│   ├── return-request.vo.ts
│   ├── block-return-policy.ts      # R-RN-10, R-RN-11, R-RN-12
│   └── return-status.enum.ts
├── application/
│   ├── register-individual-return.use-case.ts
│   ├── process-full-reception-return.use-case.ts
│   ├── process-block-return-by-sap.use-case.ts
│   └── undo-full-reception-return.use-case.ts
├── infrastructure/
│   └── returns.repository.ts
└── README.md
```

**Legacy:** `src/lib/database/returns.ts` + `processBlockReturnBySapTransfer` en `sapTransfers.ts`

---

## Casos de uso

| ID | Nombre | Doc |
|----|--------|-----|
| UC-RN-01 | RegisterIndividualReturn | `use-cases.md` |
| UC-RN-02 | ProcessFullReceptionReturn | `use-cases.md` |
| UC-RN-03 | ProcessBlockReturnBySap | `use-cases.md` |
| UC-RN-04 | UndoFullReceptionReturn | `use-cases.md` |
| UC-RN-05 | GetReturnedSeries | `use-cases.md` |

---

## Documentación

| Archivo | Contenido |
|---------|-----------|
| `domain-model.md` | VOs, políticas |
| `business-rules.md` | R-RN-* |
| `state-machine.md` | Transiciones series/reception/SAP |
| `use-cases.md` | Especificación completa |
| `tables-and-relations.md` | Tablas afectadas |
| `migration-notes.md` | CHG planeados |

---

## Rutas UI

| Ruta | Flujos |
|------|--------|
| `/logistica/devoluciones` | Individual, lote, bandeja |
| `/produccion/backoffice` | Block return desde historial |

---

## Referencias código

- `src/lib/database/returns.ts`
- `src/lib/database/sapTransfers.ts` (`processBlockReturnBySapTransfer`)
- `src/app/(erp)/logistica/devoluciones/page.tsx`
