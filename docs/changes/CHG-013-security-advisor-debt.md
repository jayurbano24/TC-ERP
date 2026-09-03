# CHG-013 — Deuda Security Advisor (estática)

| Campo | Valor |
|-------|-------|
| **Fecha** | 2026-07-18 |
| **Estado** | Fase 0–2 listas; Fase 3 roadmap |
| **Migraciones** | `148_security_definer_execute_hygiene.sql`, `149_revoke_authenticated_internal_rpcs.sql` |

## Fase 0 — Dashboard (manual, obligatorio)

1. Abrir [Supabase Dashboard](https://supabase.com/dashboard) → proyecto TC-ERP.
2. **Authentication → Providers → Email**.
3. Activar **Leaked password protection** (HaveIBeenPwned).
4. Guardar. Re-ejecutar Security Advisor → el WARN `auth_leaked_password_protection` debe desaparecer.

Doc: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Fase 1 — Migración 148

- `REVOKE EXECUTE` de `PUBLIC`/`anon` en todo `SECURITY DEFINER` de `public`.
- Re-grant a `authenticated` + `service_role`.
- Allowlist **anon**:
  - `zk_ingest_attlog_tx`
  - `kiosk_enroll_face_embeddings`
  - `kiosk_deactivate_face_embeddings`
  - `kiosk_log_face_recognition`
- Triggers / `*_tg` / `trg_*`: sin EXECUTE para roles de API (solo `service_role`).
- Vista de auditoría: `public.security_definer_execute_audit`.

## Fase 2 — Inventario + Migración 149

Ver [security-rpc-allowlist.md](../security/security-rpc-allowlist.md).

Revoca `EXECUTE` de `authenticated` en RPCs categoría **B/C** (internos, triggers, solo-server).

## Fase 3 — Roadmap

Ver [security-rpc-phase3-roadmap.md](../security/security-rpc-phase3-roadmap.md).

## Smoke post-apply

- [ ] Login ERP
- [ ] Bodega: listar cajas / traslado
- [ ] PX: captura equipo
- [ ] SAP sync (API)
- [ ] Kiosco: enrolar + marcar (PIN 1234)
- [ ] Security Advisor: medir delta de WARN
