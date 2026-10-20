-- 239 — Completar mapeos diagnóstico → reparación (cola Reparación / validación taller).
-- Idempotente: solo inserta pares cuyos UUID existen en catálogo (fresh install sin seed → 0 filas).

INSERT INTO public.cat_diagnostic_repairs (diagnostic_id, repair_id)
SELECT v.d, v.r
FROM (
  VALUES
    ('55555555-5555-5555-5555-555555555555'::uuid, '11111111-1111-1111-1111-111111111111'::uuid),
    ('55555555-5555-5555-5555-555555555555'::uuid, 'edafde3f-7c3b-4fd4-8565-8bba9288fd27'::uuid),
    ('158df908-9c07-4a42-ad13-ef031f2c2ad5'::uuid, '33333333-3333-3333-3333-333333333333'::uuid),
    ('94136f0f-cac0-4bdb-8e30-99f429aa8ce7'::uuid, '22222222-2222-2222-2222-222222222222'::uuid),
    ('94136f0f-cac0-4bdb-8e30-99f429aa8ce7'::uuid, '8d45959a-ce4a-4254-ada9-402139215741'::uuid),
    ('94136f0f-cac0-4bdb-8e30-99f429aa8ce7'::uuid, '0f953bf9-ada7-4004-9d58-6952f965a8d1'::uuid),
    ('94136f0f-cac0-4bdb-8e30-99f429aa8ce7'::uuid, 'a8372731-c1d2-40cd-bb1c-1f48df8a7f6e'::uuid),
    ('a288b3d4-c5f0-469d-a689-3d0d2abe9a07'::uuid, '22222222-2222-2222-2222-222222222222'::uuid),
    ('a288b3d4-c5f0-469d-a689-3d0d2abe9a07'::uuid, '8d45959a-ce4a-4254-ada9-402139215741'::uuid),
    ('a288b3d4-c5f0-469d-a689-3d0d2abe9a07'::uuid, 'd764386e-d97d-48e2-ac14-1c901fe83c04'::uuid),
    ('e251832a-b932-4a8e-acbd-c3a875512c61'::uuid, '22222222-2222-2222-2222-222222222222'::uuid),
    ('e251832a-b932-4a8e-acbd-c3a875512c61'::uuid, '8d45959a-ce4a-4254-ada9-402139215741'::uuid),
    ('e251832a-b932-4a8e-acbd-c3a875512c61'::uuid, 'd764386e-d97d-48e2-ac14-1c901fe83c04'::uuid),
    ('e251832a-b932-4a8e-acbd-c3a875512c61'::uuid, 'eed1f2e7-4136-456e-8318-da70eb69a6f7'::uuid),
    ('cb8e65a6-0319-43b6-9c81-976375847789'::uuid, 'd764386e-d97d-48e2-ac14-1c901fe83c04'::uuid),
    ('cb8e65a6-0319-43b6-9c81-976375847789'::uuid, '22222222-2222-2222-2222-222222222222'::uuid),
    ('cb8e65a6-0319-43b6-9c81-976375847789'::uuid, '8d45959a-ce4a-4254-ada9-402139215741'::uuid),
    ('fe934a17-69b6-4ea6-b386-1963a5db82c2'::uuid, '22222222-2222-2222-2222-222222222222'::uuid),
    ('fe934a17-69b6-4ea6-b386-1963a5db82c2'::uuid, '8d45959a-ce4a-4254-ada9-402139215741'::uuid),
    ('fe934a17-69b6-4ea6-b386-1963a5db82c2'::uuid, 'd764386e-d97d-48e2-ac14-1c901fe83c04'::uuid),
    ('4b20196d-4309-49dd-9a7d-73aca18c028e'::uuid, '98acbb60-98cd-45cd-b37f-d6e58ab6e45a'::uuid),
    ('7197c3c1-555a-4830-ba21-ae77d4beeb09'::uuid, 'd764386e-d97d-48e2-ac14-1c901fe83c04'::uuid)
) AS v(d, r)
WHERE EXISTS (SELECT 1 FROM public.cat_diagnostics cd WHERE cd.id = v.d)
  AND EXISTS (SELECT 1 FROM public.cat_repairs cr WHERE cr.id = v.r)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.cat_diagnostic_repairs IS
  'Reparaciones permitidas por diagnóstico — validadas en Taller Reparación/L3.';
