# TC-ERP — Mapeo operativo para manuales de mesa y carteles (Claro / TECHCORP)

**Versión del informe:** 2026-10-15  
**Alcance de revisión:** Solo lectura sobre `web/` (Next.js App Router, APIs, migraciones Supabase, documentación en `web/docs/`).  
**No verificado en este informe:** Comportamiento en producción con datos reales (sin acceso operativo a Supabase en esta sesión), aplicaciones externas fuera del repositorio, certificador de laboratorio fuera de `ont_runs`.

---

## Leyenda de madurez

| Etiqueta | Significado |
|----------|-------------|
| **Implementado** | Código + rutas + tablas/API identificables; flujo documentado en repo. |
| **Implementado parcialmente** | Existe UI o datos pero con gaps documentados en código/docs. |
| **Propuesto / pendiente** | Diseño en ADR/README sin modelo completo o ruta sin página. |
| **No verificable aquí** | No aparece en repo o depende de sistema externo no inspeccionado. |

---

## 1. Función de TC-ERP e integraciones

### 1.1 Qué registra TC-ERP durante la operación

TC-ERP es la **consola operativa web** que persiste en **Supabase (PostgreSQL)** la trazabilidad de recepción Claro (CAC y Planta Externa PX), clasificación Backoffice, órdenes de servicio (OS), series, pre-diagnóstico, bodega (cajas/racks), taller, integración SAP (validación contra archivo G985), despacho y consulta histórica.

**Registros principales (implementado — tablas/módulos en repo):**

| Dominio | Tablas / artefactos clave | Referencia |
|---------|---------------------------|------------|
| Recepción | `receptions`, `reception_guides`, `boxes` | `lib/database/receptions.ts`, `pxReceptionCapture.ts` |
| Clasificación / OS | `service_orders`, `series`, `sap_transfer_documents`, `cac_tray_units` | `persistEquipmentOnComplete.ts`, RPC classify |
| Pre-diagnóstico | `prediagnosticos`, `prediagnostico_revisiones`, `cat_prediagnostico_items`, `cat_prediagnostico_model_items` | Migración `251`, `253` |
| PX pre-diagnóstico | `px_reception_equipment`, `px_equipment_prediagnosticos` | Migración `254`, servicios PX |
| Bodega | `boxes` (`rack_location`, tipos OUTBOUND/SCRAP), `series.current_box_id` | `api/v1/warehouse/*` |
| Taller | `series.current_status`, bitácora `erp_audit_logs` | `workshopOperateService.ts`, `257_count_workshop_os_*` |
| SAP integración | `sap_uploads`, `service_orders.sap_integration_status`, `series.sap_status` | `/integracion-sap`, `/api/sap/*` |
| Despacho | `dispatches`, `dispatch_items` | `modules/despacho/` |
| Trazabilidad | `erp_audit_logs`, consulta + `service_order_serial_cycles`, `reentry_count` | `/consulta`, `traceability.ts` |
| KPI | `kpi_event_ledger` (derivado de auditoría) | `syncAuditFeed.ts`, migración `256` |
| Lab certificación (paralelo) | `ont_runs` (lectura/PDF en ERP) | `/reportes/ont-runs` — **no sustituye** flujo CAC |

### 1.2 Lyra, SAP, Orderry

| Sistema | ¿Aparece en código TC-ERP? | Relación inferida del repo |
|---------|----------------------------|----------------------------|
| **Lyra** | **No** — cero referencias funcionales en `web/src` (búsqueda por nombre). | **No verificable** si Lyra es otro producto, alias histórico o manual desactualizado. TC-ERP **no debe asumirse equivalente a Lyra** sin confirmación de negocio. |
| **SAP** | **Sí — integración indirecta / manual-asistida.** | No hay conector RFC/API SAP en repo. Operador sube **Excel/CSV G985** → match de series → actualiza estados `Validado SAP` / `Pendiente Validación` / etc. Documento SAP de recepción se captura en **Backoffice** al clasificar (`sap_transfer_documents`). Ver `docs/modules/sap-integration/README.md`. |
| **Orderry** | **No** — explícitamente excluido del panel de salud (`IntegrationsPanel.tsx`: “sin inventar Orderry”). | **No implementado** en TC-ERP. |

### 1.3 Quién conserva qué dato

| Dato | Sistema de registro (según repo) | Determina estado operativo |
|------|----------------------------------|----------------------------|
| Guía courier, unidades recepcionadas | TC-ERP `receptions` | Estatus recepción hasta Backoffice |
| OS TC-XXX, series S1–S4, documento SAP bloque | TC-ERP al finalizar clasificación | `service_orders`, `series` |
| Pre-diagnóstico (clase, dictamen, checks) | TC-ERP `prediagnosticos` (1:1 OS) | Dictamen de mesa CAC; **no** mueve solo por sí el `series.current_status` |
| Ubicación física bodega | TC-ERP caja + rack en `boxes` | `series.current_status` + `current_box_id` |
| Etapas taller | TC-ERP `series.current_status` + auditoría | **Estado operativo de piso taller/bodega** |
| Validación planta SAP | TC-ERP tras match G985 | Bloqueo despacho si ≠ `Validado SAP` (UI despacho) |
| Stock SAP real | **SAP ERP (externo)** | TC-ERP refleja validación, no ejecuta movimiento MM automático verificado aquí |
| Certificación lab ONT/EMTA | Certificador → Supabase `ont_runs` | ERP solo **consulta/reimprime** |

---

## 2. Etapas operativas (mapeo actividad → sistema)

> Los nombres de mesa del manual Claro se mapean a **módulos reales**. Varias mesas comparten pantalla (ej. QC dentro de Taller).

### 2.1 Recepción e ingreso

| Ítem | Detalle |
|------|---------|
| **Estado** | **Implementado** (CAC + PX unificado); rutas legacy CAC/PX mock parcial. |
| **Ruta / pantalla** | `/recepcion` (`recepcion/page.tsx`); PX detalle en componentes `PxReceptionTab`, cajas PX. |
| **Roles** | `receptor_cac`, `receptor_px`, `supervisor`, `admin` (`ROLES_RECEPCION`). |
| **Localizar equipo** | Guía, caja PX, escaneo incremental serie/MAC (PX); CAC por guía → Backoffice. |
| **Campos** | CAC: guía, piloto, courier, SAP doc (en flujo backoffice). PX: `sap_document`, carrier, unidades esperadas (`pxReceptionCapture.ts`). |
| **Automático** | Timestamps, conteos varianza, IDs recepción/caja. |
| **Evidencia** | Notas recepción; **fotos accesorios** en flujo Backoffice accesorios (`accessoryPhotos` en `useBackofficeOperation.ts`) — no verificado para todo PX. |
| **Avance** | PX: estados `EN_PROCESO` / finalize; CAC: recepción → pendiente clasificar. |
| **Si falla** | Validaciones API (SAP obligatorio en paths PX documentados). |
| **Siguiente mesa** | **Backoffice** (equipos) o bandejas accesorios/teléfono. |
| **Backend** | `POST /api/recepcion`, `POST /api/recepcion/px/*`, tablas `receptions`, `boxes`. |

### 2.2 Pre-diagnóstico

| Ítem | Detalle |
|------|---------|
| **Estado** | **Implementado** (CAC + PX); backfill histórico CHG-015 **implementado** (migración datos, no pantalla operador). |
| **Rutas** | CAC: `/produccion/backoffice` → pestaña **PRE-DIAGNÓSTICO** (`PrediagnosticoTab`, `PrediagnosticoPanel`). PX: paneles en recepción (`PxEquipmentPrediagnosticoPanel`). Config catálogo: `/configuracion` (`PrediagnosticoCatalogPanel`). |
| **Roles escritura** | `receptor_cac`, `supervisor`, `admin` (RLS 251); PX API incluye `receptor_px`. |
| **Localizar** | **OS** (`service_order_id`) desde bandeja CAC / tray; PX por equipo en recepción. |
| **Campos obligatorios (validación TS)** | `clase_carcasa` A–D; `dictamen` reacondicionado \| reparado \| irreparable; observaciones si irreparable. Cosmético: `bien`/`danado`; funcionamiento: `si`/`no`/`na` por ítem catálogo (`validatePrediagnostico.ts`). **No exige completar todos los ítems del catálogo** — solo valores válidos si se envían. |
| **Dictamen vs clase** | **Separados** en BD: `clase_carcasa` vs `dictamen` (251). |
| **Automático** | `creado_en`, `creado_por`, revisiones en `prediagnostico_revisiones` al editar. |
| **Reporte** | `PREDIAGNOSTICO_EQUIPOS` en `/reportes` (`static-report-catalog.ts`). Export masivo desde tabla `prediagnosticos` (implementado parcialmente: reporte con fechas debe leer `prediagnosticos`, no solo bandeja CAC — ajuste documentado en provider). |
| **Backfill** | ~81k filas marcadas CHG-015 en observaciones — **migración**, no procedimiento de mesa. Política fechas sintéticas: 80% ingreso+3–5 días calendario (**no hábiles** en código) — `prediagnosticoBackfillPlan.ts`. |
| **Backend** | `GET/POST /api/v1/backoffice/prediagnostico`, `POST .../resolve`, `.../lote`; PX: `/api/v1/recepcion/px/prediagnostico`. |

### 2.3 Almacenamiento y ubicación

| Ítem | Detalle |
|------|---------|
| **Estado** | **Implementado** en `/bodega/gestion` (+ inventario, salida staging). |
| **Roles** | `bodega`, `supervisor`, `admin` (`ROLES_BODEGA_DESPACHO`). |
| **Localizar** | Serie, OS, código caja, rack (`rack_location`). |
| **Automático** | Cambios `series.current_box_id`, estados bodega; auditoría según operación. |
| **Rutas catálogo sin página** | `/bodega/ingreso`, `/bodega/salidas` listadas en `modules.ts` — **implementado parcialmente** (ingreso embebido en gestión). |
| **Backend** | `api/v1/warehouse/boxes`, `transfer-to-workshop`, etc. |

### 2.4 Pedido u orden de producción (PO)

| Ítem | Detalle |
|------|---------|
| **Estado** | **Propuesto / pendiente** — ADR-002, `docs/modules/production-order/README.md`. Tab `po` en Taller referenciada con flag; **sin tabla `production_orders` verificada en migraciones revisadas**. |
| **Nota manual** | Operación actual agrupa por **pestañas Taller** y bodega, no por PO formal. |

### 2.5 Reparación y repuestos

| Ítem | Detalle |
|------|---------|
| **Estado** | **Implementado parcialmente.** |
| **Taller** | `/produccion/taller` — pestañas `diagnostico`, `reparacion`, `esperando_partes`, `reacondicionado`, `qc`, `l3`, `scraps`, `listo`, `despacho`. |
| **Roles** | `tecnico`, `qc`, `supervisor`, `admin` (`ROLES_TALLER`). |
| **Localizar** | Serie / OS en cola por tab ↔ `series.current_status` (`workshopTasksService.ts`). |
| **Repuestos** | `/bodega/partes` — catálogo, solicitudes (**implementado** módulo bodega partes; detalle pieza-por-OS **no verificado** en profundidad en este informe). |
| **Prerrequisitos avance** | API `validate-prerequisites`: exige **Diagnóstico Inicial** auditado antes de reparación/QC/reacondicionado (`workshopStagePrerequisites.ts`). **No** exige cadena completa REP→REAC→QC en código — solo DIAG previo. |
| **Automático** | `operate-batch` cambia status + escribe `erp_audit_logs` con acciones tipo `DIAGNÓSTICO INICIAL COMPLETADO`, `REPARACIÓN COMPLETADA`, `CONTROL DE CALIDAD COMPLETADO`, `rechazado_qc` → regreso a `in_qc`. |
| **Componente/causa falla** | **No verificable** como campos estructurados obligatorios en taller; posible texto en notas/auditoría según UI (no auditado campo a campo). |

### 2.6 Testeo o prueba prolongada

| Ítem | Detalle |
|------|---------|
| **Estado** | **No implementado** en flujo CAC/taller web revisado. |
| **Paralelo** | Certificación **TEC-LAB** vía `ont_runs` + PDF `/reportes/ont-runs` — **sistema aparte** (PCs lab → Supabase). No bloquea despacho Claro en código revisado. |

### 2.7 Reacondicionamiento y limpieza

| Ítem | Detalle |
|------|---------|
| **Estado** | **Implementado** como pestaña Taller `reacondicionado` → status `ready_to_dispatch`. |
| **Pre-diagnóstico** | Dictamen `reacondicionado` en CAC es **etapa anterior** (no igual a pestaña reacondicionado físico). |

### 2.8 Calidad física / calidad funcional y liberación

| Ítem | Detalle |
|------|---------|
| **Calidad física (ingreso)** | Pre-diagnóstico: clase A–D + ítems cosméticos. |
| **Calidad funcional (ingreso)** | Pre-diagnóstico: ítems `funcionamiento` si/no/na. |
| **QC taller** | Pestaña `qc` → `in_validation` (**implementado**). |
| **Ruta `/produccion/qc`** | **Propuesto en catálogo** (`modules.ts` id 15) — **sin `page.tsx`**; QC vive en Taller. |
| **Liberación** | `ready_to_dispatch`, luego bodega `listo` (`in_central_warehouse`), despacho. |

### 2.9 Empaque y etiquetado

| Ítem | Detalle |
|------|---------|
| **Estado** | **Implementado parcialmente.** |
| **Evidencia código** | Etiqueta QC Kaon: `printKaonQcLabel.ts`; cierre caja bodega; reimpresión guías despacho (`despacho/historial/[guide]`). **No** módulo único “empaque” con checklist fotográfico verificado. |

### 2.10 Despacho y entrega

| Ítem | Detalle |
|------|---------|
| **Estado** | **Implementado** (`/despacho`). |
| **Gate** | **Validado SAP** requerido para pistoleo (mensajes en `despacho/page.tsx`). |
| **Lotes LS-** | Reporte `DESPACHO_POR_LOTE_SALIDA`; modelo `dispatch_batches` — **propuesto** (ADR-002) vs legacy por caja. |
| **Roles** | `bodega`, `supervisor`, `admin`. |
| **Backend** | `modules/despacho`, `api/v1/despacho/*`. |

### 2.11 Garantías y reingresos

| Ítem | Detalle |
|------|---------|
| **Estado** | **Implementado parcialmente.** |
| **Reingreso** | `service_orders.reentry_count`, UI “N° Ingreso”, migración `119_reingreso_dispatched_series.sql`, preview PX reentry. |
| **Garantía** | **No verificable** — sin módulo “garantía” nombrado en `src/`. |

### 2.12 Irreparables, obsoletos y disposición

| Ítem | Detalle |
|------|---------|
| **Estado** | **Implementado parcialmente.** |
| **Irreparable** | Pre-diagnóstico dictamen; Taller tab `scraps` / `irreparable`; bodega SCRAP `/bodega/scraps`. |
| **Obsoleto** | Integración SAP estado `Obsoleto`; status `obsolete` en trazabilidad (`boxLocationTrace.ts`). |
| **Devoluciones** | `/logistica/devoluciones`, bloque SAP devuelto, ETL reportes (`210_returns_report_etl.sql`). |

---

## 3. Trazabilidad — qué se conserva

| Elemento | ¿En TC-ERP? | Cómo | Limitaciones |
|----------|-------------|------|--------------|
| Fecha recepción | Sí | `receptions.created_at`, guías | — |
| Usuario/fecha cada avance | Parcial | `erp_audit_logs`, campos `*_por` en prediagnóstico | Cobertura depende de acción que dispare audit; KPI deriva con lag (`kpi-sync`) |
| Estado anterior/nuevo | Parcial | Updates `series.current_status`; consulta historial | No todas las pantallas muestran diff explícito |
| Historial correcciones prediag | Sí | `prediagnostico_revisiones` | — |
| Ubicación / transferencia | Sí | `boxes`, movimientos bodega→taller API | — |
| Dictamen inicial vs tratamiento final | Parcial | Prediag `dictamen` vs estados taller/despacho | No amarrados por trigger único |
| Clase A/B/C/D | Sí | `prediagnosticos.clase_carcasa` | Backfill sintético CHG-015 |
| Componente / causa | Parcial | Catálogo ítems + JSON checks | No campo libre “causa raíz” único verificado |
| Reparación / repuestos | Parcial | Bodega partes | Trazabilidad pieza→serie **no verificada** a fondo |
| Testeo inicio/fin/duración | No (CAC) | — | Lab `ont_runs` aparte |
| Resultados calidad QC | Parcial | Auditoría acciones QC + status | Sin schema de prueba prolongada |
| Equipo–caja–pallet–lote | Parcial | Serie↔caja; lote despacho en diseño | Pallet no verificado |
| Movimientos SAP | Parcial | Validación G985 + doc transfer | No posting automático SAP |
| Constancia entrega | Parcial | Despacho + historial guía | — |
| Garantías | No verificable | — | — |
| Reingresos | Sí | `reentry_count`, ciclos serie | — |

---

## 4. Controles y reportes

| Control | Hallazgo (repo) |
|---------|-----------------|
| Plazo pre-diagnóstico | Política **backfill** usa días **calendario** 3–5 post-ingreso (`prediagnosticoBackfillPlan.ts`). **No** encontrado motor SLA días hábiles ni módulo `/gestion/alertas` (ruta en catálogo **sin página**). |
| Avanzar sin pruebas | Taller: solo prereq **Diagnóstico Inicial** entre etapas; **no** bloqueo por ítems prediag incompletos al transferir a taller. |
| Pasa / No pasa / N/A / Pendiente | Pre-diagnóstico funcional: **`si` / `no` / `na`** (`FUNCTION_VALUES`). Cosmético: **`bien` / `danado`**. No etiquetas literales “Pasa/No pasa” en validación TS. |
| Bloqueo despacho | **Sí (UI)** — requiere `Validado SAP` (`despacho/page.tsx`). |
| Series duplicadas | Validaciones en escaneo PX UI; reporte clasificación detecta S-1 duplicada; reglas DB según migraciones (no auditado índice único global aquí). |
| Errores integración | SAP: estados `Sin Coincidencia`, `Pendiente Revisión`; mensajes UI. Supabase caída → errores genéricos / fetch failed (operación). |
| Reportes | Motor central `/reportes` (flag `USE_CENTRAL_REPORTING`): CAC histórico, clasificación, **PREDIAGNOSTICO_EQUIPOS**, despacho, CENAM, operaciones mensual, inventario accesorios. TEC-LAB: `/reportes/ont-runs`. BI: `/gestion/bi`. |
| Manual vs sync | **Manual:** captura mesa en TC-ERP. **Semi-auto:** match SAP archivo. **Sync externo:** lab → `ont_runs`. **No:** Orderry, Lyra. |

---

## A. Resumen funcional de TC-ERP

TC-ERP centraliza la **trazabilidad operativa** del refurbish Claro en TECHCORP: recepción CAC/PX, generación de OS y series en Backoffice con documento SAP, pre-diagnóstico por catálogo configurable, almacenamiento por cajas/racks, flujo de taller por estados de serie, validación de stock SAP mediante carga G985, despacho con gate de validación SAP, consulta unificada y exportaciones Excel/CSV. **No reemplaza SAP** como ERP de inventario ni un sistema “Lyra” no referenciado en código. **PO formal, lote de salida enterprise, QC standalone, SLA hábil y garantías** están documentados como diseño o ausentes. **Laboratorio certificador** alimenta `ont_runs` en paralelo.

---

## B. Matriz operativa (resumen)

| Actividad | Pantalla / ruta | Responsable (rol enum) | Acción operador (resumen) | Registro automático | Estado resultante (típico) | Evidencia | Limitaciones |
|-----------|-----------------|------------------------|---------------------------|---------------------|----------------------------|-----------|--------------|
| Recepción CAC/PX | `/recepcion` | receptor_cac / receptor_px | Registrar guía, escanear unidades/cajas | IDs, timestamps, conteos | Recepción pendiente clasificar | Notas; fotos accesorios (BO) | Legacy pages mock |
| Clasificación + OS | `/produccion/backoffice` | receptor_cac | Clasificar guía, SAP, escanear series | OS, series, sap_transfer | `RECEPCIONADO_BODEGA_GENERAL` / tray | SAP doc, tray export | SAP obligatorio |
| Pre-diagnóstico | `/produccion/backoffice` (tab) | receptor_cac | Clase, checks, dictamen | prediagnostico + revisiones | (dictamen en tabla) | Export PREDIAGNOSTICO | Catálogo no fuerza todos ítems |
| Bodega ubicación | `/bodega/gestion` | bodega | Ingreso serie a caja/rack | box_id, status | `in_central_warehouse` | Inventario | Rutas ingreso/salida catálogo |
| Taller diagnóstico | `/produccion/taller` | tecnico | Completar diag batch | audit log | `in_workshop` → … | erp_audit_logs | Prereq mínimos |
| Reparación / partes | Taller + `/bodega/partes` | tecnico / bodega | Operar cola reparación | status `in_qc` | audit | Partes módulo | PO no modelado |
| QC | Taller tab `qc` | qc / tecnico | QC completado | audit | `in_validation` | Etiqueta Kaon (casos) | No ruta `/produccion/qc` |
| Reacondicionado | Taller tab | tecnico | Cierre reacond. | audit | `ready_to_dispatch` | — | — |
| Integración SAP | `/integracion-sap` | admin/supervisor | Upload G985, match, sync | sap_status fields | Validado SAP | sap_uploads | Manual, no RFC |
| Despacho | `/despacho` | bodega | Pistoleo caja/serie | dispatches | `dispatched` | Historial guía | Gate SAP |
| Consulta | `/consulta` | varios (lectura) | Buscar OS/serie | — | — | Historial audit | — |
| Lab cert | `/reportes/ont-runs` | producción (lectura) | Ver/PDF corrida | — | PASS/FAIL lab | report_json | No es mesa CAC |

---

## C. Instrucciones breves por mesa

### C.1 Recepción (CAC / PX)

**Antes:** Rol recepción activo; guía y documento SAP disponibles (PX).  
**Pasos:** `/recepcion` → modo CAC o PX → registrar guía → escaneos según flujo → finalizar PX si aplica.  
**Confirmar:** Unidades vs esperado, SAP en PX.  
**Transferir:** Equipos → Backoffice; accesorios/teléfono → sub-flujos.  
**Excepción:** Varianza documentada; errores API en pantalla.

### C.2 Backoffice (clasificación + OS)

**Antes:** Recepción en estado clasificable.  
**Pasos:** `/produccion/backoffice` → NUEVA RECEPCIÓN / inbox → clasificar tecnología/marca/modelo → **Documento SAP** → escaneo series → completar.  
**Confirmar:** Todas las series; SAP válido (`persistEquipmentOnComplete`).  
**Transferir:** OS en bandeja historial / prediagnóstico.  
**Excepción:** Devolución bloque SAP desde historial (supervisor).

### C.3 Pre-diagnóstico (CAC)

**Antes:** OS existente en bandeja.  
**Pasos:** Tab PRE-DIAGNÓSTICO → buscar OS → clase A–D → ítems cosmético/funcionamiento → dictamen → guardar.  
**Confirmar:** Observaciones si irreparable.  
**Transferir:** Datos en `prediagnosticos`; export vía `/reportes` (marcar **Todos los pre-diagnósticos** para stock histórico/backfill).  
**Excepción:** Catálogo vacío → migración 253 / configuración.

### C.4 Bodega

**Antes:** Equipos clasificados / transferidos desde recepción.  
**Pasos:** `/bodega/gestion` → ingreso inteligente → escanear serie → asignar caja/rack → cerrar caja.  
**Confirmar:** Homogeneidad caja según reglas UI.  
**Transferir:** Transfer to workshop API cuando producción lo solicite.  
**Excepción:** Caja eliminada / rack ELIMINADO.

### C.5 Taller

**Antes:** Series en status de cola correspondiente.  
**Pasos:** `/produccion/taller` → pestaña según etapa → seleccionar equipos → operación batch (completar etapa).  
**Confirmar:** Prerrequisito diagnóstico si API lo exige.  
**Transferir:** Cambio automático `current_status` según tab destino.  
**Excepción:** QC rechazado → regreso `in_qc` (operate service).

### C.6 Integración SAP

**Antes:** Archivo G985 exportado de SAP.  
**Pasos:** `/integracion-sap` → cargar archivo → match → sincronizar validación.  
**Confirmar:** Series en **Validado SAP** antes de despacho.  
**Transferir:** Estados en OS/series.  
**Excepción:** Sin coincidencia / obsoleto — revisar tabs dashboard.

### C.7 Despacho

**Antes:** **Validado SAP**; equipo listo en bodega/despacho.  
**Pasos:** `/despacho` → pistoleo según flujo pantalla → confirmar entrega.  
**Confirmar:** Mensajes bloqueo SAP.  
**Transferir:** `dispatched`, historial guía.  
**Excepción:** Reintentar tras integración SAP.

---

## D. Texto sugerido para pie de carteles TECHCORP

> **Registre en TC-ERP (navegador corporativo), no en hojas sueltas.** Recepción: **Recepción General**. Clasificación y OS: **Backoffice**. Pre-diagnóstico: pestaña **Pre-diagnóstico** (misma OS). Bodega: **Gestión de Bodega** (serie + caja). Taller: módulo **Taller** — use la pestaña de su mesa y cierre la operación batch. Validación SAP: **Integración SAP** antes de despachar. Despacho: módulo **Despacho** (solo si SAP está **Validado**). Consultas: **Consulta**. Evidencias de accesorios/fotos donde el flujo Backoffice lo pida. Certificación de laboratorio (ONT/EMTA): consulta **TEC-LAB DUT** — no sustituye el registro de su mesa.

---

## E. Corrección al manual “Todos los procesos se registran en Lyra”

| Afirmación legacy | Hecho verificado en repo |
|-------------------|-------------------------|
| “Todo en Lyra” | **Lyra no aparece** en el código TC-ERP. El sistema implementado se llama **TC-ERP** (web Next.js + Supabase). |
| Un solo sistema | Operación usa **TC-ERP** + **SAP (externo)** para inventario/validación G985 + opcional **certificador lab** → `ont_runs`. |
| Texto recomendado | “Los avances operativos se registran en **TC-ERP**. La validación de planta SAP se realiza en **Integración SAP** dentro de TC-ERP contra archivo G985. Los movimientos contables/inventario SAP se ejecutan en **SAP** según procedimiento de planta. La certificación de laboratorio ONT/EMTA se consulta en **TEC-LAB DUT** cuando aplique.” |

---

## F. Funcionalidades pendientes (no incluir como instrucción vigente)

- **Production Order (PO)** — ADR-002, README production-order.  
- **Lote de salida enterprise `dispatch_batches`** — ADR-002 outbound-dispatch (parcial: reporte LS, legacy caja).  
- **Ruta `/produccion/qc` standalone** — catálogo sin página; QC en Taller.  
- **Rutas `/bodega/ingreso`, `/bodega/salidas`, `/gestion/alertas`** — catálogo modules.ts sin App Router verificado.  
- **SLA / días hábiles pre-diagnóstico** — no motor en código (solo política backfill calendario).  
- **Módulo garantías** — no encontrado.  
- **Test prolongado / burn-in CAC** — no en flujo web; lab separado.  
- **Integración Orderry / API SAP en tiempo real** — no implementado.  
- **Lyra** — no verificable como componente de este repo.

---

## 6. Referencias técnicas (evidencia)

| Tema | Archivos / objetos |
|------|---------------------|
| Módulos y rutas | `web/src/lib/modules.ts`, `web/src/app/(erp)/**/page.tsx` |
| Roles | `web/src/shared/authz/roleGuard.ts` |
| Pre-diagnóstico | `web/supabase/migrations/251_prediagnostico.sql`, `253_*`, `255_*`; `validatePrediagnostico.ts`; `prediagnostico-report.provider.ts` |
| Backfill CHG-015 | `web/docs/changes/CHG-015-prediagnostico-backfill-plan.md`, `prediagnosticoBackfillService.ts` |
| Taller estados | `workshopTasksService.ts`, `257_count_workshop_os_security_definer.sql`, `workshopOperateService.ts` |
| Prerrequisitos | `workshopStagePrerequisites.ts`, `api/v1/workshop/validate-prerequisites` |
| SAP | `web/docs/modules/sap-integration/README.md`, `integracion-sap/page.tsx` |
| Despacho | `web/docs/modules/outbound-dispatch/README.md`, `despacho/page.tsx` |
| Ecosistema | `web/docs/architecture/ecosystem-map.md`, `entity-status-catalog.md` |
| Reportes | `static-report-catalog.ts`, `/reportes` |
| Auditoría / KPI | `erp_audit_logs`, `syncAuditFeed.ts`, `256_kpi_event_ledger_composite_pk.sql` |
| Lab | `ont_runs`, `web/docs/changes/CHG-017-ont-runs-dos-pcs-lab.md` |

---

## Resumen para analista de manuales (sin acceso al código)

1. **TC-ERP** es la herramienta web donde las mesas deben registrar recepción, OS, pre-diagnóstico, bodega, taller, validación SAP y despacho.  
2. **Lyra** no está en el software revisado; actualizar manuales que digan “solo Lyra”.  
3. **SAP** se usa vía documento en Backoffice y validación por **archivo G985** en Integración SAP; despacho bloquea si no está **Validado SAP**.  
4. **Pre-diagnóstico** es pestaña Backoffice + reporte **Equipos prediagnosticados**; clase A–D y dictamen reacondicionado/reparado/irreparable son campos separados.  
5. **QC** no tiene pantalla propia `/produccion/qc`; es pestaña del **Taller**.  
6. **PO, lotes LS enterprise, SLA hábiles y garantías** no están operativos como diseño completo — no documentar como hecho.  
7. **Laboratorio ONT** (`ont_runs`) es flujo paralelo de certificación, no la mesa de pre-diagnóstico CAC.  
8. Trazabilidad fuerte en **OS, serie, caja, estados de serie y auditoría**; repuestos/garantías/test prolongado CAC son débiles o externos.  
9. Export masivo pre-diagnóstico: Motor de Reportes con opción **Todos los pre-diagnósticos**; datos históricos CHG-015 están en BD (~81k filas backfill según operación reciente — verificar en SQL con script `verify_prediagnostico_backfill_complete.sql`).  
10. Ante **“fetch failed”** en exportes: red/Supabase o volumen alto (~80k filas); reintentar o export por script operaciones con `.env.local` completo.

---

*Fin del documento — generado por revisión estática del repositorio TC-ERP `web/`.*
