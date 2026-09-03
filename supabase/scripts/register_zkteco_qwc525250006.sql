-- =============================================================================
-- Registrar / actualizar reloj ZKTeco en zk_devices
-- IP LAN: 192.168.1.221 · SN: QWC525250006
-- Pegar en Supabase → SQL Editor → Run
-- =============================================================================

INSERT INTO public.zk_devices (sn, name, ip_address, state, last_activity)
VALUES (
  'QWC525250006',
  'Reloj ZKTeco · Lab / Oficina',
  '192.168.1.221',
  'OFFLINE',
  NULL
)
ON CONFLICT (sn) DO UPDATE
SET
  name = EXCLUDED.name,
  ip_address = EXCLUDED.ip_address;

SELECT sn, name, ip_address, state, last_activity, created_at
FROM public.zk_devices
WHERE sn = 'QWC525250006';
