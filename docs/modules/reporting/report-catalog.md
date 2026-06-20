# Catálogo de reportes — TC-ERP

**Módulo:** `reporting`  
**Versión catálogo:** 1.0 | **Fecha:** 2026-06-18

Códigos canónicos para `report_definitions.code`. Columnas deben alinearse con [`glossary.md`](../../architecture/glossary.md).

---

## Leyenda estado

| Estado | Significado |
|--------|-------------|
| ✅ Operativo | Export funciona hoy (en UI dispersa) |
| 🔶 Parcial | Datos reales pero lógica frágil (`notes`) |
| 📋 Diseño | Requiere módulo futuro (PO, lote, finanzas) |
| 🆕 Nuevo | No existe; solo requisito |

---

## 1. CAC / Recepción

### `RECEPCION_HISTORICO_CAC` ✅

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Histórico recepciones CAC |
| **Fuente** | `receptions`, `reception_guides` |
| **Legacy** | `recepcion/HistoryTab.tsx` |
| **Filtros** | Rango fechas, estatus, guía |
| **Columnas** | Fecha, No. Recepción, Piloto, Recibió, Estatus, Unidades |

### `RECEPCION_HISTORICO_PX` ✅

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Histórico recepciones PX |
| **Fuente** | `receptions` (source=px) |
| **Legacy** | `recepcion/HistoryTab.tsx` |
| **Columnas** | Fecha, Doc SAP, Agencia PX, Usuario, Cajas, Equipos, Estatus |

### `CAC_CLASIFICACION_HISTORICO` ✅ 🔶

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Histórico clasificación CAC (equipos) |
| **Fuente** | `service_orders`, `series`, `sap_transfer_documents`, `receptions` |
| **Legacy** | `backoffice/page.tsx` `handleExportReport` |
| **Filtros** | Rango fechas, agencia, guía, SAP, tecnología |
| **Columnas** | Fecha/Hora, Guía, Piloto, Courier, Recibió, Estatus, OS, Ingreso, Agencia, Tech, Marca, Modelo, Doc SAP, S1–S4 |
| **Nota** | Migrar parsing `notes` a provider estructurado |

### `CAC_MANIFIESTO` 🔶

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Manifiesto recepción (por lote/guía) |
| **Formato** | PDF imprimible + Excel |
| **Legacy** | Modal manifiesto backoffice |

---

## 2. Logística / Devoluciones

### `DEVOLUCIONES_RESUMEN` 🔶

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Devoluciones por período |
| **Fuente** | `returns`, `service_orders`, `sap_transfer_documents` |
| **Filtros** | Fechas, tipo devolución, agencia, SAP |
| **Columnas** | Fecha, Guía, SAP, OS, Series, Motivo, Usuario |

### `DEVOLUCIONES_BLOQUE_SAP` 🆕

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Devoluciones en bloque por documento SAP |
| **Fuente** | `returns` + `sap_transfer_id` |
| **Depende** | CHG-004 returns atómico |

---

## 3. Bodega

### `INVENTARIO_CAJAS` ✅

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Inventario bodega (cajas) |
| **Fuente** | `boxes`, `series` |
| **Legacy** | `bodega/inventario/page.tsx` |
| **Columnas** | Caja, OS, Series, Ubicación, Estatus, Fecha ingreso |

### `INVENTARIO_ACCESORIOS` ✅

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Stock accesorios nuevo/recuperado |
| **Fuente** | `accessories`, `accessory_movements` |
| **Columnas** | Código, Descripción, Qty Nuevo, Qty Recuperado, Último movimiento |

### `BODEGA_MOVIMIENTOS` 🆕

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Movimientos bodega por período |
| **Fuente** | `boxes`, audit, warehouse events |

---

## 4. Despacho

### `DESPACHO_PENDIENTES` ✅

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Cajas pendientes de despacho |
| **Fuente** | `boxes`, `dispatches`, validación SAP |
| **Legacy** | `despacho/page.tsx` |
| **Columnas** | Caja, OS, Cliente, SAP status, Fecha listo |

### `DESPACHO_HISTORICO` 🆕

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Despachos realizados por período |
| **Fuente** | `dispatches`, `dispatch_items` |
| **Filtros** | Fechas, destino, cliente |

### `DESPACHO_POR_LOTE_SALIDA` 📋

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Contenido de Lote de Salida |
| **Fuente** | `dispatch_batches`, cajas, accesorios |
| **Depende** | CHG-010 outbound-dispatch |
| **Columnas** | Lote, Caja/OS, Series, Accesorios, Condición, Fecha cierre |

### `DESPACHO_ACCESORIOS_SIN_LOTE` 📋

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Salidas accesorios directas |
| **Fuente** | `accessory_movements` WHERE `dispatch_mode=WITHOUT_BATCH` |
| **Depende** | accessories-dispatch |

---

## 5. Taller / PO

### `PO_EQUIPOS_EN_PROCESO` 📋

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Equipos por orden de producción |
| **Fuente** | `production_orders`, `service_orders` |
| **Depende** | production-order CHG-040 |

### `PO_HORAS_HOMBRE` 📋

| Campo | Valor |
|-------|-------|
| **Nombre UI** | HH imputadas a PO |
| **Fuente** | RRHH + vínculo PO |
| **Uso** | Finanzas + supervisión taller |

### `TALLER_PRODUCTIVIDAD` 🔶

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Productividad técnico por día |
| **Fuente** | `kpi-engine.ts` / `domain_events` futuro |
| **Nota** | Puede vivir en `kpi-analytics`; reporting exporta detalle |

---

## 6. Finanzas

### `FIN_COSTO_VS_DESPACHO` 📋

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Análisis costo vs despacho |
| **Fuente** | `cost_ledger_entries`, `dispatch_batches` |
| **Depende** | finance-costing CHG-020 |
| **Dimensiones** | Por lote salida, período, tecnología |

### `FIN_COSTO_INGRESO` 📋

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Costo de ingreso por equipo |
| **Tipos ledger** | INGRESO_RECEPCION, INGRESO_BODEGA, INVENTARIO_CARRY |

### `FIN_MATERIALES_VS_DESPACHO` 📋

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Materiales asignados vs equipos despachados |
| **Fuente** | `material_allocations`, despachos |

### `FIN_PAGO_POR_EQUIPO` 📋

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Pago operativo por equipo despachado |
| **Tipo ledger** | DESPACHO_UNIT |

---

## 7. RRHH

### `RRHH_ASISTENCIA` ✅

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Marcaciones / asistencia |
| **Fuente** | `zk_raw_logs`, `employees` |
| **Legacy** | `rrhh/ReportesTab.tsx` |
| **Hexagonal parcial** | `GetReporteAsistenciaQuery` |

### `RRHH_AUSENCIAS` ✅

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Ausencias por período |
| **Legacy** | `ReportesTab.tsx` `handleAusencias` |

### `RRHH_TARDANZAS` ✅

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Tardanzas y salidas anticipadas |
| **Legacy** | `ReportesTab.tsx` |

### `RRHH_PLANILLA` ✅

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Nómina quincenal export |
| **Legacy** | `PlanillaTab.tsx` |
| **Sensibilidad** | Rol restringido — R-RP-04 |

### `RRHH_EXPEDIENTE` ✅

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Plantilla empleados |
| **Legacy** | `GestionPersonalTab.tsx` |

---

## 8. SAP / Integración

### `SAP_DIFERENCIAS` 🔶

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Diferencias archivo SAP vs TC |
| **Fuente** | `sap_validation_details`, `sap_validation_runs` |
| **Módulo dueño** | sap-integration |

### `SAP_NO_VALIDADOS` 🔶

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Equipos pendientes validación SAP |
| **Uso** | Gate despacho |

---

## 9. Trazabilidad / Auditoría

### `TRAZA_SERIE_EXPORT` 🆕

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Historial movimientos por serie/OS |
| **Fuente** | `audit`, `series` |
| **Relación** | Complementa `/consulta` — export masivo |

### `AUDIT_ACCIONES_USUARIO` 🆕

| Campo | Valor |
|-------|-------|
| **Nombre UI** | Log acciones por usuario/período |
| **Fuente** | `audit` / `domain_events` |

---

## 10. Gerencial (BI)

Estos reportes alimentan **`gestion-bi`** (gráficos) y se exportan desde **`reporting`** (tablas):

| Código | Nombre | Fuente |
|--------|--------|--------|
| `BI_PRODUCCION_DIARIA` | Producción por día/tech | kpi-analytics |
| `BI_EFICIENCIA_OPERATIVA` | Eficiencia vs metas | kpi-goals + kpi-engine |
| `BI_CAPACIDAD_TALLER` | Ocupación técnicos | RRHH + taller |

`/gestion/bi` hoy usa **datos mock** — objetivo: conectar a providers reales.

---

## Prioridad migración (Strangler)

| Orden | Código | Impacto operativo |
|-------|--------|-------------------|
| 1 | `CAC_CLASIFICACION_HISTORICO` | Alto — uso diario backoffice |
| 2 | `DESPACHO_PENDIENTES` | Alto |
| 3 | `RECEPCION_HISTORICO_*` | Medio |
| 4 | `RRHH_*` | Medio — datos sensibles |
| 5 | `INVENTARIO_*` | Medio |
| 6 | Reportes 📋 finanzas/PO/lote | Tras módulos dueños |

---

## Referencias

- Módulo: [`README.md`](README.md)
- Glosario: [`../../architecture/glossary.md`](../../architecture/glossary.md)
