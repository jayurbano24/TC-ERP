-- Habilitar RLS en audit_logs por seguridad
alter table public.audit_logs enable row level security;

-- Permitir a usuarios autenticados leer los historiales
drop policy if exists audit_logs_read_auth on public.audit_logs;
create policy audit_logs_read_auth on public.audit_logs
  for select using (auth.uid() is not null);

-- Permitir a usuarios autenticados insertar logs
drop policy if exists audit_logs_insert_auth on public.audit_logs;
create policy audit_logs_insert_auth on public.audit_logs
  for insert with check (auth.uid() is not null);
