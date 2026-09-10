-- 239 — Completar mapeos diagnóstico → reparación (cola Reparación / validación taller).
-- Idempotente: ON CONFLICT DO NOTHING.

INSERT INTO public.cat_diagnostic_repairs (diagnostic_id, repair_id) VALUES
  -- NO ENCIENDE: faltaba fuente y transistor
  ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111'),
  ('55555555-5555-5555-5555-555555555555', 'edafde3f-7c3b-4fd4-8565-8bba9288fd27'),

  -- NO SINTONIZA: antena
  ('158df908-9c07-4a42-ad13-ef031f2c2ad5', '33333333-3333-3333-3333-333333333333'),

  -- NO ASIGNA IP
  ('94136f0f-cac0-4bdb-8e30-99f429aa8ce7', '22222222-2222-2222-2222-222222222222'),
  ('94136f0f-cac0-4bdb-8e30-99f429aa8ce7', '8d45959a-ce4a-4254-ada9-402139215741'),
  ('94136f0f-cac0-4bdb-8e30-99f429aa8ce7', '0f953bf9-ada7-4004-9d58-6952f965a8d1'),
  ('94136f0f-cac0-4bdb-8e30-99f429aa8ce7', 'a8372731-c1d2-40cd-bb1c-1f48df8a7f6e'),

  -- NO INGRESA A PORTAL
  ('a288b3d4-c5f0-469d-a689-3d0d2abe9a07', '22222222-2222-2222-2222-222222222222'),
  ('a288b3d4-c5f0-469d-a689-3d0d2abe9a07', '8d45959a-ce4a-4254-ada9-402139215741'),
  ('a288b3d4-c5f0-469d-a689-3d0d2abe9a07', 'd764386e-d97d-48e2-ac14-1c901fe83c04'),

  -- BLOQUEADO
  ('e251832a-b932-4a8e-acbd-c3a875512c61', '22222222-2222-2222-2222-222222222222'),
  ('e251832a-b932-4a8e-acbd-c3a875512c61', '8d45959a-ce4a-4254-ada9-402139215741'),
  ('e251832a-b932-4a8e-acbd-c3a875512c61', 'd764386e-d97d-48e2-ac14-1c901fe83c04'),
  ('e251832a-b932-4a8e-acbd-c3a875512c61', 'eed1f2e7-4136-456e-8318-da70eb69a6f7'),

  -- ACTUALIZACIÓN DE FIRMWARE
  ('cb8e65a6-0319-43b6-9c81-976375847789', 'd764386e-d97d-48e2-ac14-1c901fe83c04'),
  ('cb8e65a6-0319-43b6-9c81-976375847789', '22222222-2222-2222-2222-222222222222'),
  ('cb8e65a6-0319-43b6-9c81-976375847789', '8d45959a-ce4a-4254-ada9-402139215741'),

  -- TUNER DESCALIBRADO
  ('fe934a17-69b6-4ea6-b386-1963a5db82c2', '22222222-2222-2222-2222-222222222222'),
  ('fe934a17-69b6-4ea6-b386-1963a5db82c2', '8d45959a-ce4a-4254-ada9-402139215741'),
  ('fe934a17-69b6-4ea6-b386-1963a5db82c2', 'd764386e-d97d-48e2-ac14-1c901fe83c04'),

  -- PUERTO USB OXIDADO: segundo registro duplicado de reparación USB
  ('4b20196d-4309-49dd-9a7d-73aca18c028e', '98acbb60-98cd-45cd-b37f-d6e58ab6e45a'),

  -- SE FRIZA: también software
  ('7197c3c1-555a-4830-ba21-ae77d4beeb09', 'd764386e-d97d-48e2-ac14-1c901fe83c04')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.cat_diagnostic_repairs IS
  'Reparaciones permitidas por diagnóstico — validadas en Taller Reparación/L3.';
