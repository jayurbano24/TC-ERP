# Glosario y nomenclatura — TC-ERP

Documento de referencia obligatorio antes de cualquier implementación.  
**Versión:** 1.0 | **Fecha:** 2026-06-18

---

## 1. Términos de negocio

| Término (UI) | Término dominio | Tabla / campo | Notas |
|--------------|-----------------|---------------|-------|
| Lote | `Reception` | `receptions` | Master CAC o recepción PX |
| Guía | `ReceptionGuide` | `reception_guides.guide_number` | Guía courier dentro del lote |
| Documento SAP | `SapTransferDocument` | `sap_transfer_documents` | Agrupador; N por guía |
| Orden de Servicio | `ServiceOrder` | `service_orders` | Label `TC-XXXXX` |
| Equipo | `EquipmentUnit` | Agregado OS + series | No es tabla |
| Serie / SN | `Series` | `series.serial_number` | S1 principal; S2–S4 siblings |
| Courier | `LogisticsCarrier` | `receptions.carrier` | Transportista; ≠ agencia |
| Agencia CAC | `CacAgency` | `reception_guides.agency`, `sap_transfer_documents.agency` | Punto de ingreso |
| Bandeja | `Inbox` / `Tray` | — | Concepto UI |
| Manifiesto | `ClassificationManifest` | En memoria (objetivo: tabla) | Ítems pre-clasificación |
| Devolución en bloque | `BlockReturnBySap` | — | Por `sap_transfer_id` |
| Pistoleo | `SerialScanning` | — | Captura S1–S4 |
| **PO / Orden Producción** | `ProductionOrder` | `production_orders` (futuro) | Solo Taller + bodega |
| **Lote de Salida** | `DispatchBatch` | `dispatch_batches` (futuro) | Agrupa cajas/accesorios despachados |
| **Lote recepción** | `ReceptionBatch` | `receptions` | No confundir con Lote Salida |
| **Lote SAP stock** | `SapStockBatch` | `sap_validation_details.lote` | Del archivo SAP |
| Caja | `WarehouseBox` | `boxes` | Unidad física despacho equipos |
| Despacho accesorio sin lote | `AccessoryDirectDispatch` | `accessory_movements` | `dispatch_mode=WITHOUT_BATCH` |
| Reporte | `ReportDefinition` | `report_definitions` | Catálogo; código canónico ej. `CAC_CLASIFICACION_HISTORICO` |
| Ejecución reporte | `ReportRun` | `report_runs` | Auditoría exportaciones |

---

## 1b. Capas hexagonal (ADR-004)

| Capa | Carpeta | Rol |
|------|---------|-----|
| Dominio | `domain/` | Entidades, reglas, **ports** (interfaces) |
| Aplicación | `application/` | Casos de uso, handlers, orquestación |
| Infraestructura | `infrastructure/` | Adaptadores Supabase, RPC, legacy bridge |
| Interfaces | `interfaces/` | UI hooks, API controllers (entrada) |
| Port | `domain/ports/*.port.ts` | Contrato que infraestructura implementa |
| Legacy bridge | `infrastructure/legacy/` | Delega a `lib/database` durante Strangler |

---

## 2. Fuentes de ingreso

| Código | Nombre | Flujo |
|--------|--------|-------|
| `cac` | Recepción CAC | Recepción → Backoffice → Bodega |
| `px` | Recepción PX | Clasificación en recepción → Bodega directa |

Constante DB: `reception_source` enum (`cac`, `px`).

---

## 3. Convenciones de código

### 3.1 Archivos y carpetas

| Tipo | Patrón | Ejemplo |
|------|--------|---------|
| Bounded context | `kebab-case/` | `sap-transfer/` |
| Caso de uso | `verb-noun.use-case.ts` | `register-sap-document.use-case.ts` |
| Repositorio | `noun.repository.ts` | `sap-transfer.repository.ts` |
| Entidad dominio | `noun.entity.ts` | `sap-transfer-document.entity.ts` |
| Value object | `noun.vo.ts` | `sap-document-number.vo.ts` |
| Evento dominio | `PascalCase` + `Event` | `EquipmentClassifiedEvent` |
| Hook UI | `use-kebab-case.ts` | `use-classification-flow.ts` |
| Constantes estado | `UPPER_SNAKE_CASE` | `PENDIENTE_INGRESO_BODEGA` |

### 3.2 TypeScript

| Ámbito | Convención |
|--------|------------|
| Interfaces / types dominio | `PascalCase` |
| Funciones puras dominio | `camelCase` verb-first |
| DTOs aplicación | sufijo `Dto` → `ClassifyEquipmentDto` |
| Errores dominio | sufijo `Error` → `BlockReturnNotAllowedError` |

### 3.3 Base de datos

| Elemento | Convención |
|----------|------------|
| Tablas | `snake_case` plural |
| Columnas | `snake_case` |
| RPC | `snake_case` verb_noun |
| Índices | `idx_tabla_columna` |
| Constraints | `uq_tabla_columnas`, `fk_tabla_ref` |

---

## 4. Estados — reglas de escritura

1. **Nuevos estados:** solo valores del catálogo (`entity-status-catalog.md`).
2. **Prohibido:** espacios en estados (`PENDIENTE DE CLASIFICAR` → migrar a `PENDIENTE_CLASIFICAR`).
3. **Legacy:** mapear via alias; no crear tercer sinónimo.
4. **Case:** estados canónicos en `UPPER_SNAKE_CASE` para recepciones y SAP; series pueden usar enum lowercase histórico con capa de traducción.

---

## 5. Módulos y prefijos

| Módulo | Carpeta | Prefijo eventos audit |
|--------|---------|----------------------|
| `logistics-reception` | `modules/logistics-reception/` | `RECEPCION_` |
| `production-classification` | `modules/production-classification/` | `CLASIFICACION_` |
| `sap-transfer` | `modules/sap-transfer/` | `SAP_TRANSFER_` |
| `returns` | `modules/returns/` | `DEVOLUCION_` |
| `production-order` | `modules/production-order/` | `PO_` |
| `outbound-dispatch` | `modules/outbound-dispatch/` | `DESPACHO_` |
| `finance-costing` | `modules/finance-costing/` | `COSTO_` |
| `accessories-dispatch` | `modules/accessories-dispatch/` | `ACCESORIO_` |
| `reporting` | `modules/reporting/` | `REPORTE_` |
| `kpi-analytics` | `modules/kpi-analytics/` | `KPI_` |
| `sap-integration` | integracion-sap | `SAP_FILE_` |
| `warehouse` | `modules/warehouse/` | `BODEGA_` |
| `workshop` | `modules/workshop/` | `TALLER_` |
| `platform` | `modules/platform/` | `SISTEMA_` |

---

## 6. Prohibiciones explícitas

| Prohibido | Alternativa |
|-----------|-------------|
| Nuevo parser de `receptions.notes` (post Fase 3.1) | Tabla `domain_events` |
| Reglas de negocio en `page.tsx` | Caso de uso en `application/` |
| Duplicar `isCourierLabel` | Import desde `domain/shared/cac-agency` |
| Estados ad-hoc en strings sueltos | Catálogo + CHECK constraint |
| Microservicio sin ADR | ADR-00X por servicio extraído |

---

## 7. Rutas UI (no cambiar en Fase 1–2)

| Ruta actual | Módulo dueño |
|-------------|--------------|
| `/recepcion` | `logistics-reception` |
| `/produccion/backoffice` | `production-classification` + `sap-transfer` |
| `/logistica/devoluciones` | `returns` |
| `/bodega/gestion` | `warehouse` |
| `/produccion/taller` | `workshop` |
| `/despacho` | `outbound-dispatch` |
| `/bodega/accesorios` | `accessories-dispatch` |
| `/gestion/costos` | `finance-costing` |
| `/reportes` | `reporting` |
| `/gestion/bi` | `gestion-bi` (+ consume reporting) |
| `/consulta` | `traceability` |

---

## 8. Referencias cruzadas

- ADR principal: `ADR-001-monolith-modular-evolution.md`
- Catálogo estados: `entity-status-catalog.md`
- Plantilla impacto: `impact-change-template.md`
- Módulo piloto SAP: `../modules/sap-transfer/README.md`
- Módulo piloto Returns: `../modules/returns/README.md`
