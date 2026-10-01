-- =============================================================================
-- NEXOTIME · 006 · Integración con Google Drive (respaldo diario de asistencia)
-- =============================================================================
-- Cada empresa puede conectar su propia cuenta de Google Drive desde
-- Configuración → Integraciones. Un trabajo programado (ver
-- supabase/functions/daily-google-drive-export y supabase/README.md) sube ahí,
-- una vez al día, un CSV con la asistencia del día anterior.
--
-- El refresh_token de Google es un secreto de verdad: esta tabla NO tiene
-- políticas de lectura/escritura para "authenticated" ni "anon", así que ni
-- siquiera el dueño de la empresa puede leerlo desde el navegador. Solo lo
-- toca la service_role, usada exclusivamente dentro de las Edge Functions.
-- El navegador solo ve el estado (conectado o no, con qué correo) a través
-- de la función get_google_drive_status() de abajo.
--
-- Ejecuta DESPUÉS de schema.sql, 002, 003, 004 y 005. Es seguro repetirla.
-- =============================================================================

create table if not exists public.integrations_google_drive (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies (id) on delete cascade,
  connected_email text not null,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  folder_id text,
  last_export_at timestamptz,
  last_export_status text check (last_export_status in ('ok', 'error')),
  last_export_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.integrations_google_drive enable row level security;
-- A propósito: ninguna política para authenticated/anon. Solo la service_role
-- (que ignora RLS) puede leer o escribir esta tabla directamente.

-- Lo único que el panel de Configuración necesita saber, sin exponer tokens.
create or replace function public.get_google_drive_status()
returns table (
  connected boolean,
  connected_email text,
  last_export_at timestamptz,
  last_export_status text,
  last_export_error text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    true,
    g.connected_email,
    g.last_export_at,
    g.last_export_status,
    g.last_export_error
  from public.integrations_google_drive g
  where g.company_id = public.current_company_id()
  union all
  select false, null, null, null, null
  where not exists (
    select 1 from public.integrations_google_drive g2
    where g2.company_id = public.current_company_id()
  )
  limit 1;
$$;

grant execute on function public.get_google_drive_status() to authenticated;

-- Desconectar: solo propietario o administrador.
create or replace function public.disconnect_google_drive()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role() not in ('owner', 'admin') then
    raise exception 'Solo el propietario o un administrador pueden desconectar Google Drive.';
  end if;
  delete from public.integrations_google_drive where company_id = public.current_company_id();
end;
$$;

grant execute on function public.disconnect_google_drive() to authenticated;
