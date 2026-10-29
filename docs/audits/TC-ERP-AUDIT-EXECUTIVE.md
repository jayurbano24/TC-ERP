# TC-ERP — Informe Ejecutivo de Auditoría y Estabilización

**Fecha de Auditoría:** 2026-10-29  
**Commit Evaluado:** `91a1bc8af52240d338b7939e35662ed5d28e03d0`  
**Equipo Auditor:** Software Architecture, Full-Stack Lead, Database Engineering, QA Automation, DevSecOps & SRE  
**Estado General del Sistema:** **NO APTO PARA PRODUCCIÓN (UNSTABLE / GAPS CRÍTICOS)**

---

## 1. Resumen Ejecutivo

A solicitud de la dirección técnica y en cumplimiento del protocolo riguroso de estabilización, se ejecutó una auditoría exhaustiva y no destructiva sobre la rama `main` del repositorio `TC-ERP`.

La auditoría analizó la coherencia funcional, integridad transaccional en PostgreSQL, reglas de negocio del motor de estados, seguridad RLS, cobertura de pruebas automatizadas y arquitectura de escalabilidad para operaciones masivas.

### Veredicto Global
TC-ERP cuenta con avances arquitectónicos significativos (monolito modular, validación por capas, catálogo de diagnóstico/reparación y mitigación de dispersión en migración 285). Sin embargo, **presenta 4 fallas críticas y 5 vulnerabilidades de alta severidad** que impiden certificarlo como estable. 

Destacan:
1. **Reglas de negocio desfasadas entre capas:** Las restricciones de destino de taller (`allowed_outcomes`: Reacondicionado vs. Reparación L1/L2 vs. L3) se validan únicamente en TypeScript (`workshopOperateService.ts` / frontend); en PostgreSQL (`series.current_status`), la columna es de tipo `text` sin constraints ni triggers de validación.
2. **Procedimientos SQL críticos sin pruebas de confirmación real:** `warehouse_dispersion_tx` (migración 285) fue corregido para evitar el bloqueo `DELETE requires a WHERE clause` y el trigger de baja gerencial, pero carece de tests automatizados de confirmación (`COMMIT`) e idempotencia.
3. **Arquitectura de exportación inviable para escala masiva:** La exportación de prediagnóstico (~87,000 filas) ejecuta hasta 2,800 peticiones secuenciales REST N+1 y acumula todo en memoria en una única petición HTTP síncrona, provocando tiempos de 8 a 15 minutos e interrupción por timeout en servidores web / serverless.
4. **Pruebas unitarias que ejecutan mutaciones vivas en producción:** El archivo `src/scripts/run-prediagnostico-backfill-apply.test.ts` con `dryRun: false` no estaba excluido de `npm run test:unit`, ejecutando inserciones reales masivas sobre Supabase durante la ejecución normal de la suite.

---

## 2. Mapa de Hallazgos por Severidad

| Severidad | Total Hallazgos | Módulos Afectados |
| :--- | :---: | :--- |
| **CRITICAL** | **3** | Backoffice Prediagnóstico, Infraestructura de Pruebas (CI/CD), Recuperación BD |
| **HIGH** | **5** | Taller (Pipeline), Bodega (Dispersión), Exportaciones, Integridad de Series, Permisos RLS |
| **MEDIUM** | **4** | Costos (KPIs Receptions), Typecheck en Entornos de Recuperación, Linters (Tipado Any), Logs |
| **LOW** | **2** | Nomenclatura Legacy en Vistas, Headers HTTP |

---

## 3. Tres Hallazgos Prioritarios de Atención Inmediata

### A. Reglas de Taller en Evolución (Frontend/API vs. PostgreSQL)
- **Problema:** Las decisiones de negocio que restringen a cuáles equipos se les permite salida como *Reacondicionado* (exclusivo para los 5 diagnósticos de software/frizado) residen en Node.js y validaciones de interfaz (`OperationDrawer.tsx`). En la base de datos, `series.current_status` acepta cualquier transición sin validar antecedentes ni diagnósticos.
- **Riesgo:** Un acceso directo a API, script de soporte, o llamada concurrente puede forzar un equipo con falla física a estado `ready_to_dispatch` como reacondicionado.
- **Mandato:** Implementar un trigger o RPC atómica `workshop_transition_tx` en PostgreSQL que rechace transiciones incompatibles a nivel de motor relacional con `FOR UPDATE`.

### B. Pruebas E2E Reales de `warehouse_dispersion_tx`
- **Problema:** La corrección 285 (`DELETE ... WHERE TRUE` y bypass `app.box_operational_eliminado`) fue validada manualmente con `ROLLBACK` en proyecto remoto, pero no cuenta con un test automatizado en Vitest con base de datos real aislada.
- **Riesgo:** Futuras migraciones que alteren triggers de auditoría o validaciones en `boxes` pueden volver a romper transferencias de cajas operativas en bodega.
- **Mandato:** Desarrollar una suite de integración con base de datos efímera que pruebe ciclo completo: caja con series $\to$ dispersión $\to$ caja eliminada con bypass $\to$ series en `in_workshop` $\to$ reintento idempotente $\to$ conciliación cero discrepancias.

### C. Rediseño Asíncrono de Exportaciones Masivas (~87,000 registros)
- **Problema:** `fetchPrediagnosticoReportAllData` itera en bloques de 500, pero cada bloque subdivide en llamadas de 80 hacia `service_orders`, `series` y consultas a `sap_series_data`. Para 87,000 registros genera ~2,800 peticiones HTTP a PostgREST en memoria.
- **Riesgo:** En producción, un endpoint web colapsa a los 60s por timeout del proxy/Vercel y genera alto consumo de RAM (OOM).
- **Mandato:** Implementar generación asíncrona mediante un Job/Worker o paginación por cursor en streams directos vía SQL (evitando N+1 de Supabase REST) hacia Storage bucket con URL de descarga prefirmada.

---

## 4. Estrategia de Trabajo con Cursor

Siguiendo la instrucción operativa:
1. **Antigravity (este informe y especificaciones):** Actúa como cuerpo colegiado de auditoría, arquitectura y control de calidad. Define los requerimientos técnicos exactos, esquemas, pruebas requeridas y criterios de aceptación.
2. **Cursor:** Recibe las especificaciones contenidas en `docs/audits/TC-ERP-REMEDIATION-PLAN.md` y realiza la implementación de código en fases estrictas.
3. **Evaluación y Aprobación:** Al finalizar cada fase implementada por Cursor, Antigravity evaluará la evidencia, ejecutará los tests de regresión y validará la integridad antes de certificar el avance.
