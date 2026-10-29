# TC-ERP — Auditoría de Integridad y Consistencia de Base de Datos

**Fecha:** 2026-10-29  
**Motor:** PostgreSQL 15+ / Supabase  
**Auditor:** PostgreSQL & Supabase Database Engineer  

---

## 1. Análisis de Restricciones y Constraints Relacionales

### 1.1 Columna `series.current_status`
- **Diagnóstico:** La columna `current_status` en la tabla `series` es de tipo `text` sin un constraint `CHECK` que valide contra un catálogo cerrado de estados.
- **Riesgo:** Posibilidad de ingresar valores arbitrarios, errores tipográficos o inconsistencias de mayúsculas/minúsculas (`in_qc` vs `IN_QC` vs `in_workshop`).
- **Recomendación:** Aplicar un `CHECK` constraint:
  ```sql
  ALTER TABLE public.series
    ADD CONSTRAINT series_current_status_check
    CHECK (
      current_status IN (
        'in_central_warehouse',
        'in_workshop',
        'in_qc',
        'in_control_warehouse',
        'in_validation',
        'ready_to_dispatch',
        'dispatched',
        'returned',
        'irreparable',
        'obsolete',
        'archivado'
      )
    );
  ```

### 1.2 Restricción de Unicidad en Series Activas
- **Diagnóstico:** No existe un constraint que impida que dos registros distintos de `series` compartan el mismo `serial_number` si ambos están activos en planta simultáneamente. El constraint `uq_service_orders_open_per_series` solo protege la relación `(series_id, service_order_id)`.
- **Recomendación:**
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS uq_series_active_serial
    ON public.series (upper(trim(serial_number)))
    WHERE current_status NOT IN ('dispatched', 'returned', 'irreparable', 'obsolete', 'archivado');
  ```

---

## 2. Evaluación Transaccional de `warehouse_dispersion_tx` (Migración 285)

### 2.1 Puntos Positivos Identificados
1. **Solución a `DELETE requires a WHERE clause`:**  
   Se corrigió en la línea 69: `DELETE FROM _dispersion_targets WHERE TRUE;`, lo cual satisface la exigencia de extensiones y proxies de PostgreSQL como PostgREST o pgbouncer configurados con safe-delete.
2. **Bypass Operacional de Eliminación:**  
   Se restauró el bypass con `PERFORM set_config('app.box_operational_eliminado', 'dispersion', true);` antes de `UPDATE public.boxes SET rack_location = 'ELIMINADO' WHERE id = p_box_id;`, evitando que el trigger de baja gerencial (`BOX_DELETION_REQUIRES_MANAGER_APPROVAL`) bloquee la dispersión de cajas que contienen series.
3. **Bloqueo Pesimista:**  
   Usa `SELECT * INTO v_box FROM public.boxes WHERE id = p_box_id FOR UPDATE;` y `PERFORM 1 FROM public.series WHERE current_box_id = p_box_id FOR UPDATE;` garantizando serializabilidad en la caja y sus series.
4. **Verificación de Filas Afectadas:**  
   Comprueba que el recuento de filas actualizadas en `series` y el recuento de filas insertadas en `erp_audit_logs` coincidan exactamente con la cantidad de series de la caja. Si discrepa, emite un `RAISE EXCEPTION` que dispara el rollback automático.

### 2.2 Puntos Débiles y Gaps Pendientes
1. **Fallback de Frontend vs. API:**  
   En `src/lib/database/warehouse.ts`, el frontend utiliza la variable `isWarehouseTransferApiEnabled()`. Si `NEXT_PUBLIC_USE_WAREHOUSE_TRANSFER_API` es falso, el navegador ejecuta un bucle de llamadas directas RPC cliente a cliente en lugar de procesar por el endpoint con context timeout unificado.
2. **Falta de Suite Automatizada de Integración:**  
   No existe ningún archivo `.test.ts` en el repositorio que monte un arnés de base de datos efímero y ejecute `warehouse_dispersion_tx` con confirmación real (`COMMIT`) para validar:
   - Que la caja realmente quede en `rack_location = 'ELIMINADO'`.
   - Que las series tengan `current_box_id IS NULL` y `current_status = 'in_workshop'`.
   - Que una segunda llamada con el mismo `idempotency_key` retorne el `v_prior` sin duplicar movimientos.

---

## 3. Integridad de Taller: Migraciones 287 y 288

### 3.1 Estructura Actual
- La migración 287 creó la columna `cat_diagnostics.allowed_outcomes text[]` con constraint de validación:
  ```sql
  CHECK (allowed_outcomes IS NULL OR allowed_outcomes <@ ARRAY['reacondicionado', 'reparacion', 'l3']::text[])
  ```
- La migración 288 actualizó los diagnósticos `'SE FRIZA'`, `'FRIZADO'`, `'FIRMWARE OBSOLETO'`, `'NO ACTUALIZA'`, `'ACTUALIZACION DE S.W.'` para que únicamente tengan `allowed_outcomes = ARRAY['reacondicionado']`.

### 3.2 Brecha de Integridad
- La persistencia en `operateWorkshopSeriesBatch` (en `workshopOperateService.ts`) se ejecuta en dos pasos de Node.js mediante el cliente Supabase:
  1. `admin.from('series').update(updateData).in('id', chunk)`
  2. `admin.from('erp_audit_logs').insert(auditRows)`
- **Vulnerabilidad:** No están dentro de una transacción atómica `BEGIN ... COMMIT` a nivel SQL. Si la inserción del log de auditoría falla, o si se pierde la conexión de red entre el paso 1 y el paso 2, el cambio de estado en `series` persiste **sin registro de auditoría**.
- **Solución Obligatoria:** Encapsular todo el cambio de etapa de taller en una RPC atómica `workshop_operate_batch_tx(...)`.

---

## 4. Auditoría de Seguridad RLS y Funciones Administrativas

### 4.1 Riesgo de Borrado Masivo (`clearAllReceptions`)
En `src/lib/database/receptions.ts`:
```typescript
export async function clearAllReceptions() {
  const supabase = getSupabaseBrowserClient();
  ...
  await supabase.from('series').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('receptions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
}
```
- **Hallazgo:** Esta función realiza un borrado completo de series y recepciones desde el navegador (`getSupabaseBrowserClient`). Aunque RLS en producción debería rechazar deletes no autorizados, mantener funciones de borrado total en el código cliente viola el principio de defensa en profundidad.
- **Acción:** Deprecar y eliminar inmediatamente `clearAllReceptions` del cliente.

### 4.2 Invocación Excesiva de `service_role`
- Se observó que múltiples endpoints (`transfer-to-workshop`, `operate-batch`, `export-prediagnostico`) recurren a `getSupabaseServerClient()` con clave `service_role` para eludir RLS, en lugar de utilizar tokens contextuales del usuario autenticado con políticas RLS refinadas.
- **Mitigación:** Asegurar que cada endpoint verifique explícitamente el rol del operador (`requireApiUser` + `app_assert_any_role`) antes de invocar cualquier procedimiento privilegiado.
