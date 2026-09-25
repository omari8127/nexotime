-- =============================================================================
-- NEXOTIME · 003 · Datos biométricos: solo propietario/administrador
-- =============================================================================
-- La app ya oculta el registro de rostros a quien no sea propietario o
-- administrador. Esta migración lo exige TAMBIÉN en la base de datos, para que
-- nadie (RRHH, un supervisor, ni una llamada directa a la API) pueda crear,
-- cambiar o borrar la plantilla facial de un empleado.
--
-- Qué se protege: la lista de vectores ("descriptors") del método 'face' dentro
-- de employees.identifications. Editar cualquier otro dato del empleado sigue
-- permitido a RRHH como antes.
--
-- Ejecuta DESPUÉS de schema.sql y 002_roles_correcciones.sql. Es seguro repetirla.
-- =============================================================================

-- Vectores faciales guardados en una lista de identificaciones (o NULL si no hay).
create or replace function public.face_descriptors(ids jsonb)
returns jsonb
language sql immutable
as $$
  select e -> 'descriptors'
  from jsonb_array_elements(coalesce(ids, '[]'::jsonb)) as e
  where e ->> 'method' = 'face'
  limit 1
$$;

create or replace function public.guard_biometric_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  before_desc jsonb;
  after_desc  jsonb := public.face_descriptors(new.identifications);
begin
  if tg_op = 'UPDATE' then
    before_desc := public.face_descriptors(old.identifications);
  end if;

  -- Migraciones y service role (sin usuario) pasan.
  if auth.uid() is null then
    return new;
  end if;

  if before_desc is distinct from after_desc
     and coalesce(public.current_role(), '') not in ('owner', 'admin') then
    raise exception 'Solo el propietario o un administrador puede registrar, actualizar o eliminar datos biométricos';
  end if;
  return new;
end;
$$;

drop trigger if exists employees_biometric_guard on public.employees;
create trigger employees_biometric_guard
  before insert or update on public.employees
  for each row execute function public.guard_biometric_write();

-- -----------------------------------------------------------------------------
-- Comprobación rápida (opcional), como usuario RRHH desde el SQL Editor con
-- "Run as user":  update public.employees set identifications = '[]' where ...
-- debe fallar con el mensaje de arriba si ese empleado tenía un rostro guardado.
-- -----------------------------------------------------------------------------
