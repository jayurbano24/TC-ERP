# CHG-285: Transferencia masiva cajas → Diagnóstico

## Síntoma

Toast **Error en la transferencia** con mensaje `DELETE requires a WHERE clause` al ejecutar movimiento a **Diagnóstico** (p. ej. BOX-2901).

## Causa

La RPC `warehouse_dispersion_tx` (post-281) en producción:

1. Hacía `DELETE FROM _dispersion_targets` **sin WHERE** (rechazado por capas que exigen filtro).
2. Marcaba la caja `ELIMINADO` **sin** `set_config('app.box_operational_eliminado', 'dispersion')`, activando el trigger de baja gerencial en cajas `closed` con series.

## Fix

Migración `285_fix_dispersion_operational_eliminado_and_temp_delete.sql` (aplicada en proyecto `gpvocfptmsskgfpacadl`):

- `DELETE FROM _dispersion_targets WHERE TRUE`
- Restaura bypass operacional antes del `UPDATE boxes … ELIMINADO`

Cliente: el error de API ahora muestra el mensaje de la primera caja fallida (no solo `ALL_FAILED`).

## Verificación

- SQL (service_role + ROLLBACK): dispersión BOX-2901 → `still_wh = 0`, sin excepción DELETE/WHERE ni aprobación gerencial.
- UI: reintentar **Transferencia masiva → Diagnóstico → Ejecutar movimiento** (requiere sesión bodega). La RPC ya está viva en Supabase; no hace falta redeploy para el fix de base.
