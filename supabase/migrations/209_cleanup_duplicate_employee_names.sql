-- =============================================================================
-- 209 — Limpiar empleados duplicados por nombre (p.ej. JOSHUA MISAEL…).
-- Conserva 1 registro por nombre normalizado (prioriza biometría, Activo, más antiguo).
-- Reasigna time_logs / absences al keeper y elimina el resto.
-- =============================================================================

DO $cleanup$
DECLARE
  v_deleted integer := 0;
BEGIN
  CREATE TEMP TABLE _emp_dup_map (
    lose_id uuid PRIMARY KEY,
    keep_id uuid NOT NULL,
    norm text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _emp_dup_map (lose_id, keep_id, norm)
  WITH ranked AS (
    SELECT
      e.id,
      lower(trim(regexp_replace(coalesce(e.nombre_completo, ''), '\s+', ' ', 'g'))) AS norm,
      ROW_NUMBER() OVER (
        PARTITION BY lower(trim(regexp_replace(coalesce(e.nombre_completo, ''), '\s+', ' ', 'g')))
        ORDER BY
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM public.employee_face_embeddings f
              WHERE f.employee_id = e.id AND coalesce(f.active, true)
            ) THEN 0
            ELSE 1
          END,
          CASE WHEN lower(coalesce(e.status, '')) IN ('activo', 'active') THEN 0 ELSE 1 END,
          e.created_at ASC NULLS LAST,
          e.codigo_empleado ASC NULLS LAST,
          e.id ASC
      ) AS rn
    FROM public.employees e
    WHERE trim(coalesce(e.nombre_completo, '')) <> ''
  ),
  keepers AS (
    SELECT id AS keep_id, norm
    FROM ranked
    WHERE rn = 1
  ),
  losers AS (
    SELECT id AS lose_id, norm
    FROM ranked
    WHERE rn > 1
  )
  SELECT l.lose_id, k.keep_id, l.norm
  FROM losers l
  JOIN keepers k ON k.norm = l.norm;

  IF NOT EXISTS (SELECT 1 FROM _emp_dup_map) THEN
    RAISE NOTICE '209: no hay empleados duplicados por nombre.';
    RETURN;
  END IF;

  -- Reasignar marcajes al keeper
  IF to_regclass('public.time_logs') IS NOT NULL THEN
    UPDATE public.time_logs tl
    SET employee_id = m.keep_id
    FROM _emp_dup_map m
    WHERE tl.employee_id = m.lose_id;
  END IF;

  IF to_regclass('public.employee_absences') IS NOT NULL THEN
    UPDATE public.employee_absences a
    SET employee_id = m.keep_id
    FROM _emp_dup_map m
    WHERE a.employee_id = m.lose_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.employee_absences x
        WHERE x.employee_id = m.keep_id
          AND x.fecha IS NOT DISTINCT FROM a.fecha
          AND x.tipo_falta IS NOT DISTINCT FROM a.tipo_falta
      );
    DELETE FROM public.employee_absences a
    USING _emp_dup_map m
    WHERE a.employee_id = m.lose_id;
  END IF;

  IF to_regclass('public.employee_current_status') IS NOT NULL THEN
    DELETE FROM public.employee_current_status s
    USING _emp_dup_map m
    WHERE s.employee_id = m.lose_id;
  END IF;

  IF to_regclass('public.employee_face_embeddings') IS NOT NULL THEN
    DELETE FROM public.employee_face_embeddings f
    USING _emp_dup_map m
    WHERE f.employee_id = m.lose_id;
  END IF;

  -- profiles.employee_id (si existe)
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'employee_id'
  ) THEN
    UPDATE public.profiles p
    SET employee_id = m.keep_id
    FROM _emp_dup_map m
    WHERE p.employee_id = m.lose_id
      AND NOT EXISTS (
        SELECT 1 FROM public.profiles p2 WHERE p2.employee_id = m.keep_id
      );
    UPDATE public.profiles p
    SET employee_id = NULL
    FROM _emp_dup_map m
    WHERE p.employee_id = m.lose_id;
  END IF;

  DELETE FROM public.employees e
  USING _emp_dup_map m
  WHERE e.id = m.lose_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE '209: eliminados % empleados duplicados por nombre.', v_deleted;
END;
$cleanup$;
