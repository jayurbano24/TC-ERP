# CHG — Instalación / actualización local Supabase (TC-ERP)

## Snapshot de revisión (2026-10-20)

| Artefacto | SHA-256 |
|-----------|---------|
| `014_erp_legacy_bootstrap.sql` (generado) | `1576F1C0FC65D47EB429391D2C3CAE7EB6CD4E7010A58DC2927C9E366B7EB33F` |
| `10990000000000_hr_legacy_attendance_bootstrap.sql` (generado) | `558F7C261F9EE42A2D513BC90315755A157465B0D728D116F31F283A7DB87BB1` |
| `hr_legacy/000_hr_attendance_core.sql` | `7344CC233DB86829CF1621E11DB8327C44DD9D5E805116445AEB07CC181A2473` |

Ensambladores deterministas (dos ejecuciones → mismo hash): `npm run supabase:bootstrap:assemble`, `npm run supabase:hr:assemble`.

## Rutas separadas

### Instalación limpia (Docker descartable)

1. `npm run supabase:bootstrap:assemble`
2. `npm run supabase:hr:assemble`
3. `npx supabase start` (requiere `supabase/config.toml`)
4. `npx supabase db reset --local --no-seed`

Cadena verificada localmente hasta **`275_classify_serial_cycle_close_normalize.sql`** inclusive (`Finished supabase db reset on branch main`).

**No asumir** que aplicar retroactivamente `014` en una base ya operativa es seguro: el puente `002_service_orders_shape_bridge` solo hace `DROP … CASCADE` si existe `service_orders.series_id` **sin** `main_serial` (cascarón legacy vacío). Bases post-010 con datos reales no deben pasar por ese camino.

### Actualización desde base existente

- **BLOQUEADA** en este entorno: no hay copia anonimizada representativa con historial `supabase_migrations.schema_migrations` + datos centinela acordados.
- Criterio de aceptación pendiente: restaurar dump autorizado → `migration up` → verificar centinelas + classify sin fusión por serie secundaria.
- **No** usar el esquema mínimo de pruebas classify como sustituto de esta validación.

## Huecos de esquema resueltos (fuentes versionadas)

| Hueco | Fuente canónica | Migración CLI |
|-------|-----------------|---------------|
| ERP 001–019 + `technologies` | `supabase/001…019`, `bootstrap_fragments/` | `014_erp_legacy_bootstrap.sql` (generado) |
| HR / asistencia (`employees`, `time_logs`, …) | `hr_legacy/000_*`, `020–023`, `migration_v3–v5` | `10990000000000_hr_legacy_attendance_bootstrap.sql` (generado) |
| `user_sessions` | `platform_fragments/001_user_sessions.sql` | `16290000000000_platform_user_sessions.sql` |
| Piezas históricas fuera de convención | ver tabla “omitidos promovidos” | `023`, `034`, `05390000000000`, `099600…`, `106900…`, `119900…` |

`employees` **nunca** tuvo `CREATE TABLE` en Git; el núcleo se reconstruyó desde app RRHH/kiosko, `020–023`, migraciones 110+ y `migration_v2–v5` (documentado en cabecera de `000_hr_attendance_core.sql`). No es un stub mínimo para 146.

## SQL omitido / no promovido

| Archivo / carpeta | Clasificación | Acción |
|-------------------|---------------|--------|
| `001–019` (raíz) | Estructura | `014` (generado) |
| `020–023`, `migration_v2–v5` | Estructura HR | `109900…` (generado) |
| `002_seed_reference_data.sql` | Seed | `--no-seed`; SQL Editor opcional |
| `003_validation_queries.sql` | Diagnóstico | No migración |
| `004/005_bootstrap_admin*.sql` | Operativo | No migración |
| `supabase/scripts/**` | Diagnóstico / reparación puntual / ETL manual | No promover sin revisión |
| `191b_*`, `201b_*` (nombres inválidos CLI) | Reparación | Mantener fuera de cadena o renombrar con cuidado en remoto |
| `189–195`, `202–204`, `216` (reparaciones SN/caja) | Reparación puntual | En cadena CLI; **skip** con `NOTICE` si faltan datos (fresh install) |
| `239` seeds UUID catálogo | Datos prod | Insert solo si existen FK en `cat_*` |

## Config local

- `supabase/config.toml` — sin secretos de prod; claves demo las emite `supabase start`.
- `project_id = tc-erp-local`, Postgres **major_version = 15** (contenedor reporta **15.8**).

## Equivalencia PostgreSQL (classify)

| Entorno | Versión | Uso |
|---------|---------|-----|
| Supabase local (destino) | PostgreSQL **15.8** (Linux, Docker) | Cadena completa migrations |
| Vitest classify (efímero) | BioTime **10.7** (Windows) | Esquema **mínimo** + stack 177→275 |

Las **28** pruebas focales siguen en PG 10.7 / esquema reducido (garantías de identidad classify). Repetirlas contra PG 15 + esquema completo requiere extender el harness (p. ej. `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`) — **pendiente**; no sustituye la validación de actualización bloqueada arriba.

## Comandos de validación ejecutados (local)

```text
npm run supabase:bootstrap:assemble   # reproducible
npm run supabase:hr:assemble          # reproducible
npx supabase stop --no-backup
npx supabase start                    # exit 0
npx supabase db reset --local --no-seed   # exit 0, through 275
npm test -- …classify… (3 files)      # 28/28 passed
docker exec supabase_db_tc-erp-local psql -U postgres -c "SELECT version();"
```

## Git / archivos eliminados

- `git ls-files --deleted`: vacío en HEAD actual; no se restauró ningún archivo borrado sin revisión.
- Ensamblador ERP: `scripts/assemble-erp-bootstrap-migration.mjs` presente (antes reportado ausente en otro checkout).

## Limitaciones

- **Actualización representativa**: BLOQUEADA (sin dump autorizado).
- **Classify en PG 15 full schema**: no ejecutado en esta entrega.
- **100 % sistema**: no declarado; solo instalación limpia local + 28/28 focales en harness minimal.
