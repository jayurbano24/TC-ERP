# Catálogo de estados — TC-ERP

**Versión:** 1.0 | **Fecha:** 2026-06-18  
**Propósito:** Fuente única de verdad para estados válidos. Legacy mapeado via alias.

---

## 1. `receptions.status` (lote)

### 1.1 Estados canónicos

| Código canónico | Descripción | Terminal |
|-----------------|-------------|----------|
| `RECEPCIONADA` | CAC recibido; pendiente Backoffice | No |
| `PENDIENTE_CLASIFICAR` | Clasificación parcial | No |
| `CLASIFICADA` | Todas las guías procesadas | No |
| `PENDIENTE_BACKOFFICE` | Revertido desde devolución | No |
| `DEVUELTO` | Lote devuelto completo | Sí |
| `ARCHIVADO` | Cierre administrativo | Sí |
| `ELIMINADO` | Baja lógica recepción | Sí |
| `ELIMINADO_POR_BODEGA` | Baja desde bodega | Sí |
| `PROCESADO` | Elegible ingreso bodega (legacy) | No |
| `RECIBIDO_BACKOFFICE` | Procesado backoffice (legacy) | No |
| `FINALIZADO` | Cierre (legacy) | Sí |
| `DEVUELTO_A_AGENCIA` | Devolución agencia (legacy) | Sí |
| `DESPACHADO` | Despacho lote (legacy) | Sí |

### 1.2 Alias legacy → canónico

| Valor legacy en BD | Mapear a |
|--------------------|----------|
| `PENDIENTE DE CLASIFICAR` | `PENDIENTE_CLASIFICAR` |
| `ELIMINADO POR BODEGA` | `ELIMINADO_POR_BODEGA` |
| `RECIBIDO` | `RECEPCIONADA` (contextual) |

### 1.3 Transiciones permitidas (recepción)

```
RECEPCIONADA → PENDIENTE_CLASIFICAR → CLASIFICADA
CLASIFICADA → DEVUELTO → PENDIENTE_BACKOFFICE → CLASIFICADA
* → ARCHIVADO | ELIMINADO | ELIMINADO_POR_BODEGA (roles autorizados)
```

---

## 2. `reception_guides.status`

| Código | Descripción |
|--------|-------------|
| `PENDIENTE` | Guía sin clasificar |
| `CLASIFICADO` | Guía procesada en Backoffice |

### `reception_guides.category`

| Código | Flujo posterior |
|--------|-----------------|
| `equipo` | SAP + OS + series |
| `accesorio` | Sub-bodega accesorios |
| `telefono` | Sub-bodega teléfonos |
| `devolucion` | Bandeja devoluciones |

---

## 3. `sap_transfer_documents.status`

| Código | Descripción |
|--------|-------------|
| `PENDIENTE_INGRESO_BODEGA` | Post-clasificación; pre-bodega física |
| `INGRESADO_BODEGA` | Todas las series del doc en bodega central |
| `DEVUELTO_BLOQUE` | Devolución masiva aplicada |

**Gap actual:** `INGRESADO_BODEGA` definido pero no seteado en código TS.  
**Fase 1:** sincronizar al ingresar bodega (módulo `warehouse`).

---

## 4. `series.current_status`

### 4.1 Estados canónicos (objetivo)

| Canónico | Descripción |
|----------|-------------|
| `RECEPCIONADO_BODEGA_GENERAL` | Clasificado; pendiente ingreso físico |
| `IN_CENTRAL_WAREHOUSE` | En caja bodega central |
| `IN_WORKSHOP` | En taller |
| `IN_QC` | Control calidad |
| `IN_CONTROL_WAREHOUSE` | L3 / control |
| `IN_VALIDATION` | Validación |
| `READY_TO_DISPATCH` | Listo despacho |
| `DISPATCHED` | Despachado |
| `RETURNED` | Devuelto |
| `IRREPARABLE` | Scrap |
| `OBSOLETE` | Obsoleto |
| `ARCHIVED` | Archivado |

### 4.2 Alias legacy → canónico

| Legacy | Canónico |
|--------|----------|
| `INGRESADO` | `RECEPCIONADO_BODEGA_GENERAL` |
| `in_central_warehouse` | `IN_CENTRAL_WAREHOUSE` |
| `in_workshop` | `IN_WORKSHOP` |
| `in_qc` | `IN_QC` |
| `in_control_warehouse`, `in_l3` | `IN_CONTROL_WAREHOUSE` |
| `in_validation` | `IN_VALIDATION` |
| `ready_to_dispatch` | `READY_TO_DISPATCH` |
| `dispatched`, `DESPACHADO` | `DISPATCHED` |
| `returned` | `RETURNED` |
| `irreparable`, `in_scraps`, `scrapped` | `IRREPARABLE` |
| `obsolete` | `OBSOLETE` |
| `archivado` | `ARCHIVED` |
| `received` | `RECEPCIONADO_BODEGA_GENERAL` (contexto CAC) |

---

## 5. `service_orders.status`

| Código | Descripción |
|--------|-------------|
| `INGRESADO` | OS creada en clasificación |
| `DEVUELTO` | Devolución aplicada |
| `CERRADO` | Reservado futuro |

### `service_orders.sap_integration_status`

| Código | Gate |
|--------|------|
| `Pendiente Validación` | Default |
| `Validado SAP` | Requerido para despacho |

---

## 6. Tabla objetivo `entity_status_catalog` (Fase 1)

Propuesta de schema (no implementar hasta CHG aprobado):

```sql
-- entity_status_catalog (
--   entity_type TEXT,      -- 'reception' | 'series' | 'sap_transfer' | ...
--   status_code TEXT,
--   label_es TEXT,
--   is_terminal BOOLEAN,
--   sort_order INT,
--   PRIMARY KEY (entity_type, status_code)
-- )
-- entity_status_alias (
--   entity_type TEXT,
--   legacy_code TEXT,
--   canonical_code TEXT,
--   PRIMARY KEY (entity_type, legacy_code)
-- )
```

---

## 7. Implementación por fases

| Fase | Acción |
|------|--------|
| 0 | Este documento como referencia |
| 1 | Crear tablas catálogo + vista `v_series_status_canonical` |
| 2 | Domain layer usa solo códigos canónicos |
| 3 | Migración batch legacy → canónico (nocturna) |
| 4 | CHECK constraints en columnas críticas |

---

## Referencias

- ADR-001: `ADR-001-monolith-modular-evolution.md`
- Glosario: `glossary.md`
- Módulo SAP: `../modules/sap-transfer/state-machine.md`
- Módulo Returns: `../modules/returns/state-machine.md`
