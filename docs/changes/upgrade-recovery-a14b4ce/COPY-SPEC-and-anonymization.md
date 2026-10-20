# Copia representativa autorizada — especificación y obtención

**Estado:** PREPARADO (sin copia en repositorio; sin acceso a producción desde este entorno).

## Qué debe contener el artefacto

| Componente | Obligatorio | Notas |
|------------|-------------|--------|
| Esquema `public` (+ extensiones usadas) | Sí | Incluir tipos ENUM, vistas materializadas referenciadas por classify |
| Esquema `auth` | Sí | Usuarios de prueba remapeados; sin contraseñas reales |
| Tabla `supabase_migrations.schema_migrations` | **Sí** | Debe reflejar el **estado previo real** al upgrade hacia `a14b4ce`, no el historial de instalación limpia |
| Storage buckets/policies | Parcial | Si se prueba avatars (`01600000000001`); puede ser bucket vacío |
| Objetos legacy fuera de CLI | Documentar | Scripts en `supabase/scripts/` no forman parte del dump automático |
| Datos operativos anonimizados | Sí | Ver tabla de dominios abajo |

### Dominios de datos (mínimo representativo)

1. **Órdenes:** mezcla OS abiertas y cerradas, con y sin `sap_transfer_id`, recepciones PX y taller.
2. **Series:** S1–S4 históricos, al menos un caso con **serie secundaria compartida** entre equipos distintos (centinela 177/272).
3. **Ciclos:** filas en `service_order_serial_cycles` abiertas y cerradas.
4. **Usuarios y roles:** perfiles con roles operativos (`user_roles`, `hr_positions`, permisos ERP) suficientes para classify + RLS `activity_costs`.
5. **Cajas / recepciones:** volumen pequeño pero con FK reales para recorridos PX y bodega.

### Tamaño orientativo

- Objetivo: **≤ 5–15 GB** comprimido, acotado por muestreo temporal (p. ej. últimos 90 días + centinelas manuales).
- Incluir manifest JSON con checksum SHA-256 del dump y commit Git objetivo `a14b4ce`.

## Responsable autorizado (fuera de Cursor / sin prod en agente)

1. **Congelar** ventana de exportación acordada con operaciones (solo lectura / réplica).
2. **Export lógico** desde réplica o backup, nunca desde primario en caliente sin runbook:

```bash
# Ejemplo: custom format; ajustar host/credenciales según runbook interno.
pg_dump -Fc -h <REPLICA_HOST> -U <ROLE_READ> -d postgres \
  --schema=public --schema=auth --schema=storage \
  --table=supabase_migrations.schema_migrations \
  -f tc-erp-pre-a14b4ce-base.dump
```

3. **Datos adicionales** (si el dump es solo esquema + muestra):

```bash
pg_dump -Fc -h <REPLICA_HOST> -U <ROLE_READ> -d postgres \
  --data-only \
  --table=public.service_orders \
  --table=public.series \
  --table=public.service_order_serial_cycles \
  --table=public.receptions \
  --table=public.boxes \
  --table=public.profiles \
  --table=public.user_roles \
  --table=public.hr_positions \
  --table=public.erp_role_permissions \
  --table=public.domain_events \
  -f tc-erp-pre-a14b4ce-data-sample.dump
```

4. **Anonimización** (en entorno intermedio, no prod):

| Tabla / campo | Acción |
|---------------|--------|
| `auth.users.email` | Reemplazar por `user+<id>@example.invalid` |
| `auth.users.phone` | NULL |
| `profiles.email`, nombres | Hash o placeholders |
| `series.serial_number` | Opcional: sustituir prefijos manteniendo **colisiones centinela** acordadas |
| SAP / clientes | Truncar IDs sensibles; conservar cardinalidad y FK |

5. **Validar** dump restaurable en Postgres 15 vacío antes de entregar al equipo de validación.

6. **Entregar** al validador:

   - `tc-erp-pre-a14b4ce-base.dump` (+ data sample si aplica)
   - `copy-manifest.json` (checksums, fecha, versión PG origen, última fila `schema_migrations`)
   - Lista de centinelas manuales (IDs de OS/series de prueba)

## Recovery (diseño)

- Vaciar **solo** stack upgrade (`npm run supabase:upgrade:wipe`) antes de restaurar.
- `pg_restore` **sin** `--clean`; validar ausencia de residuos con `10_residual_objects_after_recovery.sql` + fingerprints (`recovered` ≡ `before`).

## Qué no hacer

- No publicar dumps en git remoto.
- No usar `supabase db reset` sobre la copia como “simulación de upgrade”.
- No manipular `schema_migrations` para forzar coincidencias.
- No asumir que revertir SQL de `273` restaura filas fusionadas por classify legacy.
