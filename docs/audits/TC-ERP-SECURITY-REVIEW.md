# TC-ERP — Revisión de Seguridad

**Estado:** PENDIENTE Fase F (tras aprobación de contención).  
**Pistas Fase A:** inventario masivo de `getSupabaseServerClient()` (service_role); fallback a anon key; `clearAllReceptions` en cliente sin callers; RPC `warehouse_dispersion_tx` con `app_assert_any_role`.

No se deshabilitó RLS. No se modificó producción en esta fase.
