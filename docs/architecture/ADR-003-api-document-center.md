# ADR-003 — API e integración Centro de Documentos

| Campo | Valor |
|-------|-------|
| **Estado** | Propuesta técnica — sin implementación |
| **Fecha** | 2026-06-18 |
| **Depende de** | ADR-001, ADR-002 |

---

## Contexto

TC-ERP evolucionará a un **esquema completo** de dominio (operaciones, PO, lotes, finanzas, RRHH). Un **Centro de Documentos** externo (o módulo documental corporativo) necesitará:

- Consultar y registrar documentos de PO aprobadas
- Cerrar Lotes de Salida con evidencia
- Recibir eventos de despacho (caja / accesorio)
- Exponer metadatos para auditoría y KPI

---

## Principios de integración

| # | Principio |
|---|-----------|
| 1 | **API-first** — toda entidad nueva expone contrato REST + eventos |
| 2 | **Idempotencia** — `Idempotency-Key` en POST críticos |
| 3 | **Versionado** — `/api/v1/`; breaking changes → v2 |
| 4 | **Auth** | Service account + JWT; scopes por módulo |
| 5 | **No acoplar UI** — Centro Documentos consume API, no Supabase directo |

---

## Superficie API propuesta (v1)

### Producción (PO)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/v1/production-orders` | Listar PO (filtros status, taller) |
| GET | `/api/v1/production-orders/{id}` | Detalle PO + OS vinculadas |
| POST | `/api/v1/production-orders` | Crear PO (Taller) |
| PATCH | `/api/v1/production-orders/{id}/status` | Aprobar / cerrar |

### Despacho

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/v1/dispatch-batches` | Lotes de salida |
| GET | `/api/v1/dispatch-batches/{id}` | Detalle: cajas, series, accesorios |
| POST | `/api/v1/dispatch-batches` | Abrir lote |
| POST | `/api/v1/dispatch-batches/{id}/close` | Cerrar lote |
| POST | `/api/v1/dispatches/box` | Despachar caja (requiere `dispatch_batch_id` opcional → luego requerido) |

### Accesorios

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/v1/accessories/dispatch` | OUT con `dispatch_batch_id` opcional |
| GET | `/api/v1/accessories/stock` | Nuevo + recuperado |

### Finanzas (lectura)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/v1/finance/dispatch-cost-analysis` | Costo vs despacho por período |
| GET | `/api/v1/finance/equipment-unit-economics/{osId}` | Costo acumulado por equipo |

### Eventos (webhook saliente TC → Centro Documentos)

| Evento | Payload mínimo |
|--------|----------------|
| `production_order.approved` | po_id, po_number, qty |
| `dispatch_batch.closed` | batch_id, box_count, unit_count |
| `equipment.dispatched` | os_id, series[], dispatch_batch_id? |
| `accessory.dispatched` | accessory_id, qty, condition, batch_id? |

---

## Esquema OpenAPI

**Ubicación futura:** `docs/api/openapi-v1.yaml`  
**Generación:** Desde DTOs TypeScript o manual en Fase 4.

---

## Seguridad

| Scope | Permisos |
|-------|----------|
| `po:read` / `po:write` | Production orders |
| `dispatch:read` / `dispatch:write` | Batches, boxes |
| `finance:read` | Reportes costo |
| `documents:sync` | Centro Documentos full read |

---

## Implementación por fases

| Fase | Alcance API |
|------|-------------|
| 4a | Read-only: PO, dispatch-batches, consulta |
| 4b | Write: crear/cerrar lote, despacho caja |
| 4c | Webhooks + Centro Documentos bidireccional |

**Sin código hasta:** tablas ADR-002 migradas + CHG aprobados.

---

## Referencias

- ADR-002 decisiones PO / Lote
- `modules/platform-api/README.md` (pendiente)
