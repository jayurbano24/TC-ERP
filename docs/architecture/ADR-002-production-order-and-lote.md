# ADR-002 — PO (Taller), Despacho por Caja + Lote Salida, Finanzas por Equipo

| Campo | Valor |
|-------|-------|
| **Estado** | **Aprobado — decisiones de negocio 2026-06-18** |
| **Depende de** | ADR-001, ecosystem-map.md |
| **Supersede** | Preguntas abiertas de ADR-002 borrador |

---

## Decisiones de negocio (confirmadas)

### D1 — PO (Orden de Producción)

| Decisión | Detalle |
|----------|---------|
| **Alcance PO** | Solo **Taller** y equipos **almacenados en Bodega** |
| **Fuera de PO** | Backoffice CAC, recepción, clasificación inicial — usan flujo Guía → Documento SAP → OS |
| **Origen PO** | Determinada en **Taller** (solicitud interna TC); API futura a **Centro de Documentos** |
| **No implementado hoy** | Tabla `production_orders` — diseño en `modules/production-order/` |

### D2 — Despacho equipos

| Decisión | Detalle |
|----------|---------|
| **Unidad operativa despacho** | **Caja** (`boxes`) — como hoy en bodega/despacho |
| **Agrupación consulta** | **Lote de Salida** (`DispatchBatch`) — opcional en accesorios, recomendado en equipos para trazabilidad |
| **Relación** | 1 Lote Salida → N Cajas despachadas → N series/equipos |
| **No implementado hoy** | `dispatch_batches`, FK en `dispatches` y `boxes` |

### D3 — Finanzas / costeo

| Decisión | Detalle |
|----------|---------|
| **Pago operativo** | Por **equipo despachado**, NO por actividad genérica |
| **Deprecar** | Modelo `activity_costs` como base de pago (mantener solo análisis auxiliar si aplica) |
| **Análisis requerido** | Costos vs despacho, compra materiales, costo ingreso, manejo inventario, **horas hombre bajo PO** |
| **Módulo** | `finance-costing` — ver `modules/finance-costing/` |

### D4 — Bodega Accesorios (Nuevo + Recuperado)

| Decisión | Detalle |
|----------|---------|
| **Stock** | `qty_new` / `qty_recovered` por accesorio |
| **Despacho con Lote** | Movimiento OUT asociado a `dispatch_batch_id` |
| **Despacho sin Lote** | Movimiento OUT directo (urgente / retail / ajuste) |
| **Condición** | `NEW` o `RECOVERED` en cada movimiento |

### D5 — API / Centro de Documentos

| Decisión | Detalle |
|----------|---------|
| **Integración** | API REST para esquema completo TC-ERP ↔ Centro de Documentos |
| **PO** | Sincronización solicitudes aprobadas (futuro) |
| **Lotes salida** | Consulta y cierre documental |
| **ADR dedicado** | ADR-003 |

---

## Modelo objetivo (resumen entidades nuevas)

```
production_orders (PO)           ← solo Taller + equipos en bodega
    └── service_orders.po_id

dispatch_batches (Lote Salida)   ← agrupador consulta
    ├── dispatches (por caja)
    │     └── dispatch_items → series
    └── accessory_movements (OUT con/sin lote)

cost_ledger_entries              ← finanzas: equipo despachado, materiales, HH
```

---

## Qué NO cambia (ADR-001 piloto)

- Flujo CAC: Reception → Guide → SapTransferDocument → OS → Series
- sap-integration: validación archivo SAP (gate despacho)
- RRHH: planilla y asistencia (alimenta HH en finanzas)

---

## Fases de implementación (ampliación ADR-001)

| Fase | Entregable |
|------|------------|
| **2b** | Tablas PO + dispatch_batches (migración, sin romper legacy) |
| **2c** | Despacho caja amarrado a lote (equipos) |
| **2d** | Accesorios OUT con/sin lote |
| **3b** | finance-costing por equipo despachado |
| **4** | API Centro de Documentos (ADR-003) |

**Regla:** Strangler — despacho actual sigue funcionando; lote es opt-in luego obligatorio por política.

---

## Consecuencias

| Positiva | Negativa / costo |
|----------|------------------|
| PO acotado a Taller evita sobrecargar Backoffice | Dos flujos paralelos (CAC vs PO-taller) |
| Lote salida habilita consulta y finanzas | Migración datos despachos históricos |
| Pago por equipo alinea finanzas con operación | Reemplazar `activity_costs` como métrica pago |
| API prepara ecosistema documental | Contrato API debe versionarse |

---

## Referencias

- `modules/production-order/README.md`
- `modules/outbound-dispatch/README.md`
- `modules/finance-costing/README.md`
- `modules/accessories-dispatch/README.md`
- `ADR-003-api-document-center.md`
