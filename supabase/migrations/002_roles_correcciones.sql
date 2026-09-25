-- =============================================================================
-- NEXOTIME — migración 002: roles, solicitudes de corrección, incidencias con
-- estado y seguridad por rol (RLS)
-- =============================================================================
-- Cómo usarla (después de haber corrido supabase/schema.sql):
--   1. Supabase → SQL Editor → New query
--   2. Pega TODO este archivo y dale "Run". Es seguro correrlo más de una vez.
--
-- Qué hace:
--   • Agrega el rol "employee" (portal "Mi asistencia") y el alcance por
--     departamento de los supervisores.
--   • Incidencias: 12 tipos y estados (pendiente/aprobada/rechazada/corregida).
--   • Tabla nueva de solicitudes de corrección de asistencia.
--   • Reemplaza las políticas "toda la empresa ve todo" por políticas por rol:
--       - un empleado solo ve y registra SU asistencia;
--       - un supervisor solo ve su(s) sucursal(es)/departamento(s) y no puede
--         modificar horas ya registradas;
--       - solo propietario / administrador / RH escriben empleados, horarios,
--         sucursales y dispositivos;
--       - la auditoría es de solo agregar: nadie puede editarla ni borrarla.
--   • Cierra un hueco anterior: cualquier usuario podía editar su propio rol.
--   • Función admin_create_profile(): alta de usuarios desde el panel.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Perfiles: rol empleado + alcance
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists employee_id uuid references public.employees (id) on delete set null;
alter table public.profiles
  add column if not exists departments text[] not null default '{}';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner', 'admin', 'hr', 'supervisor', 'employee'));

-- -----------------------------------------------------------------------------
-- Incidencias: más tipos + estado de aprobación
-- -----------------------------------------------------------------------------
alter table public.incidencias drop constraint if exists incidencias_type_check;
alter table public.incidencias
  add constraint incidencias_type_check
  check (type in (
    'vacaciones', 'permiso_con_goce', 'permiso_sin_goce', 'incapacidad',
    'retardo', 'falta', 'salida_anticipada', 'entrada_olvidada',
    'salida_olvidada', 'comida_excedida', 'hora_extra', 'otra'
  ));

-- Las incidencias que ya existían estaban vigentes: quedan como "approved".
alter table public.incidencias
  add column if not exists status text not null default 'approved';
alter table public.incidencias drop constraint if exists incidencias_status_check;
alter table public.incidencias
  add constraint incidencias_status_check
  check (status in ('pending', 'approved', 'rejected', 'corrected'));
alter table public.incidencias add column if not exists updated_at timestamptz;
alter table public.incidencias add column if not exists reviewed_by_id uuid;
alter table public.incidencias add column if not exists reviewed_by_name text;
alter table public.incidencias add column if not exists review_note text;

-- -----------------------------------------------------------------------------
-- Solicitudes de corrección de asistencia
-- -----------------------------------------------------------------------------
create table if not exists public.correction_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  date date not null,
  punch_type text not null check (punch_type in ('entry', 'lunch_out', 'lunch_in', 'exit')),
  previous_time text,
  requested_time text not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by_id uuid,
  requested_by_name text not null default '',
  created_at timestamptz not null default now(),
  reviewed_by_id uuid,
  reviewed_by_name text,
  reviewed_at timestamptz,
  review_note text
);

create index if not exists correction_requests_company_idx on public.correction_requests (company_id);
create index if not exists correction_requests_employee_idx on public.correction_requests (employee_id, date);

alter table public.correction_requests enable row level security;

-- -----------------------------------------------------------------------------
-- Funciones de apoyo para las políticas
-- -----------------------------------------------------------------------------
create or replace function public.current_employee_id()
returns uuid
language sql security definer stable set search_path = public
as $$ select employee_id from public.profiles where id = auth.uid() and active $$;

-- Propietario / administrador / RH
create or replace function public.is_manager()
returns boolean
language sql security definer stable set search_path = public
as $$
  select coalesce(
    (select role in ('owner', 'admin', 'hr') and active from public.profiles where id = auth.uid()),
    false
  )
$$;

-- Cualquier usuario del panel (todo menos el empleado)
create or replace function public.is_staff()
returns boolean
language sql security definer stable set search_path = public
as $$
  select coalesce(
    (select role in ('owner', 'admin', 'hr', 'supervisor') and active from public.profiles where id = auth.uid()),
    false
  )
$$;

-- ¿Puede el usuario actual ver a este empleado?
--   empleado   → solo a sí mismo
--   resto      → sus sucursales (vacío = todas); un supervisor además sus
--                departamentos (vacío = todos)
create or replace function public.can_see_employee(emp_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1
    from public.employees e
    join public.profiles p on p.id = auth.uid()
    where e.id = emp_id
      and e.company_id = p.company_id
      and p.active
      and case
        when p.role = 'employee' then p.employee_id = e.id
        else (cardinality(p.branch_ids) = 0 or e.branch_id = any (p.branch_ids))
             and (p.role <> 'supervisor'
                  or cardinality(p.departments) = 0
                  or e.department = any (p.departments))
      end
  )
$$;

-- -----------------------------------------------------------------------------
-- Políticas por rol
-- -----------------------------------------------------------------------------

-- companies: todos los miembros leen; solo propietario/administrador editan
drop policy if exists "companies_update" on public.companies;
create policy "companies_update" on public.companies
  for update using (
    id = public.current_company_id() and public.current_role() in ('owner', 'admin')
  );

-- profiles: el personal ve a su equipo; el empleado solo su propia fila
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (
    id = auth.uid()
    or (company_id = public.current_company_id() and public.is_staff())
  );

drop policy if exists "profiles_update_self" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update
  using (
    id = auth.uid()
    or (company_id = public.current_company_id() and public.current_role() in ('owner', 'admin'))
  )
  with check (company_id = public.current_company_id());

-- Nadie puede escalar privilegios editando su propio perfil.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  caller_role text := public.current_role();
begin
  if auth.uid() is null then
    return new; -- migraciones / service role
  end if;

  if new.company_id is distinct from old.company_id then
    raise exception 'No se puede cambiar la empresa de un usuario';
  end if;

  -- Cambios de acceso: solo propietario/administrador, y nunca sobre uno mismo.
  if new.role is distinct from old.role
     or new.employee_id is distinct from old.employee_id
     or new.branch_ids is distinct from old.branch_ids
     or new.departments is distinct from old.departments
     or new.active is distinct from old.active then
    if caller_role not in ('owner', 'admin') then
      raise exception 'Solo el propietario o un administrador puede cambiar permisos';
    end if;
    if new.id = auth.uid() and (new.role is distinct from old.role or new.active is distinct from old.active) then
      raise exception 'No puedes cambiar tu propio rol ni desactivarte';
    end if;
    if (new.role = 'owner' or old.role = 'owner') and new.role is distinct from old.role
       and caller_role <> 'owner' then
      raise exception 'Solo el propietario puede asignar o quitar el rol de propietario';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- branches / schedules / devices: todos leen; solo propietario/admin/RH escriben
drop policy if exists "branches_all" on public.branches;
drop policy if exists "branches_select" on public.branches;
drop policy if exists "branches_insert" on public.branches;
drop policy if exists "branches_update" on public.branches;
drop policy if exists "branches_delete" on public.branches;
create policy "branches_select" on public.branches
  for select using (company_id = public.current_company_id());
create policy "branches_insert" on public.branches
  for insert with check (company_id = public.current_company_id() and public.is_manager());
create policy "branches_update" on public.branches
  for update using (company_id = public.current_company_id() and public.is_manager())
  with check (company_id = public.current_company_id());
create policy "branches_delete" on public.branches
  for delete using (company_id = public.current_company_id() and public.is_manager());

drop policy if exists "schedules_all" on public.schedules;
drop policy if exists "schedules_select" on public.schedules;
drop policy if exists "schedules_insert" on public.schedules;
drop policy if exists "schedules_update" on public.schedules;
drop policy if exists "schedules_delete" on public.schedules;
create policy "schedules_select" on public.schedules
  for select using (company_id = public.current_company_id());
create policy "schedules_insert" on public.schedules
  for insert with check (company_id = public.current_company_id() and public.is_manager());
create policy "schedules_update" on public.schedules
  for update using (company_id = public.current_company_id() and public.is_manager())
  with check (company_id = public.current_company_id());
create policy "schedules_delete" on public.schedules
  for delete using (company_id = public.current_company_id() and public.is_manager());

drop policy if exists "devices_all" on public.devices;
drop policy if exists "devices_select" on public.devices;
drop policy if exists "devices_insert" on public.devices;
drop policy if exists "devices_update" on public.devices;
drop policy if exists "devices_delete" on public.devices;
create policy "devices_select" on public.devices
  for select using (company_id = public.current_company_id() and public.is_staff());
create policy "devices_insert" on public.devices
  for insert with check (company_id = public.current_company_id() and public.is_manager());
create policy "devices_update" on public.devices
  for update using (company_id = public.current_company_id() and public.is_manager())
  with check (company_id = public.current_company_id());
create policy "devices_delete" on public.devices
  for delete using (company_id = public.current_company_id() and public.is_manager());

-- employees: leen según alcance; escriben propietario/admin/RH
drop policy if exists "employees_all" on public.employees;
drop policy if exists "employees_select" on public.employees;
drop policy if exists "employees_insert" on public.employees;
drop policy if exists "employees_update" on public.employees;
drop policy if exists "employees_delete" on public.employees;
create policy "employees_select" on public.employees
  for select using (public.can_see_employee(id));
create policy "employees_insert" on public.employees
  for insert with check (company_id = public.current_company_id() and public.is_manager());
create policy "employees_update" on public.employees
  for update using (company_id = public.current_company_id() and public.is_manager())
  with check (company_id = public.current_company_id());
create policy "employees_delete" on public.employees
  for delete using (company_id = public.current_company_id() and public.is_manager());

-- attendance_records: lectura por alcance; escritura acotada (ver trigger)
drop policy if exists "attendance_all" on public.attendance_records;
drop policy if exists "attendance_select" on public.attendance_records;
drop policy if exists "attendance_insert" on public.attendance_records;
drop policy if exists "attendance_update" on public.attendance_records;
drop policy if exists "attendance_delete" on public.attendance_records;
create policy "attendance_select" on public.attendance_records
  for select using (public.can_see_employee(employee_id));
create policy "attendance_insert" on public.attendance_records
  for insert with check (company_id = public.current_company_id() and public.can_see_employee(employee_id));
create policy "attendance_update" on public.attendance_records
  for update using (public.can_see_employee(employee_id))
  with check (company_id = public.current_company_id() and public.can_see_employee(employee_id));
create policy "attendance_delete" on public.attendance_records
  for delete using (company_id = public.current_company_id() and public.is_manager());

-- Quien no es propietario/admin/RH solo puede AGREGAR movimientos: no puede
-- cambiar ni quitar los que ya existen (eso se hace con una corrección
-- aprobada). El empleado, además, solo escribe el día de hoy y el suyo.
create or replace function public.guard_attendance_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  caller_role text := public.current_role();
begin
  if auth.uid() is null or caller_role in ('owner', 'admin', 'hr') then
    return new;
  end if;

  if caller_role = 'employee' then
    if new.employee_id is distinct from public.current_employee_id() then
      raise exception 'Solo puedes registrar tu propia asistencia';
    end if;
    if new.date < current_date - 1 or new.date > current_date + 1 then
      raise exception 'Solo puedes registrar asistencia de hoy';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.employee_id is distinct from old.employee_id or new.date is distinct from old.date then
      raise exception 'No se puede cambiar el empleado ni la fecha de un registro';
    end if;
    if not (new.punches @> old.punches) then
      raise exception 'No puedes modificar movimientos ya registrados: solicita una corrección';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_guard on public.attendance_records;
create trigger attendance_guard before insert or update on public.attendance_records
  for each row execute function public.guard_attendance_write();

-- incidencias
drop policy if exists "incidencias_all" on public.incidencias;
drop policy if exists "incidencias_select" on public.incidencias;
drop policy if exists "incidencias_insert" on public.incidencias;
drop policy if exists "incidencias_update" on public.incidencias;
drop policy if exists "incidencias_delete" on public.incidencias;
create policy "incidencias_select" on public.incidencias
  for select using (public.can_see_employee(employee_id));
create policy "incidencias_insert" on public.incidencias
  for insert with check (
    company_id = public.current_company_id()
    and public.is_staff()
    and public.can_see_employee(employee_id)
    and (public.is_manager() or status = 'pending') -- las de un supervisor nacen pendientes
  );
create policy "incidencias_update" on public.incidencias
  for update using (
    public.is_staff() and public.can_see_employee(employee_id)
    and (public.is_manager() or requested_by_id is distinct from auth.uid())
  )
  with check (company_id = public.current_company_id());
create policy "incidencias_delete" on public.incidencias
  for delete using (public.is_staff() and public.can_see_employee(employee_id));

-- correction_requests
drop policy if exists "corrections_select" on public.correction_requests;
drop policy if exists "corrections_insert" on public.correction_requests;
drop policy if exists "corrections_update" on public.correction_requests;
create policy "corrections_select" on public.correction_requests
  for select using (public.can_see_employee(employee_id));
create policy "corrections_insert" on public.correction_requests
  for insert with check (
    company_id = public.current_company_id()
    and status = 'pending'
    and requested_by_id = auth.uid()
    and public.can_see_employee(employee_id) -- el empleado solo puede pedir sobre sí mismo
  );
create policy "corrections_update" on public.correction_requests
  for update using (
    public.is_staff() and public.can_see_employee(employee_id)
    and (public.is_manager() or requested_by_id is distinct from auth.uid())
  )
  with check (company_id = public.current_company_id());

-- audit_log: solo propietario/admin/RH la consultan; cualquiera del equipo
-- agrega; NADIE la edita ni la borra (ni siquiera con la llave pública).
drop policy if exists "audit_select" on public.audit_log;
drop policy if exists "audit_insert" on public.audit_log;
create policy "audit_select" on public.audit_log
  for select using (company_id = public.current_company_id() and public.is_manager());
create policy "audit_insert" on public.audit_log
  for insert with check (
    company_id = public.current_company_id()
    and (actor_id is null or actor_id = auth.uid())
  );
revoke update, delete, truncate on public.audit_log from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Alta de usuarios desde el panel (propietario / administrador)
-- -----------------------------------------------------------------------------
-- El navegador crea el acceso con auth.signUp() (en un cliente aparte, sin
-- cerrar la sesión de quien invita) y luego llama a esta función para crear el
-- perfil ligado a la empresa. Solo acepta cuentas recién creadas, para que no
-- se pueda "adoptar" el acceso de un usuario ya existente.
create or replace function public.admin_create_profile(
  p_user_id uuid,
  p_name text,
  p_email text,
  p_role text,
  p_employee_id uuid,
  p_branch_ids uuid[],
  p_departments text[]
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  caller_role text;
  caller_company uuid;
begin
  select role, company_id into caller_role, caller_company
  from public.profiles where id = auth.uid() and active;

  if caller_role is null or caller_role not in ('owner', 'admin') then
    raise exception 'Solo el propietario o un administrador puede crear usuarios';
  end if;
  if p_role not in ('owner', 'admin', 'hr', 'supervisor', 'employee') then
    raise exception 'Rol no válido';
  end if;
  if p_role = 'owner' and caller_role <> 'owner' then
    raise exception 'Solo el propietario puede crear otro propietario';
  end if;
  if p_role = 'employee' then
    if not exists (
      select 1 from public.employees where id = p_employee_id and company_id = caller_company
    ) then
      raise exception 'El empleado no pertenece a tu empresa';
    end if;
  end if;
  if exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Ese usuario ya tiene perfil';
  end if;
  if not exists (
    select 1 from auth.users where id = p_user_id and created_at > now() - interval '15 minutes'
  ) then
    raise exception 'La cuenta no existe o no es reciente';
  end if;

  insert into public.profiles (id, company_id, name, email, role, employee_id, branch_ids, departments)
  values (
    p_user_id, caller_company, p_name, p_email, p_role,
    case when p_role = 'employee' then p_employee_id end,
    coalesce(p_branch_ids, '{}'), coalesce(p_departments, '{}')
  );
end;
$$;

revoke all on function public.admin_create_profile(uuid, text, text, text, uuid, uuid[], text[]) from public;
grant execute on function public.admin_create_profile(uuid, text, text, text, uuid, uuid[], text[]) to authenticated;
