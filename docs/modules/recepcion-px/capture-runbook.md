# Runbook — Captura PX (Recepción)

**Audiencia:** Lab Ops, soporte L2, platform on-call.  
**Tiempo objetivo de triage:** &lt; 2 minutos para clasificar; &lt; 10 minutos para acción operativa.

---

## 1. ¿Está saludable?

Ejecutar en Supabase SQL Editor o:

```bash
cd web && node scratch/px-capture-alerts-check.mjs
```

| Alerta | Severidad | Umbral | Significado |
|--------|-----------|--------|-------------|
| `capture_timeout_1h` | critical | &gt;3 / 1h | Timeouts 57014 en captura — **no es finalize** |
| `capture_timeout_24h` | critical | &gt;5 / 24h | SLO diario roto |
| `success_p95_rpc_24h` | warning/critical | &gt;1500 / &gt;3000 ms | Capturas lentas |
| `errors_missing_serial_24h` | critical | &gt;0 | Regresión TS — métricas sin serial |
| `box_busy_spike_1h` | warning | &gt;30 / 1h | Pistoleo rápido o cola cliente off |

Vista SQL: `px_capture_alerts_firing` · Script: `supabase/scripts/px_capture_alerts_check.sql`

---

## 2. Diagnóstico de contención (6A)

Durante T8/T9, en **segunda sesión SQL**:

```sql
-- pg_stat_activity + pg_locks (ver script completo)
\i supabase/scripts/px_contention_explain.sql
```

CLI local (requiere `DIRECT_URL` / session Postgres):

```bash
node scratch/px-contention-diagnose.mjs --watch-locks 20
node scratch/px-concurrency-stress.mjs --scenario T8,T9 --quick
```

**Interpretación timings RPC (6B, campo `timings` / columnas métricas):**

| Span | Normal | Problema si alto |
|------|--------|------------------|
| `preflight_ms` | &lt;30 ms | — |
| `validation_ms` | &lt;200 ms | Falta índice serial/OS; `px_find_open_os` lento |
| `lock_wait_ms` | **~0 ms** | **Contención caja/serial** — antes era ~8000 ms → 57014 |
| `insert_ms` + `update_ms` | &lt;50 ms | Trigger / disco |

Si `lock_wait_ms` &gt; 500 ms con migración 6B aplicada → investigar `pg_locks` (quién bloquea `boxes`, PID, relation).

---

## 3. Forense por serial (30 segundos)

```sql
SELECT
  created_at,
  request_id,
  main_serial,
  box_id,
  operator_id,
  outcome,
  error_code,
  sqlstate,
  duration_ms,
  client_duration_ms,
  validation_ms,
  lock_section_ms
FROM public.px_capture_metrics
WHERE action = 'capture_px_equipment'
  AND main_serial = upper(trim('<SERIAL>'))
ORDER BY created_at DESC
LIMIT 10;
```

Por `request_id` (Fase 4):

```sql
SELECT * FROM public.px_capture_metrics
WHERE request_id = '<UUID>'
ORDER BY created_at;
```

---

## 4. Matriz error → acción

| Código / síntoma | ¿Captura o finalize? | Acción operador | Acción soporte |
|------------------|----------------------|-----------------|----------------|
| **SUCCESS** | Captura | Continuar pistoleo | — |
| **SERIAL_BUSY** | Captura | Otra pistola en la misma serie; reintentar en ~1 s | Normal en pistoleo paralelo del mismo SN |
| **57014 en validation_ms** | Captura | Revisar índices 6C + EXPLAIN | Migración `20260909162000` si p95 validation > 500 ms |
| **BOX_BUSY** | Captura | Esperar 2–3 s; reintentar. Normal con pistoleo rápido | Verificar cola cliente (`NEXT_PUBLIC_PX_BOX_QUEUE`) |
| **CAPTURE_TIMEOUT** / **57014** | **Captura** | Reintentar manual; **no** spam clicks | Revisar carga DB; EXPLAIN validaciones; ver alertas 1h |
| **DUPLICATE_IN_RECEPTION** | Captura | Quitar duplicado en caja/guía | — |
| **DUPLICATE_OPEN_OS** | Captura | Resolver OS abierta; unidad **no** ingresada | Coordinar taller/backoffice |
| **BOX_FULL** | Captura | Cerrar caja; siguiente | — |
| **BOX_LOCKED** | Captura | Tomar control de caja | — |
| Finalize timeout | **Finalize** | Mensaje distinto en UI | Ver `finalize_px_reception` métricas, no mezclar con capture |

**Regla de oro:** mensaje *"La **captura** tardó demasiado"* → RPC `capture_px_equipment_tx`.  
*"La **finalización** tardó demasiado"* → flujo finalize por lotes.

---

## 5. Escalación

| Condición | Escalar a |
|-----------|-----------|
| `capture_timeout_1h` critical + operadores bloqueados | Platform + DBA |
| Duplicados reales en DB post-captura | Platform (integridad) |
| `errors_missing_serial_24h` | Dev (regresión deploy) |
| Solo BOX_BUSY + pistoleo intenso | Lab Ops — ajustar ritmo; no escalar |

---

## 6. Herramientas relacionadas

| Recurso | Ruta |
|---------|------|
| Dashboard SLO | `supabase/scripts/px_capture_slo_dashboard.sql` |
| Stress / gate | `scratch/px-concurrency-stress.mjs` + checklist |
| Alertas cron | `scratch/px-capture-alerts-check.mjs` |
| SLOs en código | `src/modules/recepcion/application/px/pxCaptureSlos.ts` |

---

## 7. Post-incidente

1. Exportar métricas ventana ±30 min: `px_capture_metrics` por `box_id` / `reception_id`.
2. Correlacionar con `request_id` si disponible.
3. Confirmar integridad caja: `captured_count` vs filas `capture_status = 'active'`.
4. Registrar en bitácora: guía, caja, serial, error_code, sqlstate, duración.

---

*Última revisión: Fase 7 PX transaccional — Sept 2026*
