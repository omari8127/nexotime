-- =============================================================================
-- NEXOTIME — esquema de base de datos (Supabase / Postgres)
-- =============================================================================
-- Cómo usarlo:
--   1. Entra a tu proyecto en https://supabase.com/dashboard
--   2. Ve a "SQL Editor" → "New query"
--   3. Pega TODO este archivo y dale "Run"
--   4. En "Authentication" → "Providers" → Email, deja activado "Email" y
--      (para que el alta de empresas sea instantánea en tus demos de venta)
--      desactiva "Confirm email" — si lo dejas activado, cada empresa nueva
--      tendrá que confirmar su correo antes de poder entrar.
--   5. DESPUÉS corre también migrations/002_roles_correcciones.sql (roles,
--      solicitudes de corrección, incidencias con estado y seguridad por rol).
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Empresas (tenants)
-- -----------------------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text not null default '',
  rfc text not null default '',
  industry text not null default '',
  timezone text not null default 'America/Mexico_City',
  weekly_target_hours numeric not null default 40,
  attendance_settings jsonb not null default '{
    "entryToleranceMinutes": 10,
    "absenceThresholdMinutes": 120,
    "allowEarlyLeave": false,
    "trackLunch": true,
    "allowMultipleEntries": false,
    "overtimeThresholdMinutes": 15,
    "roundingMinutes": 1
  }'::jsonb,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Perfiles (usuarios del panel) — 1:1 con auth.users
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'admin' check (role in ('owner', 'admin', 'hr', 'supervisor')),
  branch_ids uuid[] not null default '{}',
  active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists profiles_company_id_idx on public.profiles (company_id);

-- -----------------------------------------------------------------------------
-- Sucursales
-- -----------------------------------------------------------------------------
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  code text not null default '',
  address text not null default '',
  city text not null default '',
  timezone text not null default 'America/Mexico_City',
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists branches_company_id_idx on public.branches (company_id);

-- -----------------------------------------------------------------------------
-- Horarios
-- -----------------------------------------------------------------------------
create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  description text,
  days jsonb not null default '[]'::jsonb,
  weekly_target_hours numeric not null default 40,
  color text not null default '#2554eb',
  created_at timestamptz not null default now()
);

create index if not exists schedules_company_id_idx on public.schedules (company_id);

-- -----------------------------------------------------------------------------
-- Empleados
-- -----------------------------------------------------------------------------
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  branch_id uuid not null references public.branches (id),
  employee_number text not null,
  first_name text not null,
  last_name_paternal text not null,
  last_name_maternal text,
  full_name text not null,
  position text not null default '',
  department text not null default '',
  email text,
  phone text,
  photo_url text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  hire_date date not null default current_date,
  schedule_id uuid not null references public.schedules (id),
  identifications jsonb not null default '[]'::jsonb,
  pin text,
  curp text,
  address text,
  emergency_contact jsonb,
  created_at timestamptz not null default now(),
  unique (company_id, employee_number)
);

create index if not exists employees_company_id_idx on public.employees (company_id);
create index if not exists employees_branch_id_idx on public.employees (branch_id);

-- -----------------------------------------------------------------------------
-- Asistencia
-- -----------------------------------------------------------------------------
create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  branch_id uuid not null references public.branches (id),
  employee_id uuid not null references public.employees (id) on delete cascade,
  date date not null,
  schedule_id uuid not null references public.schedules (id),
  punches jsonb not null default '[]'::jsonb,
  status text not null default 'present',
  worked_minutes integer not null default 0,
  scheduled_minutes integer not null default 0,
  late_minutes integer not null default 0,
  overtime_minutes integer not null default 0,
  missing_minutes integer not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, date)
);

create index if not exists attendance_company_id_idx on public.attendance_records (company_id);
create index if not exists attendance_employee_date_idx on public.attendance_records (employee_id, date);
create index if not exists attendance_date_idx on public.attendance_records (company_id, date);

-- -----------------------------------------------------------------------------
-- Dispositivos (relojes checadores)
-- -----------------------------------------------------------------------------
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  branch_id uuid not null references public.branches (id),
  name text not null,
  type text not null default 'tablet' check (type in ('tablet', 'pc', 'terminal', 'mobile')),
  platform text not null default '',
  status text not null default 'online' check (status in ('online', 'offline', 'inactive')),
  last_seen_at timestamptz not null default now(),
  pairing_code text not null default '',
  enabled_methods jsonb not null default '["qr","barcode","employee_number","pin"]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists devices_company_id_idx on public.devices (company_id);

-- -----------------------------------------------------------------------------
-- Incidencias (vacaciones, permisos, incapacidades)
-- -----------------------------------------------------------------------------
create table if not exists public.incidencias (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  type text not null check (type in ('vacaciones', 'permiso_con_goce', 'permiso_sin_goce', 'incapacidad')),
  from_date date not null,
  to_date date not null,
  reason text,
  requested_by_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists incidencias_company_id_idx on public.incidencias (company_id);

-- -----------------------------------------------------------------------------
-- Auditoría
-- -----------------------------------------------------------------------------
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  actor_id uuid,
  actor_name text not null,
  actor_role text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  entity_label text not null,
  reason text,
  changes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_company_id_idx on public.audit_log (company_id);

-- =============================================================================
-- Seguridad por fila (RLS) — cada empresa solo ve y escribe sus propios datos
-- =============================================================================

create or replace function public.current_company_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.branches enable row level security;
alter table public.schedules enable row level security;
alter table public.employees enable row level security;
alter table public.attendance_records enable row level security;
alter table public.devices enable row level security;
alter table public.incidencias enable row level security;
alter table public.audit_log enable row level security;

-- companies: cualquier miembro de la empresa puede leer/actualizar la suya
drop policy if exists "companies_select" on public.companies;
create policy "companies_select" on public.companies
  for select using (id = public.current_company_id());

drop policy if exists "companies_update" on public.companies;
create policy "companies_update" on public.companies
  for update using (id = public.current_company_id());

-- profiles: ver a los compañeros de la misma empresa; cada quien edita su fila
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (company_id = public.current_company_id());

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update using (id = auth.uid());

-- resto de tablas: aislar 100% por company_id (lectura y escritura)
drop policy if exists "branches_all" on public.branches;
create policy "branches_all" on public.branches
  for all using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "schedules_all" on public.schedules;
create policy "schedules_all" on public.schedules
  for all using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "employees_all" on public.employees;
create policy "employees_all" on public.employees
  for all using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "attendance_all" on public.attendance_records;
create policy "attendance_all" on public.attendance_records
  for all using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "devices_all" on public.devices;
create policy "devices_all" on public.devices
  for all using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "incidencias_all" on public.incidencias;
create policy "incidencias_all" on public.incidencias
  for all using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists "audit_select" on public.audit_log;
create policy "audit_select" on public.audit_log
  for select using (company_id = public.current_company_id());

drop policy if exists "audit_insert" on public.audit_log;
create policy "audit_insert" on public.audit_log
  for insert with check (company_id = public.current_company_id());

-- =============================================================================
-- Alta de empresa nueva (auto-registro)
-- -----------------------------------------------------------------------------
-- Se llama justo después de supabase.auth.signUp(), ya con sesión activa.
-- Corre con privilegios elevados (security definer) para poder crear la
-- primera fila de company + profile antes de que exista RLS que lo permita.
-- =============================================================================
create or replace function public.create_company_and_owner(
  company_name text,
  owner_name text,
  owner_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No hay sesión activa';
  end if;

  insert into public.companies (name, legal_name)
  values (company_name, company_name)
  returning id into new_company_id;

  insert into public.profiles (id, company_id, name, email, role)
  values (auth.uid(), new_company_id, owner_name, owner_email, 'owner');

  return new_company_id;
end;
$$;
