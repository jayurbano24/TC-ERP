# ADR-011 — RLS-first basado en Roles (no multi-tenant)

| Campo | Valor |
|-------|-------|
| **Estado** | **Aceptado parcialmente — en implementación incremental** (ver §11 Addendum con introspección viva) |
| **Fecha** | 2026-06-29 (addendum 2026-06-29) |
| **Depende de** | Fase 1 de Auth (cookies `@supabase/ssr`, `requireApiUser`, guard SSR, sin dev-bypass) |
| **Complementa** | ADR-004 (hexagonal), SEC-01/02/03 |
| **Decisión de negocio** | El sistema **NO** es multi-tenant. No se implementa `tenant_id`. |

---

## 1. Contexto

Tras la Fase 1 existe una barrera de **autenticación** efectiva (sesión en cookies, middleware que exige sesión en `/api/*`, guard SSR del ERP, eliminación del dev-bypass). Pero **no existe autorización** consistente en el backend:

- ~40 tablas tienen RLS habilitado, pero la mayoría de políticas son **permisivas** (`USING(true)` o `auth.uid() IS NOT NULL`); el control por rol (`app_has_role`) solo cubre escrituras de unas pocas tablas.
- ~55–70 funciones `SECURITY DEFINER` (`*_tx`) son el camino real de escritura; **ninguna valida `app_has_role` internamente** y todas tienen `GRANT EXECUTE TO authenticated` → cualquier usuario logueado puede ejecutar cualquier escritura de negocio.
- El contenedor DI (`shared/di/container.ts`) usa **Service Role** para todo → todos los repos de módulos saltan RLS.
- Políticas `auth_fallback` permisivas **anulan** (por OR) las políticas por rol donde coexisten.

### Modelo objetivo

**RLS-first basado en identidad + roles**, sin tenant. La fuente canónica de roles es `public.user_roles.role` consultada por `public.app_has_role(app_role)` (ya correcta, `SECURITY DEFINER`, ligada a `auth.uid()`).

### Hallazgo que justifica un cambio sobre la propuesta inicial

La propuesta original priorizaba migrar **lecturas** a cliente autenticado. La auditoría demuestra que **el agujero crítico está en las ESCRITURAS** (RPCs `SECURITY DEFINER` sin chequeo de rol, ejecutables por cualquier `authenticated`). Migrar lecturas a RLS no cierra ese vector. 

**Decisión técnica revisada:** mantener Fase 2A (lecturas) como primer paso de *bajo riesgo* para validar el patrón, pero **elevar la prioridad real a 2B + 2D** (políticas y autorización de RPCs), que es donde reside el riesgo de integridad/escalada de privilegios. El orden de *ejecución por riesgo* es **2B-crítico → 2D → 2A → 2C**, aunque se entregan de forma incremental empezando por 2A (reversible y observable) para construir confianza.

---

## 2. Inventario auditado (evidencia)

### 2.1 Rutas API (44) — clasificación

| Grupo | Rutas | Cliente | Tipo | Auth actual |
|-------|-------|---------|------|-------------|
| **Público / dispositivo** | `health`, `observability/web-vitals`, `iclock/cdata`, `iclock/devicecmd`, `iclock/getrequest` | none / service+RPC | health, telemetría, integración | Pública (exenta en middleware) |
| **SAP lectura** | `sap/query`, `sap/history`, `sap/dashboard`, `sap/tc-series` | service role | read | middleware only |
| **SAP escritura/sync** | `sap/sync` | service role + `sap_sync_tx` + `requireApiUser` | write/integración | ✅ requireApiUser |
| **Dashboards** | `rrhh/dashboard`, `produccion/dashboard`, `despacho/pendientes` | DI service role + `requireApiUser` | read | ✅ (Fase 1) |
| **Reporting** | `reports/catalog`, `reports/[code]/export`, `backoffice/cac-history/{tray,stats,export,transfer-eligible}` | service role (providers) | read/export | middleware only |
| **Recepción CAC** | `recepcion` (POST), `recepcion/history` | DI service / service + `requireApiUser` | write / read | parcial |
| **Recepción PX** | `recepcion/px` (+13 subrutas: boxes, scan, lock, close, reopen, quantity, promote, lots, finalize, equipment) | service role + RPCs `*_tx` | write-heavy | middleware only |
| **Producción / Despacho** | `production-orders` (+approve, assign-os), `dispatch-batches` (+close), `accessories/dispatch` | RPC adapters (service role) | write | middleware only |
| **Sistema** | `user-session`, `audit`, `metrics/baseline` | inline/service + RPC | write / read | parcial (`metrics` con requireApiUser) |

Subtotales: **service role o equivalente ≈ 41/44**; con `requireApiUser` a nivel handler: **5/44**; públicas: `health`, `web-vitals`, `iclock/*`.

### 2.2 RPCs `SECURITY DEFINER` — clasificación

| Categoría | Ejemplos | Acción objetivo |
|-----------|----------|-----------------|
| **Negocio (escritura)** | `create_recepcion_tx`, `join_or_start_px_reception_tx`, `finalize_px_reception_tx`, `capture_px_equipment_tx`, `close_px_box_tx`, `reopen_px_box_tx`, `adjust_px_box_quantity_tx`, `void_px_equipment_tx`, `delete_px_capture_box_tx`, `promote_px_box_tx`, `acquire/release_box_lock_tx`, `create_bodega_box_tx`, `warehouse_{ingreso,salida,salida_parcial,traslado,traslado_parcial,dispersion}_tx`, `dispatch_batch_{open,close}_tx`, `accessory_dispatch_out_tx`, `production_order_{create,approve,assign_os}_tx`, `classify_equipment_batch_tx`, `block_return_by_sap_transfer_tx`, `full_reception_return_tx`, `create_or_get_sap_transfer_document` | **Validar `app_has_role` dentro** + mantener `SECURITY DEFINER` + `EXECUTE` solo a `authenticated` |
| **Sistema / interno** | `warehouse_log_movement_internal`, `next_box_code`, `px_next_bodega_box_code`, `next_dispatch_batch_number`, `next_production_order_number`, `px_next_guide_number`, `emit_domain_event`, `px_log_activity`, triggers `update_*_updated_at`, `update_accessory_quantity`, `refresh_service_order_*`, `derive_os_operational_state`, `resolve_audit_log_os_id`, `upsert_cac_tray_unit_from_os` | **Revocar EXECUTE a `authenticated`** (solo internas / `service_role`) |
| **Lectura** | `get_entity_timeline`, `get_correlation_timeline`, `audit_domain_events_stats`, `warehouse_get_box_history`, `px_is_serial_blocked_in_inventory`, `cac_tray_status_label` | Migrar a `SECURITY INVOKER` si posible; si no, validar `auth.uid()` |
| **Admin / mantenimiento** | `backfill_cac_tray_units`, `migrate_px_historical_bodega_tx` | `EXECUTE` solo a rol `admin` / `service_role` |
| **Integración / dispositivo** | `zk_ingest_attlog_tx` (¡`GRANT ... anon`!), `sap_sync_tx`, `warehouse_sync_sap_*` | Mantener Service Role server-side; **revocar `anon`/`authenticated`**, proteger por secreto de dispositivo |
| **Helper de roles** | `app_has_role` | **Sin cambios** (correcta) |

### 2.3 Tablas con RLS — clasificación de política

| Clasificación | Tablas | Detalle |
|---------------|--------|---------|
| ✅ **Segura (por rol)** | `return_reasons` (write), `sap_transfer_documents` (write_ops), `service_orders` (write_ops), `taller_kpi_goals` (write admin/gerencia) | Usan `app_has_role(...)` — pero ver "fallback" |
| ⚠️ **Permisiva (solo auth.uid)** | `receptions`, `reception_guides`, `boxes`, `series`, `box_series`, `reception_findings`, lectura de `sap_transfer_documents` | `USING(auth.uid() IS NOT NULL)` para `FOR ALL` |
| ⚠️ **USING(true)** | `report_runs`, `production_orders`, `dispatch_batches`, `warehouse_movements`, `px_reception_{lots,equipment,serial_lines,activity}`, `px_capture_metrics`, `accessories`, `accessory_boxes`, `accessory_movements`, `activity_costs` | Sin condición real |
| 🔴 **Crítica** | `erp_roles`, `erp_role_permissions`, `erp_user_security` (`FOR ALL TO authenticated USING(true)`), `erp_audit_logs` (`SELECT USING(true)`), `activity_costs` (sin `TO`) | Escalada de privilegios / lectura indebida de auditoría |
| ⚠️ **Fallback que anula rol** | `sap_transfer_documents`, `service_orders`, `reception_guides`, `series` | `*_auth_fallback FOR ALL USING(auth.uid() IS NOT NULL)` se combina por OR con la política por rol → la anula |

### 2.4 Usos de Service Role en código

`getSupabaseServerClient` / `SUPABASE_SERVICE_ROLE_KEY` / `supabaseServer` / DI `'SupabaseClient'` en: `lib/supabase/server.ts`, `shared/infrastructure/supabase/server.ts`, `shared/di/container.ts`, `lib/database/*` (`cacTrayUnits`, `pxReceptionCapture`, `domainEvents`, `roles`), `lib/backoffice/enrichCacTraySapValidation.ts`, `lib/actions/users.ts`, `app/actions/admin.ts`, los 5 RPC adapters de módulos, los 5 report providers, y rutas directas (`iclock/*`, `sap/*`, `user-session`, `audit`, `recepcion/history`, `metrics/baseline`).

---

## 3. Plan de migración

### FASE 2A — Migración de lecturas (GET) a cliente autenticado (RLS)

Patrón: usar `auth.supabase` (cliente con RLS expuesto por `requireApiUser`) en los handlers GET, en vez de Service Role. **Precondición por endpoint:** la(s) tabla(s) leídas deben tener política `SELECT` que permita a `authenticated` (hoy la mayoría sí, por permisivas).

| Endpoint | ANTES | DESPUÉS | Riesgo | Dependencias | Rollback |
|----------|-------|---------|--------|--------------|----------|
| `recepcion/history` | service role | `auth.supabase` (ya autenticado) | Bajo | políticas SELECT `receptions/*` (permisivas ✅) | revertir import a `getSupabaseServerClient` |
| `sap/query,history,dashboard,tc-series` | service role | `auth.supabase` | Medio (tablas SAP: verificar SELECT policy) | RLS de tablas SAP | feature flag `USE_RLS_READS` por endpoint |
| `backoffice/cac-history/{tray,stats,transfer-eligible}` | service role (providers) | cliente RLS inyectado al provider | Medio (joins a `series`, `cac_tray_units`) | SELECT en tablas CAC | flag + fallback a service role |
| `reports/catalog` | service role | `auth.supabase` | Bajo (`report_definitions` SELECT is_active) | — | flag |
| `reports/[code]/export` | service role | `auth.supabase` + rol según reporte | Alto (datos sensibles, joins amplios) | políticas de cada tabla del reporte | flag, último en migrar |
| `dashboards` (rrhh/prod/despacho) | DI service role | cliente RLS por request | Medio (DI es singleton service role) | refactor DI para cliente por request | flag |

Estrategia: introducir flag `USE_RLS_READS` (default off) y migrar endpoint por endpoint, comparando resultados (shadow read) antes de apagar el service role.

### FASE 2B — Migración de políticas RLS

| Tabla | Política actual | Política recomendada | Motivo | Impacto |
|-------|-----------------|----------------------|--------|---------|
| `erp_roles`, `erp_role_permissions`, `erp_user_security` | `FOR ALL authenticated USING(true)` | `SELECT authenticated USING(true)`; `INSERT/UPDATE/DELETE USING app_has_role('admin')` | 🔴 escalada de privilegios | Alto — UI admin debe usar usuario admin real |
| `sap_transfer_documents`, `service_orders`, `reception_guides`, `series` | role `write_ops` **+** `auth_fallback FOR ALL` | **eliminar `*_auth_fallback`**; dejar SELECT permisivo + write por rol | El fallback anula el rol | Alto — escritura exige rol correcto |
| `production_orders`, `dispatch_batches`, `warehouse_movements` | `FOR ALL authenticated USING(true)` | SELECT permisivo; escritura solo vía RPC (revocar INSERT/UPDATE directo) | Escritura debe pasar por RPC validado | Medio |
| `px_reception_*`, `px_capture_metrics` | `FOR ALL authenticated USING(true)` | SELECT permisivo; escritura vía RPC | Igual | Medio |
| `accessories`, `accessory_boxes`, `accessory_movements` | `USING(true)` | SELECT permisivo; write por rol (`receptor_*`/`admin`) o RPC | Sin control | Medio |
| `activity_costs` | `USING(true)` sin `TO` | `TO authenticated`; write `app_has_role('admin'/'gerencia')` | Aplica a `anon`; sin rol | Medio |
| `erp_audit_logs` | `SELECT USING(true)` | `SELECT app_has_role('admin'/'auditor')` | Auditoría legible por todos | Bajo |
| `taller_kpi_goals` | incluye "upsert temporal a todos" | **eliminar** política de pruebas | Política de test en prod | Bajo |
| Todas las migradas | (sin FORCE) | Evaluar `FORCE ROW LEVEL SECURITY` donde el owner no deba saltarse RLS | Defensa en profundidad | Bajo |

### FASE 2C — Service Role: qué se queda

| Categoría | Endpoints/usos que **mantienen** Service Role | Justificación |
|-----------|-----------------------------------------------|---------------|
| **Sistema** | `emit_domain_event`, refresh de vistas/summaries, `px_log_activity`, triggers | Procesos internos sin usuario |
| **Administración** | `app/actions/admin.ts` (`auth.admin.*`), `lib/actions/users.ts` | API admin de Supabase requiere service role; **añadir verificación de rol admin del invocador** |
| **Integración** | `iclock/*` + `zk_ingest_attlog_tx`, `sap/sync` + `sap_sync_tx` | Dispositivos/sistemas externos no tienen sesión de usuario; proteger con **secreto de dispositivo/HMAC** |
| **Cron / batch** | `backfill_*`, `migrate_*`, sync SAP programado | Sin contexto de usuario |
| **Event Bus** | `domainEvents.ts`, handlers | Internos |

Todo lo demás (lecturas y escrituras de negocio originadas por un usuario) **migra a cliente autenticado + RLS + RPC validado por rol**.

### FASE 2D — RPCs (autorización)

| Acción | RPCs | Cómo |
|--------|------|------|
| **Validar `app_has_role` dentro** | todos los `*_tx` de negocio (§2.2) | Añadir al inicio del cuerpo: `IF NOT (app_has_role('rol_x') OR ...) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;` con la matriz rol→operación |
| **Mantener `SECURITY DEFINER`** | los `*_tx` (atomicidad/integridad) | Necesario para escribir varias tablas atómicamente |
| **Restringir `EXECUTE`** | helpers internos/sistema (§2.2) | `REVOKE EXECUTE ... FROM authenticated, anon` (dejar `service_role`) |
| **Quitar `anon`** | `zk_ingest_attlog_tx`, `app_has_role` (anon innecesario) | `REVOKE EXECUTE ... FROM anon` |
| **Migrar a `SECURITY INVOKER`** | RPCs de solo lectura que no necesitan saltar RLS | reduce superficie |

Matriz rol→operación (borrador, a validar con negocio): recepción PX/CAC → `receptor_px`/`receptor_cac`/`supervisor`/`admin`; bodega/despacho → `supervisor`/`admin` (+ operador específico); producción approve → `supervisor`/`gerencia`/`admin`; returns/SAP block → `supervisor`/`admin`.

---

## 4. Matriz de riesgos

| Riesgo | Prob. | Impacto | Mitigación |
|--------|-------|---------|------------|
| Lecturas RLS devuelven vacío por política faltante | Media | Alto (UI vacía) | Verificar SELECT policy por tabla antes de flip; shadow read; flag por endpoint |
| Endurecer RPC rompe operación de un rol legítimo no mapeado | Media | Alto (bloqueo operativo) | Matriz rol→op validada con negocio; primero `RAISE WARNING`/log-only; luego enforce |
| `erp_*` por rol bloquea panel admin si el admin no tiene rol en `user_roles` | Media | Alto | Auditar `user_roles` antes; asegurar que admins tienen `role='admin'` |
| Eliminar `auth_fallback` rompe escrituras que dependían de él | Media | Medio | Migrar tras endurecer RPC; pruebas de regresión por módulo |
| DI singleton service role dificulta cliente por request | Alta | Medio | Introducir factory de cliente por request (scoped) sin romper DI |
| Doble `getUser()` (middleware + layout) añade latencia | Alta | Bajo | Cachear/medir; aceptable |
| Dispositivos `iclock` sin secreto siguen abiertos | Alta | Medio | Añadir secreto/HMAC en 2C |

---

## 5. Plan de rollback

- **Global:** flag `USE_RLS_READS` (lecturas) y `ENFORCE_RPC_ROLES` (escrituras) por defecto **off**; activación gradual y reversible sin deploy.
- **2A:** revertir el import del handler a `getSupabaseServerClient` (cambio local).
- **2B:** cada migración SQL acompañada de su **migración inversa** (`down`) que recrea la política anterior; las políticas se versionan con `DROP POLICY IF EXISTS` + `CREATE`.
- **2D:** los chequeos de rol se introducen primero en modo **log-only** (sin `RAISE`); rollback = redeploy de la función sin el guard.
- **2C:** revocaciones de `EXECUTE` reversibles con `GRANT` inverso.
- Punto de no retorno: ninguno hasta apagar el service role de un endpoint; mantener el fallback hasta validar en prod.

---

## 6. Pruebas necesarias

| Tipo | Cobertura |
|------|-----------|
| **Unit** | Matriz rol→operación (helpers de autorización), construcción de `RequestContext` con `auth.uid()`, factory de cliente por request |
| **Integration** | Cada GET migrado: usuario con rol X obtiene/observa datos esperados; usuario sin rol → 403/empty; cada RPC: rol permitido OK, rol prohibido → `FORBIDDEN` |
| **Security** | Intento de ejecutar `*_tx` sin rol; intento de modificar `erp_roles` como no-admin; intento de leer `erp_audit_logs` como no-admin; `anon` contra RPCs revocados; verificar que `auth_fallback` ya no permite escritura por rol indebido |
| **Regression** | Suite Vitest (30+), smoke de flujos PX/CAC/despacho/producción end-to-end con un usuario real por rol |
| **Performance** | Latencia p50/p95 de endpoints migrados (RLS vs service role); coste de `app_has_role` en políticas (índice en `user_roles(user_id, role)`) |

---

## 7. Checklist de migración (por incremento)

- [ ] Tabla/endpoint objetivo identificado y su política SELECT/escritura verificada
- [ ] Migración SQL con `down` inversa escrita y revisada
- [ ] Guard de rol en RPC en modo log-only desplegado y observado ≥ 1 ciclo
- [ ] Flag activado en staging; shadow read comparado contra service role
- [ ] Pruebas unit/integration/security verdes
- [ ] `tsc` 0 · arquitectura 0/0 · Vitest verde
- [ ] Activación en prod por flag; monitoreo de errores 403/empty
- [ ] Service role del endpoint apagado solo tras validación

## 8. Checklist de producción

- [ ] `SUPABASE_SERVICE_ROLE_KEY` solo en entorno server (nunca `NEXT_PUBLIC_*`)
- [ ] `user_roles` poblada y consistente para todos los usuarios activos (admins con `role='admin'`)
- [ ] Índice `user_roles(user_id, role)` presente
- [ ] Flags `USE_RLS_READS` / `ENFORCE_RPC_ROLES` configurados
- [ ] Backups/PITR verificados antes de migraciones de políticas
- [ ] Secreto de dispositivo para `iclock/*` configurado

## 9. Checklist post-deploy

- [ ] 0 picos de 401/403 inesperados en `/api/*`
- [ ] 0 RPC `FORBIDDEN` para roles legítimos (revisar logs log-only)
- [ ] Paneles (recepción, bodega, despacho, producción, reportes) cargan datos
- [ ] Panel admin de roles/permisos funciona con usuario admin
- [ ] Dispositivos ZKTeco siguen ingiriendo asistencia
- [ ] Latencia dentro de presupuesto

## 10. Métricas a monitorear

- Tasa de `401`/`403` por endpoint (`x-correlation-id`)
- Conteo de RPC rechazadas por rol (log-only y enforce)
- Latencia p50/p95 por endpoint migrado (RLS vs service role)
- Nº de endpoints aún en service role (debe decrecer)
- Errores "permission denied for table" (RLS mal configurada)
- Sesiones activas / fallos de refresh de sesión

---

## Consecuencias

**Positivas:** autorización real por rol en lectura y escritura; fin de la escalada de privilegios vía RPC y vía `erp_*`; superficie de service role acotada a sistema/integración; defensa en profundidad (RLS + RPC + middleware + guard SSR).

**Negativas / costes:** trabajo incremental considerable (políticas + 25+ RPCs); requiere `user_roles` bien poblada; refactor del DI para cliente por request; posible bloqueo operativo si la matriz rol→operación es incorrecta (mitigado con log-only).

**Fuera de alcance:** multi-tenancy (`tenant_id`), httpOnly puro (flujo PKCE server-side), reescritura de la capa legacy `lib/database`.

---

## 11. Addendum — Introspección de la BD viva (corrige supuestos previos)

> Las secciones 1–10 se redactaron desde las migraciones del repo. La introspección directa de la base **en producción** reveló divergencias importantes. Esta sección es la **fuente de verdad** y prevalece donde haya conflicto.

### 11.1 El maestro de roles es `hr_positions`, no `erp_roles`

- **`erp_roles` NO existe** en la BD viva. La FK real es `erp_role_permissions.role_id → public.hr_positions(id)` (confirmado por el error `23503` y por `lib/database/roles.ts`, que lee `hr_positions` como catálogo de roles).
- Modelo autoritativo real:
  `auth.uid() → user_roles.role_id → hr_positions(name) → erp_role_permissions(module_name, can_*)`.
- `hr_positions` (15 puestos): `BACKOFFICES, MENSAJERO, INVENTARIOS, AUXILIAR DE INVENTARIOS, OPERADOR DE CLAIMS, TECNICO JUNIOR, TECNICO SENIOR, OPERADOR REFURBISHED, TECNICO QA, SUPERVISOR CSA, SUPERVISOR STB, SUPERVISOR LOGISTICA Y BACKOFFICES, GERENTE GENERAL, GERENTE DE FINANZA, GERENTE OPERATIVO`. Solo **7** tienen filas en `erp_role_permissions`; **8** no tienen ninguna.

### 11.2 Doble vocabulario de roles (deuda a reconciliar)

Coexisten **dos** sistemas de roles, con vocabularios distintos:

| Sistema | Fuente | Vocabulario | Quién lo usa |
|---------|--------|-------------|--------------|
| **Operacional (enum)** | `user_roles.role` (tipo `app_role`) vía `app_has_role()` | `admin, supervisor, receptor_cac, receptor_px, bodega, tecnico, qc, gerencia` | **Políticas RLS vivas** (escrituras de negocio) |
| **Por puesto (matriz)** | `user_roles.role_id` → `hr_positions` → `erp_role_permissions` | nombres de puestos RRHH | **UI de permisos** + nuevos helpers `app_can()` + authz app-layer |

Además, el enum `app_role` fue **extendido** con nombres de puesto (`GERENTE GENERAL`, `BACKOFFICES`, `SUPERVISOR STB`) vía `add_app_role_value()`. Por eso `user_roles.role` puede contener tanto roles operacionales como nombres de puesto.

Estado real de `user_roles` (7 usuarios):

- `gurbano` → 3 filas: `GERENTE GENERAL` (role_id válido) + 2 **legacy** `admin`/`supervisor` (role_id NULL). Hoy esas legacy alimentan `app_has_role('admin'|'supervisor')` y **son load-bearing** para las políticas vivas.
- `jsanchez`, `jrodriguez` → `BACKOFFICES`; `jrodas` → `SUPERVISOR STB` (estos nombres **no** están en las políticas `app_has_role`, así que no obtienen escritura operacional salvo por políticas permisivas `USING(true)`).
- `waguilon`, `hordonez`, `blopez` → **sin fila** (sin rol).

### 11.3 Decisiones tomadas (negocio)

1. **Admin = puesto `GERENTE GENERAL`** (decisión de negocio). `app_is_admin()` lo resuelve por `hr_positions.name`, **sin** depender de `can_edit` en Seguridad/Configuración (que **nadie** posee hoy → con la regla anterior no habría admins).
2. **3 usuarios sin rol** (`waguilon`, `hordonez`, `blopez`) **se dejan sin asignar** por ahora; no pasarán authz cuando se active enforce.
3. **`erp_role_permissions` es la fuente autoritativa de permisos** (RLS-first, por puesto).

### 11.4 Nuevos helpers SQL (migración `065_authz_helpers.sql` — aditiva, reversible)

Basados en el modelo real (`hr_positions`). No alteran políticas existentes (cero cambio de comportamiento hasta que una política los invoque):

- `app_role_id()` → `uuid`: puesto del usuario (ignora filas legacy con `role_id NULL`).
- `app_is_admin()` → `boolean`: `true` si el puesto es `GERENTE GENERAL`.
- `app_can(p_module, p_action)` → `boolean`: admin OR permiso en `erp_role_permissions` (acciones: view/create/edit/delete/approve/export).
- `app_has_permission(p_module)` → `boolean`: atajo de `app_can(module,'view')`.

Todas `SECURITY DEFINER` + `search_path` fijo (patrón Supabase anti-recursión), `EXECUTE` solo a `authenticated, service_role`.

### 11.5 Hallazgos críticos de políticas (corrigen §2.3)

La introspección de `pg_policies` confirmó **escalada de privilegios** abierta:

- 🔴 `erp_role_permissions`: `Permitir full access permisos` = `ALL TO authenticated USING(true)` → **cualquier autenticado reescribe la matriz de permisos** vía REST. Anula todo el RBAC.
- 🔴 `erp_user_security`: `ALL TO authenticated USING(true)` → cualquiera lee/edita la seguridad de todos.
- 🔴 `hr_positions` (maestro de roles): escritura `ALL TO authenticated USING(true)` (+ políticas duplicadas).
- Confirmado: la escritura de admin va por **service role server-side** (`getAdminClient`), que ignora RLS; la lectura anónima ya devuelve **0 filas**. Por tanto endurecer estas tablas a `app_is_admin()` **no rompe la UI** en ningún escenario.

### 11.6 Estrategia de políticas revisada (orden por riesgo)

- **Commit 3a (entregado): `066_lockdown_meta_tables_rls.sql`** — cierra los 3 huecos 🔴 (lectura para autenticados / `user_security` solo propia o admin; escritura solo `app_is_admin()`). Reversible. **Requiere aplicar antes `065`.**
- **Commit 3b+ (pendiente):** migrar tablas operacionales (`USING(true)` / `auth_fallback`) — **mayor volumen y riesgo**; se hará por módulo, primero en **log-only/shadow**, validando que ningún rol legítimo se bloquea. Decisión abierta: ¿unificar a `app_can()` (por puesto) o mantener `app_has_role()` (operacional) y mapear puestos↔roles operacionales? **Recomendación:** mantener `app_has_role()` para escrituras operacionales de negocio (mínimo cambio, ya probado) y usar `app_can()`/`app_is_admin()` para tablas meta/config; reconciliar vocabularios en una fase posterior dedicada.

### 11.7 Normalización (`user_roles`) — DIFERIDA

Borrar las filas legacy de `gurbano` (`role_id NULL`) es **destructivo y load-bearing**: hoy alimentan `app_has_role('admin')` usado por las políticas vivas. **No** se ejecuta hasta que las políticas operacionales dejen de depender del enum (post Commit 3b). 

### 11.8 Implementado en authz app-layer (LOG-ONLY)

`src/shared/authz/permissions.ts` deriva `isAdmin` por puesto `GERENTE GENERAL` (resuelto vía `hr_positions`), y `loadUserAuthz` ignora filas `user_roles` con `role_id NULL`. Cableado log-only en `recepcion/history`, `rrhh/dashboard`, `produccion/dashboard`, `despacho/pendientes`. Enforce controlado por `AUTHZ_ENFORCE` (default off).

### 11.9 Commit 4 implementado en el BORDE de los endpoints (no dentro del RPC)

Para evitar el riesgo de regresión de redefinir ~25 funciones `SECURITY DEFINER` con `CREATE OR REPLACE` (drift entre repo y BD viva), el guard de rol **operacional** (enum `app_role`, decisión "keep_enum") se implementó en el borde HTTP:

- `src/shared/authz/roleGuard.ts`: `logOnlyRoleCheck()` resuelve al usuario (cookies), carga `user_roles.role`, compara contra la matriz aprobada y **registra** `[AUTHZ_LOGONLY] allow|deny` con `x-correlation-id`. Solo bloquea (403) si `AUTHZ_ENFORCE === 'true'`. Nunca lanza (try/catch). Cachea roles 30s.
- Matriz (constantes reutilizables): `ROLES_RECEPCION` = admin/supervisor/receptor_px/receptor_cac; `ROLES_BODEGA_DESPACHO` = admin/supervisor/bodega; `ROLES_PRODUCCION` = admin/supervisor/gerencia; `ROLES_RETURNS_SAP` = admin/supervisor.
- Integrado en `withErrorHandler` vía `meta.roles`. Cableado en: recepción CAC (`recepcion`), recepción PX (todas las escrituras: start, create/delete-box, scan, lock/release, close, reopen, adjust-quantity, append-lots, promote, void-equipment, update-header, finalize), producción (create/approve/assign-os), despacho (`dispatch-batches` open/close), accesorios (`accessories/dispatch`).
- **Cobertura**: tráfico real de la app (no llamadas directas a BD). El enforce final dentro del RPC o en política RLS se hará tras validar los logs y, si se decide, con los cuerpos vivos exactos.

### 11.10 Commit 6 — Autorización de FRONTEND (solo UX)

Capa de UX (NO seguridad; el backend sigue validando todo). Decisiones:

- **Fuente única**: snapshot de permisos del propio usuario. Endpoint **aditivo** de solo lectura `GET /api/authz/me` (devuelve `UserAuthz` del solicitante; no cambia contratos existentes).
- **Sin flicker**: el snapshot se calcula en el **servidor** (`(erp)/layout.tsx` con `loadUserAuthz`) y siembra el cache de TanStack Query (`initialData`) → las acciones se resuelven antes del primer render.
- **Cache**: TanStack Query, `staleTime` 60s.
- **API única**: `useAuthz()` expone `can(module, action)`, `canView(module)`, `isAdmin`. Núcleo puro `canDo.ts` compartido con el backend (sin duplicar lógica). Prohibidas las comparaciones de rol/email hardcodeadas (se eliminaron de `erp-shell` y `navigation-permissions`).
- **Componentes reutilizables**: `<Can module action mode="hide|disable">` (oculta vs deshabilita) y `<AuthzButton>` (gating centralizado de botones). `erp-shell` filtra el menú vía `canViewNavItem(item, authz)`.
- **Compatibilidad**: no toca endpoints/RPC/RLS ni el modo AUTHZ_LOGONLY; `AUTHZ_ENFORCE` sigue off.
