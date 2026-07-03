# TC-ERP — Plan de Reducción de Egress en Bodega (Opción A + Opción B) y Frameworks de Soporte

> Continuación del hallazgo: `fetchBoxes()` descarga las 24,022 series completas (~12 MB con proyección) en cada navegación a `/bodega/gestion`. Ya implementaste **Opción B** (caché de sesión) como parche seguro pre-deploy. Este plan detalla **Opción A** (rediseño on-demand) como la solución estructural, más los frameworks concretos de virtualización, paginación y seguridad para sostenerla en producción a escala.

---

## 0. Diagnóstico — por qué Opción B no basta a largo plazo

Opción B (caché de sesión) resuelve **re-visitas** a la misma sesión, pero no resuelve:
- La **primera carga** de cada sesión sigue bajando 12 MB / 24,022 filas.
- El **dato sigue creciendo** (la tabla `series` es "la que más crece" según el audit) → el ahorro porcentual de B se diluye con el tiempo, el problema de fondo escala linealmente con el inventario.
- Multi-sede / multi-usuario: cada usuario tiene su propia caché de sesión, así que el egress agregado del servidor no baja proporcionalmente al número de usuarios concurrentes.

Opción A ataca la causa raíz: **dejar de traer 24,022 series cuando la página solo necesita "resumen por caja" para la lista**, y traer las series completas solo cuando el usuario realmente opera sobre una caja específica.

---

## 1. Rediseño Opción A — arquitectura de carga bajo demanda

### 1.1 Principio de diseño

```
Vista LISTA de Bodega (la que se abre siempre)
   → Endpoint de RESUMEN: 1 fila por caja, NO 1 fila por serie
   → Derivación de "serie representante" (tech/área/recibió) se mueve al SERVIDOR

Vista DETALLE de una caja (al expandir/operar)
   → Endpoint de SERIES por caja, paginado, solo cuando el usuario lo pide
```

Esto reduce el payload de la carga inicial de **24,022 filas × 13 columnas** a **N_cajas filas × ~10 columnas resumen**, sin tocar la lógica de búsqueda (que ya no usa seriales, según confirmaste en el audit).

### 1.2 Modelo de datos — mover la derivación al servidor

Hoy el frontend deriva "tech/área/recibió" tomando `series[0]` del arreglo completo. Esa derivación se reemplaza por una **vista materializada** (o vista normal indexada, según volumen de escritura) que el servidor mantiene actualizada:

```sql
-- Opción recomendada si las escrituras a `series` son frecuentes (evita refresh costoso):
-- vista normal con índice de soporte, NO materializada
CREATE OR REPLACE VIEW warehouse_box_summary AS
SELECT
  b.id                          AS box_id,
  b.rack,
  b.label,
  COUNT(s.id)                   AS series_count,
  (ARRAY_AGG(s.current_status ORDER BY s.created_at))[1]      AS sample_status,
  (ARRAY_AGG(s.brand_id ORDER BY s.created_at))[1]            AS sample_brand_id,
  (ARRAY_AGG(s.model_id ORDER BY s.created_at))[1]            AS sample_model_id,
  (ARRAY_AGG(s.service_order_id ORDER BY s.created_at))[1]    AS sample_service_order_id,
  MAX(s.updated_at)             AS last_movement_at
FROM boxes b
LEFT JOIN series s ON s.current_box_id = b.id
GROUP BY b.id, b.rack, b.label;

-- Índice de soporte para que el GROUP BY no escanee toda `series` en cada request
CREATE INDEX IF NOT EXISTS idx_series_current_box_id ON series (current_box_id, created_at);
```

> **Alternativa si el cálculo agregado sigue siendo costoso bajo carga:** vista materializada `warehouse_box_summary_mv`, refrescada por un job BullMQ cada 2–5 min (`REFRESH MATERIALIZED VIEW CONCURRENTLY`). Trade-off: el resumen queda con hasta 5 min de desfase — aceptable para conteos/etiquetas de caja, no para el detalle operativo (que sí lee en vivo).

### 1.3 Endpoint de resumen (reemplaza `fetchBoxes()` completo)

```ts
// app/api/v1/warehouse/boxes/route.ts
import { z } from 'zod';

const ListBoxesQuery = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  search: z.string().trim().max(100).optional(), // busca por id/marca/modelo/tech/rack, NO por serial
});

export async function GET(req: NextRequest) {
  const { user, supabase } = await requireApiUser();
  const parsed = ListBoxesQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'VALIDATION_ERROR' }, { status: 422 });

  const { cursor, limit, search } = parsed.data;

  let q = supabase
    .from('warehouse_box_summary')
    .select('box_id, rack, label, series_count, sample_status, sample_brand_id, sample_model_id, last_movement_at')
    .order('box_id', { ascending: true })
    .limit(limit + 1);

  if (cursor) q = q.gt('box_id', cursor);
  if (search) q = q.or(`rack.ilike.%${search}%,label.ilike.%${search}%`); // misma lógica de búsqueda actual, sin seriales

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: 'QUERY_FAILED' }, { status: 500 });

  const hasMore = data.length > limit;
  const items = hasMore ? data.slice(0, -1) : data;

  return NextResponse.json({
    items,
    nextCursor: hasMore ? items[items.length - 1].box_id : null,
  });
}
```

**Impacto esperado:** si hay, por ejemplo, 300 cajas activas frente a 24,022 series, el payload de carga inicial baja de ~12 MB a un orden de decenas de KB — independiente de cuántas series existan en total. El egress deja de crecer con el inventario y pasa a crecer con el número de cajas, que escala mucho más lento.

### 1.4 Endpoint de detalle (series de una caja, solo al expandir)

```ts
// app/api/v1/warehouse/boxes/[boxId]/series/route.ts
const ListBoxSeriesQuery = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(req: NextRequest, { params }: { params: { boxId: string } }) {
  const { user, supabase } = await requireApiUser();
  await roleGuard(user.id, 'bodega', 'read', supabase);

  const parsed = ListBoxSeriesQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'VALIDATION_ERROR' }, { status: 422 });

  const { cursor, limit } = parsed.data;
  let q = supabase
    .from('series')
    .select('id, serial_number, current_status, model_id, brand_id, material, valuation, notes, sap_status') // proyección, no '*'
    .eq('current_box_id', params.boxId)
    .order('id', { ascending: true })
    .limit(limit + 1);

  if (cursor) q = q.gt('id', cursor);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: 'QUERY_FAILED' }, { status: 500 });

  const hasMore = data.length > limit;
  const items = hasMore ? data.slice(0, -1) : data;
  return NextResponse.json({ items, nextCursor: hasMore ? items[items.length - 1].id : null });
}
```

Esto cubre detalle, impresión de etiqueta y escaneo: cada operación pide las series de **una** caja (decenas/cientos de filas), no las 24,022.

### 1.5 Caso especial: validación de despacho (`box.series`)

Si el flujo de despacho necesita validar todas las series de una caja antes de confirmar, **no** se trae el arreglo completo al cliente para validar en JS — se valida server-side dentro del RPC `*_tx` de despacho, que ya tiene acceso directo a la BD sin pagar el costo de egress hacia el navegador:

```sql
CREATE OR REPLACE FUNCTION public.dispatch_box_tx(p_box_id uuid, p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invalid_count int;
BEGIN
  IF NOT app_can('bodega', 'despacho') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO v_invalid_count
  FROM series
  WHERE current_box_id = p_box_id AND current_status NOT IN ('bodega', 'taller_completado');

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'BOX_HAS_INVALID_SERIES' USING ERRCODE = 'P0001';
  END IF;

  -- procede con el despacho...
END;
$$;
```

El cliente solo recibe `{ ok: true }` o un error con el conteo de inválidas — nunca el arreglo de series para validar localmente.

---

## 2. Framework de virtualización — TanStack Virtual

Aun con el resumen reduciendo el payload, si hay cientos de cajas en pantalla a la vez conviene virtualizar el DOM (igual que se especificó para listas de series en el plan anterior).

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

function BoxList({ boxes }: { boxes: BoxSummary[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: boxes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64, // alto de cada fila/card de caja
    overscan: 8,
  });

  return (
    <div ref={parentRef} style={{ height: '70vh', overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((row) => {
          const box = boxes[row.index];
          return (
            <div key={box.box_id} style={{ position: 'absolute', top: row.start, height: row.size, width: '100%' }}>
              <BoxCard box={box} onExpand={() => loadSeriesForBox(box.box_id)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

`onExpand` es el único punto donde se dispara el fetch de series detalladas (§1.4) — carga perezosa real, no solo virtualización visual.

---

## 3. Framework de paginación + caché — TanStack Query

Reemplaza el `fetchBoxes()` monolítico por `useInfiniteQuery`, igual que el patrón ya definido para `series` en el plan anterior, pero aplicado al resumen de cajas:

```tsx
function useWarehouseBoxes(search?: string) {
  return useInfiniteQuery({
    queryKey: ['warehouse-boxes', search],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '100', ...(search && { search }), ...(pageParam && { cursor: pageParam }) });
      const res = await fetch(`/api/v1/warehouse/boxes?${params}`);
      if (!res.ok) throw new Error('FETCH_FAILED');
      return res.json() as Promise<{ items: BoxSummary[]; nextCursor: string | null }>;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 2 * 60_000,   // exactamente la Opción B que ya implementaste, ahora aplicada al endpoint liviano
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}

function useBoxSeries(boxId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['box-series', boxId],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50', ...(pageParam && { cursor: pageParam }) });
      const res = await fetch(`/api/v1/warehouse/boxes/${boxId}/series?${params}`);
      return res.json() as Promise<{ items: Serie[]; nextCursor: string | null }>;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled, // solo se ejecuta cuando el usuario expande la caja — carga bajo demanda real
    staleTime: 60_000,
  });
}
```

**Por qué esto ya es mejor que la Opción B aislada:** la Opción B cacheaba 12 MB completos por sesión. Aquí el `staleTime` de 2 min aplica sobre un payload que ya es órdenes de magnitud más chico, así que el ahorro de B se mantiene **y** la causa raíz (traer todo el inventario) queda resuelta.

### 3.1 Caché compartida entre usuarios (opcional, para multi-sede)

El resumen de cajas es el mismo para todos los usuarios de una sede en una ventana corta de tiempo. Si el tráfico concurrente es alto, vale la pena un caché de borde compartido (no solo por sesión de cliente):

```ts
// Edge cache con Vercel/Redis, TTL corto, invalidado por evento al escribir
export async function GET(req: NextRequest) {
  const cacheKey = `warehouse:boxes:${searchParamsHash}`;
  const cached = await redis.get(cacheKey);
  if (cached) return NextResponse.json(JSON.parse(cached), { headers: { 'x-cache': 'HIT' } });

  const result = await queryBoxSummary(/* ... */);
  await redis.set(cacheKey, JSON.stringify(result), { ex: 30 }); // 30s, corto porque el inventario se mueve
  return NextResponse.json(result, { headers: { 'x-cache': 'MISS' } });
}
```

Esto reduce el egress **del lado del servidor hacia Supabase**, no solo del servidor hacia el navegador — relevante porque con múltiples sedes consultando simultáneamente, el cuello de botella se mueve a la consulta a Postgres, no solo a la respuesta HTTP.

---

## 4. Framework de seguridad aplicado a este rediseño

El rediseño introduce dos endpoints nuevos (`/boxes` resumen y `/boxes/:id/series`), así que hereda — y debe reforzar — los controles ya definidos en el plan general:

1. **`roleGuard` con `app_can('bodega', 'read')`** en ambos endpoints, en modo enforce (no log-only), porque son rutas nuevas — no hay razón para introducirlas ya en modo observación.
2. **RLS sobre la vista** `warehouse_box_summary`: una vista hereda RLS de las tablas base solo si se crea sin `SECURITY DEFINER` y el usuario que consulta tiene permisos sobre `boxes`/`series` directamente. Si la sede del usuario debe limitar qué cajas ve (multi-sede), la política RLS debe replicarse explícitamente:

```sql
ALTER VIEW warehouse_box_summary SET (security_invoker = true); -- respeta RLS del usuario que consulta, no del creador de la vista

-- Política base que ya debe existir en `boxes`:
CREATE POLICY boxes_by_site ON boxes
  FOR SELECT USING (site_id = app_current_site_id());
```

Sin `security_invoker = true`, una vista corre con los privilegios de quien la creó, lo que puede **filtrar datos de otras sedes** — exactamente el tipo de bypass que el audit ya marcó como riesgo (RLS permisiva).

3. **Validación Zod del parámetro `search`** (ya incluida arriba) — evita que un input de búsqueda mal formado llegue a un `ilike` sin sanear longitud/caracteres.
4. **Idempotencia en `dispatch_box_tx`** — reutiliza el patrón de `idempotency_keys` del plan anterior; un despacho duplicado por reintento de red es un error operativo serio en bodega.

---

## 5. Resumen — qué cambia y qué no

| Aspecto | Antes | Después (Opción A) |
|---|---|---|
| Carga inicial de Bodega | 24,022 filas / ~12 MB | N_cajas filas (resumen), órdenes de magnitud menor |
| Búsqueda | Sobre arreglo en memoria del cliente | Sobre `warehouse_box_summary` en servidor (mismos campos: id/marca/modelo/tech/rack) |
| Detalle de caja | Ya estaba en memoria (parte del arreglo completo) | Fetch bajo demanda, paginado, solo al expandir |
| Validación de despacho | En el cliente con `box.series` | En el servidor, dentro del RPC `*_tx` |
| Egress que crece con el inventario | Sí, linealmente | No — crece con el número de cajas, no de series |
| Riesgo de regresión | — | Medio: requiere QA del flujo completo de bodega (lista, detalle, despacho, impresión, escaneo) antes de producción, tal como ya identificaste |

---

## 6. Plan de implementación sugerido (con QA, como acordaste)

1. **Staging:** implementar `warehouse_box_summary` + endpoint `/boxes` resumen, en paralelo al `fetchBoxes()` actual (feature flag).
2. **QA dirigido:** validar que lista, stats y búsqueda dan resultados idénticos contra el endpoint nuevo vs. el actual, con datos reales de staging.
3. **Endpoint de detalle:** implementar `/boxes/:id/series`, conectar a expansión de caja, modal de detalle, impresión y escaneo — uno por uno, cada uno verificable de forma aislada.
4. **Mover validación de despacho al servidor** (`dispatch_box_tx`) — probar específicamente el caso de caja con series en estado inválido.
5. **Activar virtualización** (TanStack Virtual) en la lista — cambio puramente de render, bajo riesgo, se puede hacer en paralelo a los pasos anteriores.
6. **Feature flag a 100%** una vez QA pase, eliminar `fetchBoxes()` legacy.
7. **Monitorear egress real** post-deploy (mismo método de medición que usaste para Opción B: muestra real vs. extrapolación) para confirmar el ~90%+ de reducción esperado.
