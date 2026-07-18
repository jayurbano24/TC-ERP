# Fase 3 — Sacar RPCs sensibles del Data API (roadmap)

Objetivo: eliminar el WARN `authenticated_security_definer_function_executable` (0029) de raíz para módulos críticos, sin romper el ERP.

## Problema

Mientras un `SECURITY DEFINER` viva en `public` con `EXECUTE` para `authenticated`, PostgREST lo expone en `/rest/v1/rpc/...` y el Security Advisor lo marca. Los guards `app_assert_*` mitigan abuso, pero no silencian el lint.

## Dirección objetivo

```text
Browser (sesión)
  → Next.js Route Handler (authz app)
    → Supabase service_role
      → schema internal.*  (SECURITY DEFINER, no expuesto al Data API)
```

## Pasos por módulo (orden sugerido)

| Prioridad | Módulo | RPCs a internalizar primero | Notas |
|-----------|--------|-----------------------------|-------|
| P0 | SAP | `sap_sync_tx`, `sap_sync_matches_tx` | **Hecho** — 150 + `rpcInternal` (CHG-014) |
| P0 | Cron / KPI | `refresh_enterprise_summary_views` | **Hecho** — 150 + callers |
| P0b | Allowlist | EXECUTE authenticated solo A | **Hecho** — 151 |
| P1 | Bodega mutaciones | `warehouse_*_tx`, `bodega_*_tx` | UI hoy llama vía `lib/database` + a veces API |
| P1 | PX captura | `capture_px_*`, `*_px_box_tx` | Tablet; requiere API wrapper |
| P2 | CAC / devoluciones | `classify_*`, `full_reception_return_tx`, `block_return_*` | |
| P2 | Taller | `workshop_list_*`, counts | Lecturas; evaluar INVOKER+RLS |
| P3 | Authz helpers | `app_can`, `add_app_role_value` | Mantener en public (RLS/policies) |

## Patrón de migración (por RPC)

1. Crear `internal.<rpc>` (copia DEFINER, `REVOKE ALL FROM PUBLIC`).
2. Wrapper temporal en `public.<rpc>` que llama a `internal` **o** apuntar solo API a `internal`.
3. Actualizar callers en `web/src` a route handlers con `getSupabaseServerClient()`.
4. `DROP` o `REVOKE` total de la versión `public` cuando no queden callers.
5. Excluir schema `internal` del Data API (Dashboard → Settings → API → Exposed schemas = `public` only).

## Criterios de salida Fase 3

- Schema `internal` creado; no expuesto en Data API.
- Módulos P0/P1 sin DEFINER callable por `authenticated` en `public`.
- Advisor 0029 residual solo en helpers RLS documentados (`app_has_role`, etc.) o allowlist A explícita.
- Smoke: bodega, PX, SAP sync, kiosco biométrico.

## Relación con ARCH-01

Alinear con el lint de arquitectura: UI ERP no importa `lib/database` directamente a largo plazo; las mutaciones pasan por API. Ver `scripts/check-architecture.js`.

## Estimación

- P0: 1–2 sprints  
- P1: 2–4 sprints  
- P2–P3: continuo  

No bloquear features de biometría/negocio por Fase 3 completa.
