# Baseline performance — Fase 2.5 (Q2.5-20)

**Fecha referencia:** 2026-06-23  
**Entorno:** producción Supabase + Vercel (medir también local con `npm run dev`)

## Umbrales objetivo (p95)

| Endpoint / flujo | Objetivo p95 | Alerta |
|------------------|--------------|--------|
| `POST classify_equipment_batch_tx` (vía backoffice) | < 2 s | > 3 s |
| `GET /api/backoffice/cac-history/tray` | < 800 ms | > 1.5 s |
| `GET /api/backoffice/cac-history/export` (10k filas) | < 5 s | > 8 s |
| `GET /api/backoffice/cac-history/stats` | < 600 ms | > 1.2 s |
| `POST /api/reports/[code]/export` | < 4 s | > 7 s |
| `GET /api/health` | < 100 ms | > 300 ms |

## Cómo medir

### 1. Headers de respuesta (ya instrumentado)

Las rutas con `withErrorHandler` devuelven:

- `x-correlation-id` — trazabilidad
- `x-response-time-ms` — duración servidor

Ejemplo en DevTools → Network → Headers.

### 2. Consola del navegador (recomendado, con sesión en localhost)

```javascript
(async () => {
  const tray = await fetch('/api/backoffice/cac-history/tray?page=1&limit=25');
  console.log('tray x-response-time-ms:', tray.headers.get('x-response-time-ms'));
  const stats = await fetch('/api/backoffice/cac-history/stats');
  console.log('stats x-response-time-ms:', stats.headers.get('x-response-time-ms'));
})();
```

### 3. Script curl / PowerShell (local)

```bash
# Health
curl -s -o /dev/null -w "%{time_total}\n" http://localhost:3000/api/health
```

```powershell
# tray + stats (localhost, sin cookie si la ruta no exige auth)
$r = Invoke-WebRequest -Uri "http://localhost:3000/api/backoffice/cac-history/tray?page=1&limit=25" -UseBasicParsing
$r.Headers['x-response-time-ms']
```

### 4. Logs estructurados (Q2.5-11)

Buscar en logs de Vercel líneas JSON con `"type":"api_request"`:

```json
{"level":"info","type":"api_request","module":"backoffice","action":"cac-history.tray","correlationId":"...","durationMs":142,"status":200}
```

## Registro baseline — local (2026-06-23)

| Fecha | Endpoint | p50 ms | p95 ms | Umbral p95 | Estado |
|-------|----------|--------|--------|------------|--------|
| 2026-06-23 | `/api/health` | 1 | 1 | < 100 ms | ✅ |
| 2026-06-23 | `/api/metrics/baseline` | 254 | 512 | — (ops) | ✅ |
| 2026-06-23 | `cac-history/tray` | **559** | **559** | < 800 ms | ✅ |
| 2026-06-23 | `cac-history/stats` | **623** | **623** | < 600 ms objetivo / < 1200 alerta | ✅ |
| — | cac-history/export | — | — | < 5 s | Pendiente prod |
| — | reports/export | — | — | < 4 s | Pendiente |
| — | classify batch (RPC) | — | — | < 2 s | Pendiente |

**Eventos SQL (7d):** `domain_events` total 910; dual-write outbox OK (0 huérfanos).

**Notas:** Mediciones tray/stats vía consola (`fetch` + `x-response-time-ms`), 20+ muestras estables. Primera carga en dev (columna Network Time) puede superar 6 s por compile webpack; no usar para baseline.

**Correlation ID classify (Q2.5-10):** `persistEquipmentOnComplete` genera `correlationId` por operación; se propaga a `classifyEquipmentBatch` → eventos `cac.series.classified` y `cac.classify.batch_completed` en `domain_events`.

## Próximo paso (Q2.5-21)

- Alertas en Vercel Log Drains o Datadog cuando `durationMs` > umbral en `api_request`.
- No bloqueante para cerrar Fase 2.5; documentación + headers es suficiente para gate inicial.
