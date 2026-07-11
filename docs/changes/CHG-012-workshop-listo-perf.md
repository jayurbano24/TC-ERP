# CHG-012 — Cola Equipo Listo lenta (migración 113)

| Campo | Valor |
|-------|-------|
| **Archivo** | `web/supabase/migrations/113_workshop_listo_os_page.sql` |
| **Código** | `workshopTasksService.ts` → `queryListoTasksPage` |

## Síntoma

Pestaña **Equipo Listo** queda en «Sincronizando con Servidor…»; badge muestra 1 pero la tabla no carga.

## Causa

`listo` cargaba **todas** las series `in_central_warehouse` (stock PX incluido) y luego consultaba `erp_audit_logs` por chunks → timeout / hang.

## Fix

1. RPC `workshop_list_listo_os_page` (mismo criterio EXISTS que el conteo).
2. Índice `(record_id, action)` en auditoría.
3. App: usa RPC; fallback thin-scan si el RPC aún no está aplicado.

## Apply

SQL Editor → pegar `113_workshop_listo_os_page.sql` → Run. Luego redeploy / hard refresh Taller.
