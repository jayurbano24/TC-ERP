# WIP classification — 2026-10-27

Clasificación del working tree **moderno** (`web/`) pendiente de commits tras incidente `.git` (ver `OVERNIGHT-2026-10-27-status.md`).  
No mezclar con layout antiguo de `origin/main` (`src/` en raíz).

## Leyenda

| Tag | Significado |
|-----|-------------|
| ✅ READY | Incremento validado (tsc/unit/build); listo para commit cuando Antigravity OK |
| 🟠 WIP | Funcional incompleto / no mezclar en release |
| 🧾 DOCS | Evidencia / runbooks |
| 🗄 MIG | Migraciones Supabase aún no certificadas en prod |

## Buckets

### A — TypeScript zero + prediagnóstico (READY)

- Lógica + tests irreparable notes: `validatePrediagnostico.ts` (+ tests / service)
- Scripts: `test:unit` excluye export; `test:integration:prediagnostico` (900s)
- Docs: `VALIDATION-typescript-zero.md`, `CHG-prediagnostico-irreparable-notes.md`, `docs/export-prediagnostico.md` (si existe)
- **Commit propuesto (post-QA):** `fix(types): zero tsc debt + irreparable notes + split unit/integration`

### B — Taller / partes (WIP)

| Ruta | Notas |
|------|-------|
| `src/app/(erp)/produccion/taller/page.tsx` | UI densa; excluida de commits TS-zero |
| `src/modules/parts/server/partsService.ts` | Incluye `returnUnusedGoodPart` / analytics WIP |
| `supabase/migrations/277_return_unused_good_part_tx.sql` | Pareja de B |
| `supabase/migrations/279_workshop_operate_return_tx.sql` | Taller operate/return |

**Acción:** rama/feature `wip/taller-parts` o commit aislado tras demos QA taller.

### C — Devoluciones / returns (WIP)

| Ruta | Notas |
|------|-------|
| `src/app/(erp)/logistica/devoluciones/page.tsx` | Undo/archive UX |
| `.../devoluciones/components/*` | Paneles tabla |
| `supabase/migrations/282_returns_tx_audit_security.sql` | Auditoría returns |

**Acción:** no incluir en release tipado; validar flujo RPC + RLS aparte.

### D — Auth / invitaciones / confirm (WIP / flaky)

| Ruta | Notas |
|------|-------|
| `src/lib/auth/resolveAuthEmailRedirect.ts` | Hosts efímeros (excluido TS-zero) |
| `src/app/auth/confirm/*` | Smoke `confirmRoute.test.ts` — timeout 5s observado bajo carga |
| `supabase` / Seguridad UI | Relacionado a commits viejos en remoto (`6346eb2` auth invites) |

**Acción:** subir `testTimeout` del smoke o aislar import; no bloquear release tipado si re-run verde en frío.

### E — Configuración / QC checklist (WIP)

| Ruta | Notas |
|------|-------|
| Config modal / `qc_checklist` | WIP mezclado en page config (si presente) |
| `supabase/migrations/278_cat_qc_checklist_items.sql` | Catálogo QC |

### F — Migraciones 277–284 (MIG / revisar apply)

| # | Archivo | Módulo |
|---|---------|--------|
| 277 | `return_unused_good_part_tx` | Parts/taller |
| 278 | `cat_qc_checklist_items` | Config QC |
| 279 | `workshop_operate_return_tx` | Taller |
| 280 | `prediagnostico_antenas_exclude_iptv` | Prediag |
| 281 | `warehouse_dispersion_tx_audit_ingreso_taller` | Warehouse/taller |
| 282 | `returns_tx_audit_security` | Devoluciones |
| 283 | `warranty_universal_90d_on_dispatch` | Despacho/garantía |
| 284 | `order_status_history_nonblocking` | Órdenes |

**Acción:** checklist apply en staging antes de prod; 280 puede ir con bucket A si prediag lo requiere.

### G — Infra local / no commitear

- `node_modules/`, `.next/`, `dist/`, `.tmp-*`, dumps, `.env*`
- `TC-ERP-git-recover/` (clone de recuperación — fuera del repo o borrar tras estabilizar)
- `.git-EMPTY-BACKUP/`

## Orden de commits sugerido (post-Antigravity)

1. **Fundación:** añadir `web/` completo alineado al árbol actual (o monorepo move documentado) — un commit grande inevitable por pérdida de historia local.
2. **Docs overnight + WIP map** (este archivo + OVERNIGHT status).
3. **NO** mezclar B/C/E en el mismo push que tipado si aún no hay demos.
4. Push `main` → Vercel; vigilar build.

## Worktree limpio — definición operativa

Worktree “limpio para release tipado” ≠ cero archivos dirty. Significa:

- Solo bucket A (+ F:280 si aplica) staged.
- B/C/D/E en stash o rama `wip/*`.
- `git status` sin secretos ni artefactos G.
