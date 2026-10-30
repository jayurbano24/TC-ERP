# Handoff — Revisión independiente Antigravity (Gate Fase 1)

**Fecha:** 2026-10-29  
**Destinatario:** Antigravity (revisión independiente)  
**Emisor:** Cursor agent (implementación / gate)

---

## Mensaje de solicitud

Revisa de forma independiente el Gate Fase 1 de TC-ERP. Confirma el orden y efecto de las migraciones puente, la firma y volatilidad de `normalize_equipment_serial`, el cast de `v_next_status`, el reset limpio de 310 migraciones y los 17 resultados G1–G4. Verifica que los logs correspondan al hash del commit evaluado. Devuelve PASS, FAIL o BLOCKED, con evidencia y hallazgos. Limita la revisión al entorno aislado; no ejecutes cambios en producción, Vercel, main ni Fase 2.

---

## Artefactos a revisar

| Artefacto | Path | SHA256 |
| :--- | :--- | :--- |
| Gate doc | `docs/audits/TC-ERP-PHASE-1-SUPABASE-GATE.md` | `D0E1103B52170E66F1A52C2BFA1712189C5C0A2B6EE4D4710C4424AAFFA590AB` |
| Reset log | `.tmp-iso-db-reset-after-cast.log` | `FA13A7697929D7C7177433C6BA6F44FA9634267960AD107E01066F8E665E2773` |
| Gate tests log | `.tmp-iso-gate-tests-post-reset.log` | `E0149DAEB40B792CD6B6E202D62853B9AAB614DA3594B071AC024965436177A0` |
| Puente normalize | `supabase/migrations/20261022180000_ensure_normalize_equipment_serial.sql` | `5D59DC0602DBE4E4863551B6797B6B89E7FEAAC33E5A618C078EFF3C9B22E8D2` |
| Puente harvest | `supabase/migrations/20261023175802_ensure_part_harvest_sessions.sql` | `0FBBDB809C069B69317DA3597D0764DCE2BBDEC562A17619434A9F0AD047F096` |
| RPC 289 | `supabase/migrations/289_workshop_operate_batch_tx.sql` | `D1843EF8602F169422E9B4795592A7CFDE850D76D0C95CF79872D3C98B54E83E` |

---

## Hash del commit tip (HEAD)

```
c966e058b111925fbe375766927c7ff39f431d69
```

- **Subject:** `docs(audits): clarify Phase 0 containment vs tip SHAs`
- **Branch (reset log):** `audit/architecture-integrity-2026-10-29`
- **Estado Git de evidencia Gate Fase 1:** los artefactos listados arriba (migraciones puente, 289, gate doc, logs, script) figuran como **untracked (`??`)** — **no están contenidos en el commit `c966e058…`**.

### Implicación para el revisor

Antes de emitir PASS, validar explícitamente si:

1. El reset aislado aplicó el **working tree** (junction a `supabase/migrations` con archivos untracked), y  
2. Un checkout limpio de `c966e058` **sin** working tree **no** reproduciría el bootstrap ni el gate reportado.

Si la evidencia no ancla a un commit que incluya `20261022180000`, `20261023175802` y el cast en `289`, el dictamen esperado es **BLOCKED** (o FAIL de trazabilidad), no PASS de certificación versionada.

---

## Cambios asociados (working tree — no en HEAD)

### `20261022180000_ensure_normalize_equipment_serial.sql`
- `CREATE OR REPLACE FUNCTION public.normalize_equipment_serial(p_serial text)` → `SELECT public.normalize_serial(p_serial)`
- `IMMUTABLE` / `PARALLEL SAFE`
- Orden léxico: antes de `20261022181131` / `20261022184507`

### `20261023175802_ensure_part_harvest_sessions.sql`
- `CREATE TABLE IF NOT EXISTS public.part_harvest_sessions` (+ índices IF NOT EXISTS)
- Antes de `20261023175803`; 271 sigue siendo SSOT canónica

### `289_workshop_operate_batch_tx.sql`
- `current_status = v_next_status::public.series_status` (línea ~380)

---

## Restricciones del revisor

- Solo entorno aislado `tc-erp-isolated-verify` (54331/54332)
- No producción, no Vercel, no merge `main`, no Fase 2
- Dictamen: **PASS** / **FAIL** / **BLOCKED** con evidencia por punto
