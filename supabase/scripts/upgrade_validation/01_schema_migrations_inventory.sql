-- Inventario de historial de migraciones (antes/después de upgrade).
\set ON_ERROR_STOP on
SELECT current_database() AS db, version() AS pg_version, now() AT TIME ZONE 'UTC' AS captured_at_utc;

SELECT COUNT(*) AS schema_migrations_rows
FROM supabase_migrations.schema_migrations;

SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version DESC
LIMIT 25;

-- Migraciones del manifiesto a14b4ce que aún NO están aplicadas (ajustar lista si baseline difiere).
WITH expected(version) AS (
  VALUES
    ('014'),
    ('01600000000000'),
    ('01600000000001'),
    ('023'),
    ('02850000000000'),
    ('034'),
    ('05390000000000'),
    ('09960000000000'),
    ('10690000000000'),
    ('10990000000000'),
    ('11990000000000'),
    ('16290000000000'),
    ('20261020001356'),
    ('272'),
    ('273'),
    ('274'),
    ('275')
)
SELECT e.version AS pending_if_missing
FROM expected e
LEFT JOIN supabase_migrations.schema_migrations m
  ON m.version = e.version OR m.name LIKE e.version || '%'
WHERE m.version IS NULL
ORDER BY e.version;
