# TC-ERP — Registro Exhaustivo de Riesgos Técnicos y Operativos

**Fecha:** 2026-10-29  
**Commit Auditado:** `91a1bc8af52240d338b7939e35662ed5d28e03d0`  

---

## 1. Matriz Consolidada de Riesgos

| ID | Riesgo | Severidad | Probabilidad | Impacto | Situación Actual | Propietario Técnico |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| **RSK-01** | Recuperación y Restauración Supabase | **CRÍTICA** | Media | Catastrófico | Restauración completa de producción no certificada; procedimientos dependen de dumps aislados sin verificación periódica de integridad referencial. | Database Engineer / SRE |
| **RSK-02** | Suite de Tests Mutando Datos de Producción | **CRÍTICA** | Alta | Crítico | `run-prediagnostico-backfill-apply.test.ts` con `dryRun: false` se ejecutaba en `npm run test:unit`, disparando backfills reales sobre Supabase. | QA Automation / DevSecOps |
| **RSK-03** | Clasificación y Reglas de Taller | **ALTA** | Alta | Alto | Reglas de negocio evolucionadas en TS/UI pero desprotegidas en PostgreSQL; no hay constraints ni RPC atómica en servidor. | Software Architect / Full-Stack |
| **RSK-04** | Transferencia Masiva de Bodega (`warehouse_dispersion_tx`) | **ALTA** | Media | Alto | Corrección SQL 285 en caliente; validación UI y prueba E2E automatizada con `COMMIT` real pendientes. | Database Engineer / QA |
| **RSK-05** | Exportaciones Masivas (~87,000 registros) | **ALTA** | Alta | Alto | Arquitectura basada en 2,800 peticiones secuenciales N+1 y generación síncrona en memoria; riesgo inminente de OOM y timeouts en HTTP. | Full-Stack / SRE |
| **RSK-06** | Integridad y Colisiones de Series | **ALTA** | Media | Alto | Ausencia de `UNIQUE` constraint en series activas concurrentes; `service_order_serial_cycles` permite colisiones antes de cierre. | Database Engineer |
| **RSK-07** | Historial de Transiciones y Auditoría | **ALTA** | Media | Alto | Cobertura integral no demostrada; desincronización entre actualización de series e inserción en `erp_audit_logs`. | Database Engineer / Architect |
| **RSK-08** | Integración y Conciliación Externa (Orderry / Legacy) | **ALTA** | Baja | Alto | Sin evidencia verificable de conciliación en el código moderno de TC-ERP; potencial desfasaje contable/operativo. | Architect / Backend |
| **RSK-09** | Seguridad y Permisos RLS Verificables | **ALTA** | Media | Alto | `clearAllReceptions` expuesta en frontend; llamadas frecuentes con cliente `service_role` en endpoints omiten RLS por rol. | DevSecOps Engineer |
| **RSK-10** | Contaminación del Entorno de Build y Tipado | **MEDIUM** | Alta | Medio | Presencia de carpetas de recuperación no ignoradas (`web/`) que rompen el typecheck (`tsc --noEmit`). | Senior Full-Stack |

---

## 2. Detalle de Fichas de Riesgo

### RSK-01: Recuperación Supabase (Severidad: CRÍTICA)
- **Causa Raíz:** El script `scripts/supabase-isolated-upgrade-recovery-drill.ps1` solo valida contenedores Docker locales. No existe un runbook automatizado ni certificado para recuperar el proyecto de producción `gpvocfptmsskgfpacadl` mediante Point-In-Time Recovery (PITR) o restore de dumps con verificación de checksums de RLS.
- **Impacto:** Tiempo de recuperación indeterminado (RTO) y pérdida potencial de transacciones (RPO) ante incidentes de base de datos.
- **Acción Correctiva:** Certificar ejercicio de restore en un proyecto staging de Supabase, midiendo tiempos y validando integridad con `scripts/run-upgrade-validation-checks.ps1`.

### RSK-02: Ejecución de Mutaciones en Suite de Pruebas (Severidad: CRÍTICA)
- **Causa Raíz:** En `package.json`, el comando `"test:unit": "vitest run --exclude src/scripts/export-prediagnostico-all.test.ts"` excluía únicamente un script, dejando libre `run-prediagnostico-backfill-apply.test.ts`. Al ejecutar `npm run test:unit`, se inyectaban credenciales de `.env.local` y se ejecutaba un backfill masivo real con `dryRun: false`.
- **Impacto:** Alteración silenciosa de registros productivos en tabla `prediagnosticos` durante el desarrollo local o CI.
- **Acción Correctiva:** Excluir inmediatamente `src/scripts/**/*.test.ts` de `test:unit` y exigir un flag explícito de entorno (`CONFIRM_LIVE_MUTATION=true`) con guardas de seguridad en el código de prueba.

### RSK-03: Desincronización de Reglas de Taller (Severidad: ALTA)
- **Causa Raíz:** La migración 287/288 creó la columna `cat_diagnostics.allowed_outcomes`, pero la lógica que restringe el paso a `ready_to_dispatch` (Reacondicionado) reside puramente en `workshopOperateService.ts` y `OperationDrawer.tsx`. La tabla `series` mantiene `current_status` como un `text` libre.
- **Impacto:** Inconsistencia de estados; equipos defectuosos pueden saltarse la etapa de reparación hacia despacho mediante llamadas manuales a la API o scripts.
- **Acción Correctiva:** Crear la función RPC `public.workshop_transition_tx(...)` en PostgreSQL con validación atómica estricta de diagnósticos y resultados permitidos.

### RSK-04: Dispersión de Cajas sin Prueba E2E (Severidad: ALTA)
- **Causa Raíz:** Se corrigió el error `DELETE requires a WHERE clause` en migración 285 (`DELETE FROM _dispersion_targets WHERE TRUE`) y se añadió el bypass de eliminación de cajas. No obstante, la verificación reportada fue únicamente manual con `ROLLBACK`.
- **Impacto:** Regresiones operativas en bodega central al dispersar cajas a diagnóstico, bloqueando la línea de entrada a taller.
- **Acción Correctiva:** Implementar prueba E2E de integración automatizada en Vitest con base de datos real (usando el arnés de postgres efímero existente en el repo) que confirme la transacción real y verifique estados posteriores.

### RSK-05: Cuello de Botella en Exportaciones Masivas (Severidad: ALTA)
- **Causa Raíz:** `prediagnostico-report-all-data.ts` realiza una paginación que en cada bloque de 500 filas lanza múltiples consultas hijas en lotes de 80. Para 87,000 registros acumula ~2,800 peticiones HTTP a PostgREST y construye un archivo Excel en la memoria RAM del proceso Node.
- **Impacto:** Caída por timeout (504 Gateway Timeout) en Vercel/Next.js y potencial saturación de memoria (OOM crash) del servidor.
- **Acción Correctiva:** Migrar a una vista materializada o consulta agregada en SQL que proyecte el formato plano directamente, combinada con exportación asíncrona hacia Supabase Storage.

### RSK-06: Riesgo de Colisión de Números de Serie (Severidad: ALTA)
- **Causa Raíz:** `uq_service_orders_open_per_series` solo protege `service_orders(series_id)`. Si se insertan dos filas en `series` con el mismo `serial_number`, ambas pueden tener órdenes de servicio activas simultáneas. El índice `idx_sosc_open` en `service_order_serial_cycles` no es `UNIQUE`.
- **Impacto:** Duplicación de ciclos operativos, dispersión de historiales y pérdida de trazabilidad física del equipo.
- **Acción Correctiva:** Crear un índice único condicional:  
  `CREATE UNIQUE INDEX uq_series_open_active ON public.series (upper(trim(serial_number))) WHERE current_status NOT IN ('dispatched', 'returned', 'irreparable', 'obsolete', 'archivado');`
