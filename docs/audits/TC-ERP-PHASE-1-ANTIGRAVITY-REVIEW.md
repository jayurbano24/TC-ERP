# TC-ERP — Revisión independiente Gate Fase 1 Supabase (Antigravity)

**Fecha:** 2026-10-29
**Revisor:** Antigravity (independiente; no implementó los cambios)
**Alcance:** solo entorno aislado `tc-erp-isolated-verify` (54331/54332). Sin cambios de código.

---

## 1. Dictamen

# **BLOCKED**

Técnicamente el gate es reproducible y coherente en el **working tree** (A–E verificados). Pero **no se puede conceder PASS de certificación versionada**: toda la evidencia que sustenta el gate está **untracked y ausente del commit `HEAD`**. Un checkout limpio de `HEAD` no reproduce el resultado (ver F).

---

## 2. Commit evaluado y anclaje de la evidencia

| Ítem | Valor |
| :--- | :--- |
| `git rev-parse HEAD` | `c966e058b111925fbe375766927c7ff39f431d69` |
| Rama | `audit/architecture-integrity-2026-10-29` |
| Subject | `docs(audits): clarify Phase 0 containment vs tip SHAs` |
| Evidencia anclada a HEAD | **NO** |
| Migraciones en `HEAD` | **307** (`git ls-tree`); working tree = **310** |
| Faltan en el commit | las 3 migraciones (2 puentes + `289_workshop_operate_batch_tx.sql`), `scripts/workshop-operate-supabase-gate.mjs`, ambos logs y el doc del gate |

SHA esperado para certificar: un commit **posterior a `c966e058…`** que contenga los archivos listados en F. Hoy no existe (todos son `??`; `git log --all -- 289_workshop_operate_batch_tx.sql` vacío).

---

## 3. Checklist A–F

| # | Punto | Veredicto | Evidencia (1 línea) |
| :-: | :--- | :---: | :--- |
| A | Orden/efecto de puentes | **PASS** (en working tree) | Log L829 `20261022180000` → L831 `20261022184507`; L839 `20261023175802` → L840 `20261023175803`. Ambas versiones presentes en `schema_migrations` aislada. Efecto: `CREATE OR REPLACE` / `CREATE TABLE IF NOT EXISTS` idempotentes. |
| B | `normalize_equipment_serial` | **PASS** | Consulta en DB aislada: único oid `normalize_equipment_serial(text)`, `provolatile='i'`, `proparallel='s'`, `search_path=public`, cuerpo `SELECT public.normalize_serial(p_serial)` (idéntico a 273 L28-36). Muestras: `abc→ABC`, `'  AB-12 '→AB-12`, `''→''`, `'sn 001'→SN001`. |
| C | Cast `v_next_status::public.series_status` | **PASS** (en working tree) / **FAIL de trazabilidad** | `289` L380 contiene el cast; `pg_get_functiondef(workshop_operate_batch_tx)` en DB aislada lo incluye. Pero `289` es **untracked completo** (no existe en HEAD ni en ningún historial), no un "diff mínimo" sobre un archivo versionado. |
| D | Reset limpio 310 migraciones | **PASS** (con reservas) | Log: 310 líneas `Applying migration`, L1052 `Finished supabase db reset`; DB: `count=310`, `max=289`. Reserva: el log **no** contiene `EXIT 0` literal (solo `Finished`), ni hash de commit. |
| E | 17/17 G1–G4 | **PASS** (con reservas) | `.tmp-iso-gate-tests-post-reset.log`: `SUMMARY { total: 17, pass: 17, fail: 0 }`; 17 líneas PASS contadas. Reserva: log sin hash de commit, sin `GATE_EXIT`, ejecutado por un script untracked. |
| F | Logs + archivos ↔ hash de HEAD | **BLOCKED / FAIL** | `git ls-files` vacío para los 8 artefactos; `git cat-file -e HEAD:<path>` → exit 128 para los 5 archivos fuente/doc probados. Logs sin SHA-40; solo mencionan rama. |

---

## 4. Hallazgos

1. **[CRÍTICO – trazabilidad]** Las dos migraciones puente, `289_workshop_operate_batch_tx.sql`, `scripts/workshop-operate-supabase-gate.mjs`, el doc del gate, el handoff y ambos logs son `??` (untracked). `HEAD` tiene 307 migraciones; el reset de 310 depende exclusivamente del working tree (junction/copia en `supabase/isolated`).
2. **[CRÍTICO]** Un checkout limpio de `c966e058` no tiene ni `289` ni los puentes: el gate **no es reproducible desde el commit**. La afirmación "PASS" del doc aplica a un working tree sin identidad inmutable.
3. **[ALTO – inexactitud documental]** El gate doc (§3.3) presenta `289` como "Cast en UPDATE" (fix mínimo sobre archivo existente). `289` nunca fue commiteado: es un archivo **nuevo completo**, así que el alcance real del cambio sin revisar es toda la RPC, no una línea. El revisor solo pudo verificar la línea 380 y el comportamiento en runtime; no hay baseline en git contra el cual diffear.
4. **[MEDIO]** Los logs no incluyen el SHA del commit ni un hash del working tree. Los SHA256 del handoff **sí coinciden** con los archivos en disco (gate doc `D0E1103B…`, reset log `FA13A769…`, gate log `E0149DAE…`, puente normalize `5D59DC06…`, puente harvest `0FBBDB80…`, 289 `D1843EF8…`), pero eso ancla bytes, no commit.
5. **[MEDIO]** El doc afirma "EXIT 0" para reset y `GATE_EXIT=0` para el gate; ninguno aparece literalmente en los logs (solo `Finished supabase db reset` y `SUMMARY`). Consistente con éxito, pero no demostrado por código de salida capturado.
6. **[BAJO]** Cronología coherente: `289` modificada 20:06:43, puente normalize 19:54:59, reset log 20:12:20, gate log 20:12:48 → los logs son posteriores a los archivos evaluados.
7. **[BAJO]** Grants medidos `authenticated,postgres` (postgres = owner); consistente con la matriz de permisos del doc. Riesgos residuales ya declarados (harness, Vitest recepción no re-ejecutado) siguen vigentes.
8. **[INFO]** `docs/audits/TC-ERP-REMEDIATION-PLAN.md` está modificado (`M`) y otros docs de Fase 1 son untracked; el árbol de trabajo tiene más cambios que el alcance del gate.

---

## 5. Remediación requerida antes de PASS

1. Commitear (en la rama de auditoría, sin tocar `main`) como mínimo: `20261022180000_ensure_normalize_equipment_serial.sql`, `20261023175802_ensure_part_harvest_sessions.sql`, `289_workshop_operate_batch_tx.sql`, `scripts/workshop-operate-supabase-gate.mjs` y `docs/audits/TC-ERP-PHASE-1-SUPABASE-GATE.md`. Registrar el nuevo SHA (`<SHA_GATE>`).
2. Con árbol limpio (`git status` sin cambios en `supabase/migrations`) en `<SHA_GATE>`, re-ejecutar `npm run supabase:isolated:reset` y `workshop-operate-supabase-gate.mjs` en el stack aislado; que los logs impriman `git rev-parse HEAD`, `git status --porcelain` vacío y el código de salida explícito.
3. Commitear (o adjuntar con SHA256) los logs resultantes como evidencia ligada a `<SHA_GATE>`; actualizar handoff con ese SHA.
4. Corregir el gate doc §3.3 para reflejar que `289` es archivo nuevo, no diff de una línea; revisar `289` completo (no solo el cast) en esta revisión o la siguiente.
5. Reenviar a Antigravity para re-dictamen; con eso A–E ya verificados técnicamente, se esperaría PASS.

---

## 6. Restricciones respetadas

- **No** se realizaron acciones sobre producción (`gpvocfptmsskgfpacadl`), **Vercel**, `main` ni **Fase 2**.
- No se modificó código ni migraciones; no se hizo commit, push, `db push` ni deploy.
- Consultas ejecutadas solo de lectura contra el contenedor `supabase_db_tc-erp-isolated-verify` (DB aislada, puerto host 54332). Este documento es el único archivo creado.
