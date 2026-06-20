# Módulo: outbound-dispatch

| Campo | Valor |
|-------|-------|
| **Bounded context** | `outbound-dispatch` |
| **Estado doc** | Aprobado negocio — sin implementación lote |
| **ADR** | ADR-002 D2 |
| **Legacy** | `dispatches`, `dispatch_items`, `warehouse.dispatchBoxFromWarehouse` |

---

## Propósito

Gestionar **salida de equipos por Caja**, opcionalmente agrupados en un **Lote de Salida** (`DispatchBatch`) para consulta, finanzas y Centro de Documentos.

---

## Decisiones de negocio

| # | Decisión |
|---|----------|
| 1 | **Unidad de despacho = Caja** (`boxes`) |
| 2 | **Lote de Salida** = agrupador de N despachos/cajas para trazabilidad futura |
| 3 | Gate SAP: `sap_integration_status = Validado SAP` (existente) |
| 4 | PO (si aplica): equipos despachados deben poder filtrarse por `production_order_id` |

---

## Modelo objetivo

### `dispatch_batches` (Lote de Salida) — NUEVA

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | PK |
| `batch_number` | TEXT UNIQUE | Ej. `LS-2026-00123` |
| `status` | TEXT | `ABIERTO`, `CERRADO`, `DESPACHADO` |
| `destination` | TEXT | Cliente / ruta / agencia |
| `guide_outbound` | TEXT | Guía salida opcional |
| `opened_by` | TEXT | |
| `closed_at` | TIMESTAMPTZ | |
| `document_center_ref` | TEXT | Ref externa Centro Documentos |

### Extensiones tablas existentes

| Tabla | Columna nueva | Descripción |
|-------|---------------|-------------|
| `dispatches` | `dispatch_batch_id` | UUID NULL FK → dispatch_batches |
| `dispatches` | `box_id` | FK explícita a caja despachada |
| `boxes` | `last_dispatch_batch_id` | Último lote al despachar |

### Relaciones

```
dispatch_batches (1)
    └── dispatches (N)     ← un registro por operación de caja
            └── dispatch_items (N)  ← series en la caja
            └── box_id → boxes
```

---

## Flujo operativo objetivo

```mermaid
sequenceDiagram
    participant Op as Operador Despacho
    participant DB as dispatch_batches
    participant Box as Caja
    participant SAP as Validación SAP

    Op->>DB: Abrir Lote Salida (opcional recomendado)
    Op->>Box: Escanear series en caja
    Box->>SAP: Verificar Validado SAP
    Op->>DB: Despachar Caja → crea dispatch + items
    Note over DB: dispatch.dispatch_batch_id = lote
    Op->>DB: Cerrar Lote cuando todas cajas listas
```

---

## Reglas de negocio

| ID | Regla |
|----|-------|
| R-DS-01 | Despacho físico siempre a nivel **caja** |
| R-DS-02 | `dispatch_batch_id` opcional en fase 1; configurable obligatorio después |
| R-DS-03 | Series en caja deben ser homogéneas (material/lote SAP) — regla existente despacho |
| R-DS-04 | Cerrar lote solo si todas cajas del lote están `DESPACHADO` |
| R-DS-05 | Consulta futura: `GET /dispatch-batches/{id}` retorna árbol cajas → series → OS → PO |
| R-DS-06 | Equipo despachado dispara evento `equipment.dispatched` → finanzas |

---

## Coexistencia legacy

| Hoy | Mañana |
|-----|--------|
| `dispatchBoxFromWarehouse` sin lote | Mismo + `dispatch_batch_id` opcional |
| `dispatches` sin batch | Backfill `dispatch_batches` para histórico opcional |
| UI `/despacho` por caja | Añadir selector "Lote de Salida" |

---

## Consulta futura (ejemplo)

**Pregunta:** "¿Qué salió en el Lote LS-2026-00123?"

**Respuesta estructurada:**
- Lote metadata (destino, fechas, usuario)
- Lista cajas (box_code)
- Por caja: series S1–S4, OS TC-XXX, PO si aplica
- Costo total (desde finance-costing)

---

## CHG planeados

| ID | Descripción |
|----|-------------|
| CHG-010 | Migración `dispatch_batches` + FKs |
| CHG-011 | UI despacho: selector lote |
| CHG-012 | API read dispatch-batches (ADR-003) |

---

## Referencias

- Legacy: `src/lib/database/warehouse.ts`, `src/app/(erp)/despacho/page.tsx`
- `../accessories-dispatch/README.md` (mismo concepto lote, dominio accesorios)
- `../finance-costing/README.md`
