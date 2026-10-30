# TC-ERP — Revisión independiente Gate Fase 1 Supabase (Antigravity)

**Fecha:** 2026-10-29
**Revisor:** Antigravity (independiente; no implementó los cambios)
**Alcance:** solo entorno aislado `tc-erp-isolated-verify` (54331/54332). Sin cambios de código.
**Historial de dictámenes:** (1) BLOCKED — evidencia untracked respecto a `c966e058…`; (2) **este re-dictamen** tras remediación de trazabilidad.

---

## 1. Dictamen

# **PASS** (certificación versionada, solo entorno aislado)

La evidencia del gate está anclada a un commit real en la rama de auditoría, el runtime se ejecutó con el árbol de migraciones idéntico a ese commit, y los logs lo declaran. PASS **no** autoriza apply a producción, Vercel, merge a `main` ni Fase 2.

---

## 2. Commit evaluado y anclaje

| Ítem | Valor |
| :--- | :--- |
| SHA_GATE (runtime) | `567c0b7152acdfa6256ec3ac8ab07e2e9017a509` — `fix(db): bridge serial normalize deps and anchor Phase 1 Supabase gate` |
| Rama | `audit/architecture-integrity-2026-10-29` (`git branch --contains` → solo esta rama; **no** `main`) |
| Padre | `c966e058b111925fbe375766927c7ff39f431d69` |
| HEAD actual | `4dcbedf314065f4eb50f088f99652e4c826f49a5` — `docs(audits): anchor Phase 1 gate evidence to SHA 567c0b7` |
| `567c0b7` ancestro de HEAD | Sí (`merge-base --is-ancestor` exit 0) |
| `git diff 567c0b7 HEAD -- supabase/migrations scripts/workshop-operate-supabase-gate.mjs` | **Vacío** |
| `git diff --name-status 567c0b7 HEAD` | Solo 2 docs: `…ANTIGRAVITY-HANDOFF.md`, `…SUPABASE-GATE.md` (referencias al SHA/logs) |
| Evidencia anclada | **Sí** |

Contenido de `567c0b7` (7 archivos, +1339): puentes `20261022180000` y `20261023175802`, `289_workshop_operate_batch_tx.sql` (nuevo completo, 508 líneas), `scripts/workshop-operate-supabase-gate.mjs`, y docs gate/handoff/review. `git cat-file -e 567c0b7:<path>` → exit 0 para los 5 archivos fuente/doc probados. `git ls-tree` en `567c0b7` = **310** migraciones (antes: 307 en `c966e058`).

Blobs `567c0b7` vs working tree idénticos (hash-object): normalize `cc8e66b3…`, harvest `64e70e8a…`, 289 `e2344205…`, script `531e2caf…`. `git status --porcelain -- supabase/migrations` vacío.

---

## 3. Checklist A–F

| # | Punto | Veredicto | Evidencia (1 línea) |
| :-: | :--- | :---: | :--- |
| A | Orden/efecto de puentes | **PASS** | Log anclado L829 `20261022180000` → L831 `20261022184507`; L839 `20261023175802` → L840 `20261023175803`; ambos son `CREATE OR REPLACE` / `CREATE TABLE IF NOT EXISTS` idempotentes. |
| B | `normalize_equipment_serial` | **PASS** | DB aislada: 1 oid `normalize_equipment_serial(text)`, `provolatile=i`, `proparallel=s`, `search_path=public`, cuerpo `SELECT public.normalize_serial(p_serial)`; `alias_ok = t`. |
| C | `v_next_status::public.series_status` | **PASS** | `289` (en `567c0b7`) contiene el cast; `pg_get_functiondef(workshop_operate_batch_tx)` en DB aislada lo incluye (pos 11681). |
| D | Reset limpio 310 migraciones | **PASS** | Log anclado: 310 `Applying migration`, `Finished supabase db reset` (L1052), `RESET_GIT_SHA=567c0b7…`, `RESET_EXIT=0`; DB: `count=310`, `max=289`. |
| E | 17/17 G1–G4 | **PASS** | Log gate: 17 líneas PASS, `SUMMARY { total: 17, pass: 17, fail: 0 }`, `GATE_EXIT=0`. |
| F | Logs + archivos ↔ hash | **PASS** | Gate log: `GATE_GIT_SHA=567c0b7…` (inicio y fin), `GATE_GIT_PORCELAIN_SCOPED=(empty)`; reset log: `RESET_GIT_SHA=567c0b7…`; SHA256 de ambos logs coinciden con el handoff; archivos creados 20:24:37/20:24:52, posteriores al commit (20:20:36). |

---

## 4. Hallazgos

1. **[RESUELTO]** El BLOCKED previo (archivos `??`, HEAD con 307 migraciones) queda cerrado: `567c0b7` incluye los 3 archivos SQL, el script y el doc, y el árbol de migraciones de ese commit y del working tree son idénticos.
2. **[RESUELTO]** `289` ya está documentado como archivo nuevo completo; en `567c0b7` el revisor puede ver el archivo íntegro (508 líneas), no solo el cast.
3. **[BAJO – evidencia no versionada]** Los logs `.tmp-iso-*-anchored.log` siguen **untracked**. Su anclaje depende del SHA impreso dentro del log y de los SHA256 en el handoff (verificados: `7823E135…2403` y `B77A834D…7615`, coinciden). Es suficiente para este gate, pero no es evidencia inmutable en git.
4. **[BAJO – formato]** El reset log mezcla codificaciones: cuerpo de la CLI con NULs (UTF-16) y trailer ASCII. `Get-Content` muestra `RESET_GIT_SHA`/`RESET_EXIT` como mojibake y `Select-String` no los encuentra; se leen correctamente decodificando los últimos bytes como ASCII (`RESET_GIT_SHA=567c0b7152acdfa6256ec3ac8ab07e2e9017a509`, `RESET_EXIT=0`). Recomendado normalizar a UTF-8 en futuros runs.
5. **[BAJO – alcance]** El reset log no imprime `git status --porcelain`; la limpieza del árbol de migraciones se verificó de forma independiente (porcelain vacío + blobs idénticos) y por el `GATE_GIT_PORCELAIN_SCOPED=(empty)` del gate. El working tree general **sí** tiene cambios no relacionados (`package.json`, `vitest.config.ts`, `src/.../workshopOperateService.ts`, route `operate-batch`, etc.), fuera del alcance del gate SQL/RPC y no incluidos en `567c0b7`; no afectan a las migraciones evaluadas, pero **no están certificados por este dictamen**.
6. **[INFO]** Grants medidos `authenticated,postgres`; riesgos residuales ya declarados (harness PG efímero con `current_status text`, Vitest de recepción no re-ejecutado, CLI Supabase v2.109.1) siguen vigentes.
7. **[INFO]** Un único commit posterior (`4dcbedf`) es solo docs; el gate runtime se ancla correctamente a `567c0b7`.

---

## 5. Remediación requerida

Ninguna bloqueante para PASS. Recomendaciones (no bloqueantes):

- Versionar o archivar con SHA256 los logs anclados junto al commit si se quiere evidencia inmutable.
- Normalizar la codificación del trailer en `supabase-isolated-reset.ps1` (UTF-8) e imprimir `git status --porcelain` también en el reset.
- Certificar por separado los cambios de `src/` y `package.json` pendientes antes de cualquier merge.

---

## 6. Restricciones respetadas

- **No** se realizaron acciones sobre producción (`gpvocfptmsskgfpacadl`), **Vercel**, `main` ni **Fase 2**.
- No se modificó código ni migraciones; no se hizo commit, push, `db push` ni deploy.
- Consultas solo de lectura contra `supabase_db_tc-erp-isolated-verify` (DB aislada) y comandos `git` de lectura. Este documento es el único archivo modificado.
- PASS aplica únicamente a `tc-erp-isolated-verify`; apply a producción, merge a `main` y Fase 2 siguen requiriendo autorización explícita.
