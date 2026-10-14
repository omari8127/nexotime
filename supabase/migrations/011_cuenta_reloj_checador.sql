-- =============================================================================
-- NEXOTIME · 011 · Cuenta dedicada para la tablet del reloj checador (rol "kiosk")
-- =============================================================================
-- Problema: la tablet del reloj necesita una sesión abierta para leer al personal y
-- guardar las checadas. Si esa sesión es la de un administrador, cualquiera que tome
-- la tablet tiene los permisos de un administrador.
--
-- Solución: un rol nuevo, "kiosk", que solo puede hacer lo que hace el reloj:
--
--   PUEDE                                          NO PUEDE
--   ─────────────────────────────────────────      ──────────────────────────────────
--   leer empresa, sucursales, horarios,            crear, editar o borrar empleados
--     empleados (de su alcance) y asistencia       cambiar horarios, sucursales, ajustes
--   agregar checadas del reloj (rostro, QR,        corregir o borrar checadas (ni propias)
--     código de barras, número/PIN) de los         agregar checadas "manuales"/editadas
--     últimos 7 días                               ver auditoría, usuarios o dispositivos
--   guardar la foto de cada checada                crear incidencias ni correcciones
--   registrar rechazos faciales en auditoría       entrar a ninguna pantalla del panel
--
-- La mayor parte ya sale de las reglas existentes (is_manager / is_staff no incluyen al
-- rol nuevo). Esta migración solo agrega lo que faltaba:
--   1. el rol en profiles;
--   2. un guardia en las checadas: solo métodos del reloj, no ediciones, sin pasarse de fecha;
--   3. que admin_create_profile() acepte el rol nuevo.
--
-- Ejecuta DESPUÉS de schema.sql, 002 a 010 y supabase/patches/NX01_fotos_entrada.sql.
-- Es seguro repetirla.
-- =============================================================================

begin;

-- 1. El rol -------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner', 'admin', 'hr', 'supervisor', 'employee', 'kiosk'));

-- 2. Guardia de las checadas (reemplaza a la de 002; todo lo anterior se conserva) ---
create or replace function public.guard_attendance_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  caller_role text := public.current_role();
  v_old jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or caller_role in ('owner', 'admin', 'hr') then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_old := old.punches;
  else
    -- La app guarda con "insert … on conflict do update": este disparador corre como INSERT aunque el
    -- día ya exista. Lo ya guardado (de otro reloj, del teléfono o de RH) no cuenta como movimiento nuevo.
    select a.punches into v_old
    from public.attendance_records a
    where a.employee_id = new.employee_id and a.date = new.date;
    v_old := coalesce(v_old, '[]'::jsonb);
  end if;

  if caller_role = 'employee' then
    if new.employee_id is distinct from public.current_employee_id() then
      raise exception 'Solo puedes registrar tu propia asistencia';
    end if;
    if new.date < current_date - 1 or new.date > current_date + 1 then
      raise exception 'Solo puedes registrar asistencia de hoy';
    end if;
  end if;

  if caller_role = 'kiosk' then
    -- Un reloj sin conexión puede subir varios días de golpe, pero no el pasado lejano ni el futuro.
    if new.date < current_date - 7 or new.date > current_date + 1 then
      raise exception 'El reloj solo puede registrar asistencia de los últimos 7 días';
    end if;
    -- Todo movimiento nuevo debe venir de un método del reloj: nunca una captura manual ni editada.
    if exists (
      select 1
      from jsonb_array_elements(new.punches) p
      where not (v_old @> jsonb_build_array(p))
        and (
          coalesce(p ->> 'method', '') not in ('face', 'qr', 'barcode', 'employee_number', 'pin')
          or coalesce(p ->> 'edited', 'false') not in ('false', 'null', '')
        )
    ) then
      raise exception 'El reloj solo puede agregar checadas hechas en el reloj; las correcciones las hace el personal autorizado';
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

-- 3. Alta de usuarios: acepta el rol nuevo (solo propietario / administrador) ----------
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
  if p_role not in ('owner', 'admin', 'hr', 'supervisor', 'employee', 'kiosk') then
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
    coalesce(p_branch_ids, '{}'),
    case when p_role = 'supervisor' then coalesce(p_departments, '{}') else '{}' end
  );
end;
$$;

revoke all on function public.admin_create_profile(uuid, text, text, text, uuid, uuid[], text[]) from public;
grant execute on function public.admin_create_profile(uuid, text, text, text, uuid, uuid[], text[]) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación (no muestra datos personales).
select
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'profiles_role_check') as roles_permitidos,
  (select count(*) from public.profiles where role = 'kiosk') as cuentas_reloj;
