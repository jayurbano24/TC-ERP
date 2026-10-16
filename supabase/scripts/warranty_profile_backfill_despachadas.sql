-- Backfill opcional: persiste perfil en OS ya despachadas (histórico sin bloqueo).
-- No reemplaza el trigger; solo llena warranty_profile donde se puede inferir.

UPDATE public.service_orders so
SET
  warranty_profile = public.resolve_warranty_profile_for_os(so.id),
  warranty_basis_dispatch_at = coalesce(
    so.warranty_basis_dispatch_at,
    so.closed_at,
    (
      SELECT max(coalesce(disp.dispatched_at, di.created_at))
      FROM public.series s
      JOIN public.dispatch_items di ON di.series_id = s.id
      JOIN public.dispatches disp ON disp.id = di.dispatch_id
      WHERE s.service_order_id = so.id
    )
  )
WHERE public.os_status_is_despachado(so.status)
  AND so.warranty_profile IS NULL
  AND public.resolve_warranty_profile_for_os(so.id) IS NOT NULL;

SELECT
  count(*) FILTER (WHERE warranty_profile IS NOT NULL) AS con_perfil,
  count(*) FILTER (WHERE warranty_profile IS NULL) AS sin_perfil
FROM public.service_orders so
WHERE public.os_status_is_despachado(so.status);

-- Tras backfill, refrescar snapshot:
-- SELECT public.refresh_warranty_pack_snapshot();
