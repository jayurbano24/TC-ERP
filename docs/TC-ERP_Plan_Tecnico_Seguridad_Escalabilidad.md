# TC-ERP — Plan Técnico de Remediación: Sesión API, Middlewares, XSS, Zod, REST, BullMQ, Idempotencia y Paginación

> Basado en `TC-ERP_Auditoría_de_Sistemas_y_Ciberseguridad.docx`.
> Objetivo: pasar de "carga operativa moderada" a **production-grade para alta transaccionalidad** (cientos de scans/min, millones de series, multi-sede), cerrando los riesgos P0 abiertos (Service Role en 91% de rutas, RPCs sin chequeo de rol, RLS permisiva).

---

## 0. Mapa de riesgos → solución técnica

| Hallazgo auditado | Riesgo | Sección de este plan |
|---|---|---|
| BE-04 (Crítico) — Service Role en 41/45 rutas | Bypass total de RLS | §2 Middlewares, §4 RLS/RPC |
| BE-05 (Alto) — `AUTHZ_ENFORCE=false` | Autorización solo registra, no bloquea | §2.4 Middleware de autorización |
| BE-09/10 (Crítico/Alto) — RLS permisiva + RPC sin rol | Cualquier `authenticated` escribe/lee todo | §4 |
| BE-02 (Medio) — Rate limit en memoria del isolate | No funciona multi-instancia en Vercel | §2.2, §7.3 |
| FE-06/07 — `select('*')` directo sin paginación | Egress descontrolado, fuga de columnas | §6 Paginación |
| Escalabilidad — millones de series, picos de scans | Saturación de API/BD | §5 BullMQ, §7 Escalabilidad |

---

## 1. Sesión API (Supabase SSR + JWT)

**Estado actual:** cookies httpOnly vía `@supabase/ssr`, guard SSR en layout, sin bypass dev, pero con Bearer legacy en transición. 91% de rutas usan Service Role internamente.

**Diseño objetivo:**

```
Cliente (Next.js Server Component / Route Handler)
   → Cookie httpOnly (sb-access-token, sb-refresh-token)
   → createServerClient(cookies) [NUNCA service role aquí]
   → auth.uid() resuelto por Postgres vía JWT
   → RLS aplica automáticamente
```

Reglas duras:

1. **El cliente Supabase con `service_role` solo se instancia dentro de RPC internos de servidor que ya pasaron por `requireApiUser` + `app_can()`**, nunca en el handler de entrada. Nunca se expone a una ruta pública.
2. Cada Route Handler de Next.js (`app/api/.../route.ts`) debe empezar con:

```ts
// lib/auth/session.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function requireApiUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // ANON, no service role
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user }, error } = await supabase.auth.getUser(); // valida contra Auth server, no solo decodifica el JWT
  if (error || !user) {
    throw new ApiError(401, 'UNAUTHENTICATED');
  }
  return { user, supabase };
}
```

3. **Nunca usar `getSession()` para decisiones de autorización** — usa `getUser()`, que revalida el JWT contra el servidor de Auth en cada llamada (el riesgo documentado de `auth.uid()` falsificable vía JWT no verificado es exactamente lo que generó la nota "Bearer legacy en transición" en el audit).
4. Rotación de refresh token: configurar `autoRefreshToken: true` solo en cliente; en servidor, cada request revalida.
5. Expiración de sesión: access token corto (≤1h), refresh token con rotación detectando reuse (Supabase ya lo hace; verificar `GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL`).

**Acción inmediata (cierra BE-04):** auditar los 41 endpoints con Service Role; de cada uno, clasificar si la lógica *necesita* bypass de RLS (ej. jobs internos, RPC administrativos) o si fue un atajo. Todo lo que no sea estrictamente administrativo migra a `requireApiUser()` + `app_can()`.

---

## 2. Middlewares (orden de ejecución y responsabilidad única)

El audit muestra 6 capas de defensa en profundidad pero con la autorización en modo `LOG-ONLY`. El pipeline de middleware debe ser **secuencial, cada uno con un solo propósito**, y debe fallar cerrado (fail-closed), no fail-open.

```
middleware.ts (Edge, global)
1. Correlation ID            → genera/propaga x-request-id
2. Security headers           → CSP, HSTS, X-Frame-Options, X-Content-Type-Options
3. Rate limit distribuido     → Redis/Upstash, NO memoria del isolate
4. CORS                       → allowlist explícita de orígenes
5. Auth (401)                 → valida cookie/JWT, NO autoriza
↓
Route Handler / Server Action
6. requireApiUser()           → identidad
7. Validación Zod (input)     → forma y tipo del payload
8. app_can(module, action)    → autorización ENFORCE (no log-only)
9. Lógica de negocio (RPC *_tx)
10. Validación Zod (output)   → opcional, contrato de respuesta
```

### 2.1 Middleware global (Next.js 16, `middleware.ts`)

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'crypto';

export async function middleware(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') ?? randomUUID();
  const res = NextResponse.next();

  res.headers.set('x-request-id', requestId);
  res.headers.set('x-frame-options', 'DENY');
  res.headers.set('x-content-type-options', 'nosniff');
  res.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  res.headers.set(
    'content-security-policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.supabase.co; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'; base-uri 'self';"
  );
  res.headers.set('strict-transport-security', 'max-age=63072000; includeSubDomains; preload');

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

> **Nota crítica de escalabilidad (BE-02):** el middleware de Next.js corre en el Edge Runtime, que es *stateless por diseño* — no se puede guardar contadores de rate limit en una variable de módulo porque cada instancia/región tiene su propio isolate. Esto **es** la causa raíz del hallazgo BE-02.

### 2.2 Rate limiting distribuido (reemplaza memoria del isolate)

```ts
// lib/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export const apiRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '1 m'), // 100 req/min por identidad
  prefix: 'rl:api',
  analytics: true,
});

export const scanRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(600, '1 m'), // límite alto para flujo de scans bodega/taller
  prefix: 'rl:scan',
});
```

```ts
// dentro del route handler o middleware de ruta
const identifier = user?.id ?? req.headers.get('x-forwarded-for') ?? 'anon';
const { success, limit, remaining, reset } = await apiRateLimit.limit(identifier);
if (!success) {
  return NextResponse.json(
    { error: 'RATE_LIMITED' },
    { status: 429, headers: { 'retry-after': String(Math.ceil((reset - Date.now()) / 1000)) } }
  );
}
```

Esto es lo que permite sostener **cientos de scans/min multi-sede**: el contador vive en Redis, compartido por todas las instancias serverless de Vercel.

### 2.3 CORS explícito

```ts
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '').split(',');

function corsHeaders(origin: string | null) {
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' };
  }
  return {};
}
```

### 2.4 Middleware de autorización — pasar de LOG-ONLY a ENFORCE

Esto cierra **BE-05**, el riesgo de mayor severidad pendiente. El cambio no es un flag global de golpe; es por endpoint, con observación previa:

```ts
// lib/authz/roleGuard.ts
type Decision = 'allow' | 'deny';

export async function roleGuard(
  userId: string,
  module: string,
  action: string,
  supabase: SupabaseClient
): Promise<void> {
  const { data: allowed, error } = await supabase.rpc('app_can', {
    p_module: module,
    p_action: action,
  });

  if (error) throw new ApiError(500, 'AUTHZ_CHECK_FAILED');

  const decision: Decision = allowed ? 'allow' : 'deny';

  // Log estructurado siempre — auditable independientemente del modo
  logger.info('authz_decision', { userId, module, action, decision, requestId: getRequestId() });

  const enforce = process.env.AUTHZ_ENFORCE === 'true';
  if (!enforce) return; // modo observación: registra pero no bloquea

  if (decision === 'deny') {
    throw new ApiError(403, 'FORBIDDEN', { module, action });
  }
}
```

**Plan de activación gradual (recomendado por el audit):**
1. Mantener `AUTHZ_ENFORCE=false` 1–2 semanas, recolectar `[AUTHZ_LOGONLY] deny` en producción.
2. Activar `AUTHZ_ENFORCE=true` primero en endpoints de **escritura** crítica (RPCs `*_tx`), luego lectura.
3. Definir un *kill switch* — variable de entorno por módulo (`AUTHZ_ENFORCE_INVENTORY`, `AUTHZ_ENFORCE_DESPACHO`) para poder revertir un módulo sin afectar a otros si aparece un falso positivo en producción.

---

## 3. Seguridad XSS

React escapa por defecto el contenido en JSX, así que el vector real en este stack no es "XSS clásico de innerHTML sin escapar" sino estos tres:

1. **`dangerouslySetInnerHTML`** — auditar cada uso. Si renderiza HTML proveniente de un usuario (notas de servicio, comentarios), sanitizar con una allowlist estricta antes de insertar:

```ts
import DOMPurify from 'isomorphic-dompurify';

const safeHtml = DOMPurify.sanitize(rawHtml, {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br'],
  ALLOWED_ATTR: [],
});
```

2. **CSP estricta sin `unsafe-inline` en `script-src`** (ya definida en §2.1) — neutraliza la mayoría de XSS reflejado/almacenado incluso si un payload se cuela, porque el navegador no ejecuta scripts inline no firmados.

3. **Inputs que terminan en atributos `href`/`src` dinámicos** — validar esquema (bloquear `javascript:`) antes de interpolar:

```ts
function safeUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '#';
    return parsed.toString();
  } catch { return '#'; }
}
```

4. **Cookies de sesión:** ya son httpOnly (confirmado en el audit) → no accesibles desde JS, lo cual mitiga el robo de sesión vía XSS aunque exista una inyección puntual. Mantener `Secure` y `SameSite=Lax` (o `Strict` si el flujo no requiere navegación cross-site).

---

## 4. Validación con Zod — contrato único FE/BE

El gap de `select('*')` sin proyección (FE-06/07) y la falta de validación de payload en RPCs son la misma causa: no hay un contrato de datos compartido. Zod resuelve ambos.

**Patrón: schema vive en `src/modules/<contexto>/schema.ts`, se usa en el handler Y en el cliente.**

```ts
// src/modules/inventario/schema.ts
import { z } from 'zod';

export const SerieDTO = z.object({
  id: z.string().uuid(),
  serial: z.string().regex(/^TC-\d{3,}$/),
  current_box_id: z.string().uuid().nullable(),
  status: z.enum(['recepcion', 'backoffice', 'bodega', 'taller', 'despacho', 'devolucion']),
  updated_at: z.string().datetime(),
});
export type Serie = z.infer<typeof SerieDTO>;

export const ListSeriesQuery = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: SerieDTO.shape.status.optional(),
});

export const CreateScanInput = z.object({
  serial: z.string().regex(/^TC-\d{3,}$/),
  boxId: z.string().uuid(),
  idempotencyKey: z.string().uuid(), // ver §5
});
```

**Uso en el Route Handler — rechazo temprano, antes de tocar la BD:**

```ts
export async function POST(req: NextRequest) {
  const { user, supabase } = await requireApiUser();

  const body = await req.json();
  const parsed = CreateScanInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', issues: parsed.error.flatten() },
      { status: 422 }
    );
  }

  await roleGuard(user.id, 'inventario', 'scan', supabase);

  // parsed.data ya es seguro y tipado: nunca se pasa el body crudo al RPC
  const result = await createScanTx(supabase, parsed.data);
  return NextResponse.json(result, { status: 201 });
}
```

**Por qué esto cierra parte del riesgo de RPC sin chequeo (BE-09/10):** hoy "cualquier `authenticated` puede ejecutar RPCs vía PostgREST" directamente, evitando tu capa de aplicación. Zod en el handler no resuelve eso por sí solo — eso se resuelve revocando `EXECUTE` a `authenticated` en PostgREST para los RPC `*_tx` y dejándolos invocables solo desde `service_role` interno con el chequeo de rol ya hecho (ver §4 bis abajo). Zod previene que, una vez dentro del flujo correcto, lleguen payloads malformados o con tipos incorrectos a la capa de BD.

### 4 bis. Cerrar el acceso directo a RPC vía PostgREST (BE-09/10, P0)

```sql
-- Revocar ejecución directa del rol authenticated sobre RPCs transaccionales
REVOKE EXECUTE ON FUNCTION public.create_scan_tx(jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_scan_tx(jsonb) FROM anon;

-- Solo el rol de servicio interno (usado dentro del Route Handler tras roleGuard) puede invocarlo
GRANT EXECUTE ON FUNCTION public.create_scan_tx(jsonb) TO service_role;

-- Dentro del RPC, defensa adicional (defense in depth, no confiar solo en GRANT/REVOKE):
CREATE OR REPLACE FUNCTION public.create_scan_tx(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT app_can('inventario', 'scan') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  -- lógica transaccional...
END;
$$;
```

---

## 5. Idempotencia en transacciones auditables

Para un ERP donde un scan duplicado (doble tap, reintento de red, retry de cola) puede mover una serie dos veces o duplicar un movimiento de inventario, la idempotencia no es opcional — es lo que hace la operación **auditable y segura ante reintentos**.

### 5.1 Tabla de claves de idempotencia

```sql
CREATE TABLE idempotency_keys (
  key            uuid PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES auth.users(id),
  endpoint       text NOT NULL,
  request_hash   text NOT NULL,       -- hash del payload, detecta reuse de key con distinto body
  response_body  jsonb,
  status         text NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);

CREATE INDEX idx_idempotency_expires ON idempotency_keys (expires_at);
```

### 5.2 Patrón en el RPC transaccional

```sql
CREATE OR REPLACE FUNCTION public.create_scan_tx(
  p_idempotency_key uuid,
  p_serial text,
  p_box_id uuid,
  p_request_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing jsonb;
  v_result jsonb;
BEGIN
  -- 1. ¿Ya se procesó esta key?
  SELECT response_body INTO v_existing
  FROM idempotency_keys
  WHERE key = p_idempotency_key AND status = 'completed';

  IF FOUND THEN
    RETURN v_existing; -- devuelve el mismo resultado, no repite el efecto
  END IF;

  -- 2. Reserva la key (UNIQUE constraint = lock natural contra carreras concurrentes)
  INSERT INTO idempotency_keys (key, user_id, endpoint, request_hash, status)
  VALUES (p_idempotency_key, auth.uid(), 'create_scan_tx', p_request_hash, 'processing');
  -- si otra request concurrente con la misma key ya insertó, esto lanza unique_violation
  -- y el handler debe reintentar el SELECT (ver manejo de errores abajo)

  -- 3. Lógica transaccional real (mover serie, registrar evento, etc.)
  UPDATE series SET current_box_id = p_box_id, updated_at = now()
  WHERE serial = p_serial
  RETURNING jsonb_build_object('serial', serial, 'boxId', current_box_id) INTO v_result;

  -- 4. Marca completado con el resultado cacheado
  UPDATE idempotency_keys
  SET status = 'completed', response_body = v_result
  WHERE key = p_idempotency_key;

  RETURN v_result;
EXCEPTION
  WHEN unique_violation THEN
    -- carrera: otra request ganó, espera no es necesaria, solo re-lee
    SELECT response_body INTO v_existing FROM idempotency_keys WHERE key = p_idempotency_key;
    RETURN v_existing;
END;
$$;
```

### 5.3 Contrato HTTP — header `Idempotency-Key`

```ts
// Cliente (React): genera UUID v4 una sola vez por intento lógico de usuario,
// lo reusa en reintentos automáticos de red
const idempotencyKey = crypto.randomUUID();

await fetch('/api/v1/scans', {
  method: 'POST',
  headers: { 'Idempotency-Key': idempotencyKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ serial, boxId }),
});
```

```ts
// Servidor: exige el header, lo pasa al RPC
const idempotencyKey = req.headers.get('idempotency-key');
if (!idempotencyKey || !z.string().uuid().safeParse(idempotencyKey).success) {
  return NextResponse.json({ error: 'IDEMPOTENCY_KEY_REQUIRED' }, { status: 400 });
}
```

### 5.4 Ledger de auditoría (append-only, separado de la tabla operacional)

Para que cada transacción sea **auditable**, no solo idempotente: nunca hacer `UPDATE` destructivo sin dejar rastro. Patrón event-sourcing ligero:

```sql
CREATE TABLE inventory_events (
  id              bigserial PRIMARY KEY,
  series_id       uuid NOT NULL REFERENCES series(id),
  event_type      text NOT NULL,        -- 'scanned_in', 'moved', 'dispatched'...
  from_box_id     uuid,
  to_box_id       uuid,
  performed_by    uuid NOT NULL REFERENCES auth.users(id),
  idempotency_key uuid NOT NULL,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  metadata        jsonb
);
-- inmutable: sin UPDATE/DELETE permitido a nivel de rol, solo INSERT
REVOKE UPDATE, DELETE ON inventory_events FROM authenticated, service_role;
```

El estado actual (`series.current_box_id`) es una *proyección* derivada del ledger — se puede reconstruir, auditar y reprocesar.

---

## 6. Paginación en React + Next.js (elimina los 35+ `select('*')`)

### 6.1 Cursor-based pagination en el backend (no offset — offset degrada con millones de filas)

```ts
// app/api/v1/series/route.ts
export async function GET(req: NextRequest) {
  const { user, supabase } = await requireApiUser();
  const query = ListSeriesQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!query.success) return NextResponse.json({ error: 'VALIDATION_ERROR' }, { status: 422 });

  const { cursor, limit, status } = query.data;

  let q = supabase
    .from('series')
    .select('id, serial, current_box_id, status, updated_at') // proyección explícita, NUNCA '*'
    .order('id', { ascending: true })
    .limit(limit + 1); // +1 para saber si hay siguiente página

  if (cursor) q = q.gt('id', cursor);
  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: 'QUERY_FAILED' }, { status: 500 });

  const hasMore = data.length > limit;
  const items = hasMore ? data.slice(0, -1) : data;

  return NextResponse.json({
    items,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  });
}
```

### 6.2 Cliente: React Query con `useInfiniteQuery`

```tsx
import { useInfiniteQuery } from '@tanstack/react-query';

function useSeries(status?: string) {
  return useInfiniteQuery({
    queryKey: ['series', status],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50', ...(status && { status }), ...(pageParam && { cursor: pageParam }) });
      const res = await fetch(`/api/v1/series?${params}`);
      if (!res.ok) throw new Error('FETCH_FAILED');
      return res.json() as Promise<{ items: Serie[]; nextCursor: string | null }>;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
  });
}
```

### 6.3 Virtualización para listas de millones de series (evita renderizar todo el DOM)

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

function SeriesTable({ items }: { items: Serie[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 10,
  });

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((row) => (
          <div key={row.key} style={{ position: 'absolute', top: row.start, height: row.size, width: '100%' }}>
            {items[row.index].serial}
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Migración de los 35 archivos con `select('*')`:** crear un lint rule (ESLint custom o `grep` en CI) que falle el build si detecta `.select('*')` en `src/modules/**`, forzando proyección explícita vía los DTOs de Zod ya definidos en §4.

---

## 7. BullMQ — procesamiento asíncrono para picos de millones de solicitudes

El audit identifica "Full scan inventario bodega central en cada carga forzada" y "Dashboards agregan en tiempo real sobre tablas grandes" como cuellos de botella. Ambos son candidatos directos a moverse de síncrono (bloquea el request) a asíncrono (cola + worker).

### 7.1 Arquitectura de colas

```
API Route (encola, responde 202 inmediato)
   → BullMQ Queue (Redis)
   → Workers (proceso separado, escalable horizontalmente, fuera de Vercel serverless)
       → Procesa en lotes (batch)
       → Escribe resultado / actualiza estado
       → Reintentos con backoff exponencial
       → Dead-letter queue tras N fallos
```

> **Nota de plataforma:** Vercel serverless no soporta workers de larga duración. BullMQ necesita un proceso persistente (Railway, Fly.io, un contenedor en Render, o una VM pequeña) conectado al mismo Redis. Esto es un cambio de infraestructura, no solo de código.

### 7.2 Definición de cola y productor

```ts
// lib/queues/inventory.ts
import { Queue } from 'bullmq';
import { connection } from './redis-connection';

export const inventoryScanQueue = new Queue('inventory-scan', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 3600 },   // limpieza automática, evita crecer indefinido
    removeOnFail: { age: 86400 },      // conserva fallos 24h para diagnóstico
  },
});
```

```ts
// Route Handler — encola y responde rápido, no bloquea al cliente
export async function POST(req: NextRequest) {
  const { user } = await requireApiUser();
  const parsed = BulkScanInput.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'VALIDATION_ERROR' }, { status: 422 });

  const job = await inventoryScanQueue.add('bulk-scan', {
    userId: user.id,
    scans: parsed.data.scans,        // hasta miles de items en un lote
    idempotencyKey: parsed.data.idempotencyKey,
  }, {
    jobId: parsed.data.idempotencyKey, // BullMQ deduplica por jobId = idempotencia gratis a nivel de cola
  });

  return NextResponse.json({ jobId: job.id, status: 'queued' }, { status: 202 });
}
```

### 7.3 Worker (proceso separado, escalable)

```ts
// worker/inventory-worker.ts
import { Worker } from 'bullmq';
import { connection } from '../lib/queues/redis-connection';

const worker = new Worker(
  'inventory-scan',
  async (job) => {
    const { scans } = job.data;
    // procesa en lotes contra Postgres, usando RPC *_tx con idempotencia (§5)
    for (const batch of chunk(scans, 100)) {
      await processScanBatch(batch);
      await job.updateProgress((batch.index / scans.length) * 100);
    }
  },
  {
    connection,
    concurrency: 10,        // jobs en paralelo por instancia de worker
    limiter: { max: 1000, duration: 60_000 }, // tope de throughput hacia Postgres
  }
);

worker.on('failed', (job, err) => {
  logger.error('scan_job_failed', { jobId: job?.id, error: err.message });
});
```

**Escalado horizontal:** correr N instancias del worker (Docker replicas / autoscaling). BullMQ con Redis como backend coordina el reparto de jobs entre instancias sin colisión — esto es lo que permite absorber picos de "cientos de scans/min" sin saturar la API serverless.

### 7.4 Cliente: consulta de estado (polling corto o WebSocket/SSE)

```ts
// Polling simple
async function pollJobStatus(jobId: string) {
  const res = await fetch(`/api/v1/jobs/${jobId}`);
  return res.json() as Promise<{ status: 'waiting'|'active'|'completed'|'failed', progress: number }>;
}
```

Para UX en tiempo real sin polling agresivo, usar Server-Sent Events alimentados por los eventos de BullMQ (`QueueEvents`).

---

## 8. Diseño REST Full API — convenciones de rutas

```
/api/v1/series                  GET (paginado), POST
/api/v1/series/:id               GET, PATCH
/api/v1/scans                    POST (síncrono, 1 item) | /api/v1/scans/bulk POST (encola en BullMQ)
/api/v1/jobs/:id                 GET (estado de job async)
/api/v1/inventory/boxes/:id      GET
/api/v1/inventory/boxes/:id/move POST (RPC *_tx + idempotency-key)
```

Reglas:
- **Versionado en el path** (`/v1/`) — permite endurecer auth/autorización en `/v2/` sin romper integraciones existentes durante la migración gradual de AUTHZ_ENFORCE.
- **Status codes consistentes:** `200` lectura ok, `201` creado, `202` aceptado-async (BullMQ), `400` payload malformado, `401` no autenticado, `403` autenticado sin permiso, `404`, `409` conflicto (idempotency-key reusada con distinto body), `422` validación Zod, `429` rate limit, `500` error interno (sin detalle de stack al cliente).
- **Envelope de error uniforme:**

```ts
type ApiErrorBody = {
  error: string;        // código estable: 'VALIDATION_ERROR', 'FORBIDDEN', etc.
  requestId: string;    // del correlation ID del middleware
  issues?: unknown;     // detalle Zod, solo en 422
};
```

- **Idempotency-Key obligatorio** en todo POST que cause efecto en BD (no solo scans): creación de boxes, despachos, devoluciones.

---

## 9. Escalabilidad — checklist para millones de solicitudes/min

| Capa | Hoy | Cambio requerido |
|---|---|---|
| Rate limit | Memoria del isolate | Redis distribuido (§2.2) |
| Autorización | Log-only | Enforce gradual por módulo (§2.4) |
| RPC access | PostgREST abierto a `authenticated` | REVOKE + solo `service_role` interno (§4 bis) |
| Listados | `select('*')` sin paginar | Cursor pagination + proyección (§6) |
| Cargas masivas | Síncrono, bloquea request | BullMQ async (§7) |
| Connection pooling | Implícito vía Supabase | Verificar PgBouncer en modo `transaction`, no `session`, para soportar miles de conexiones cortas concurrentes |
| Lecturas pesadas (dashboards) | Tiempo real sobre tablas grandes | Read replica de Supabase o vista materializada refrescada por job BullMQ cada N min |
| Cache | Inventario 2 min en memoria | Mover a Redis compartido si hay >1 instancia activa simultánea |

---

## 10. Roadmap priorizado (P0 → P3)

**P0 — Cierre de brechas críticas (esta semana/próxima):**
1. Revocar `EXECUTE` de RPCs `*_tx` a `authenticated`/`anon` en PostgREST (§4 bis).
2. Migrar rate limiting de memoria a Redis (§2.2) — requisito para activar enforce sin que el rate limit "se resetee" por instancia.
3. Activar `AUTHZ_ENFORCE=true` en RPCs de escritura tras revisar logs `[AUTHZ_LOGONLY] deny`.

**P1 — Idempotencia y auditoría (2–3 semanas):**
4. Tabla `idempotency_keys` + header `Idempotency-Key` obligatorio en POSTs con efecto.
5. Ledger `inventory_events` append-only.

**P2 — Paginación y proyección universal (3–4 semanas):**
6. Eliminar los 35+ `select('*')`, con lint rule en CI.
7. `useInfiniteQuery` + virtualización en las pantallas de listados grandes.

**P3 — Procesamiento asíncrono y escalado horizontal (4–6 semanas):**
8. Mover full-scan de bodega y agregaciones de dashboard a BullMQ + worker dedicado.
9. Read replica / vista materializada para dashboards.
10. Revisar `AUTHZ_ENFORCE` en lecturas (último, porque tiene mayor superficie de falsos positivos).

---

*Documento generado a partir del audit técnico TC-ERP. Cada sección referencia el hallazgo específico (BE-XX/FE-XX) que resuelve, para trazabilidad en el plan de remediación.*
