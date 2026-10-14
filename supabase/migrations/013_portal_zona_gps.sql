-- =============================================================================
-- NEXOTIME · 013 · Portal del empleado: GPS real y zona permitida
-- =============================================================================
-- Desde el celular solo se puede checar con la ubicación real del teléfono y cerca de la sucursal.
--
-- Qué hace:
--   • Cada checada del portal exige la ubicación del GPS del teléfono con precisión de 100 m o mejor.
--     Sin ubicación, o con una aproximada (la que adivina una PC o un teléfono sin GPS), no se registra.
--   • Mide la distancia al punto de la sucursal del empleado (Sucursales → editar). Si está fuera del
--     radio permitido (150 m por defecto, contando el margen de error del GPS):
--       - "block" (por defecto): no se registra y se le dice a qué distancia está.
--       - "flag": se registra, marcada "Fuera de zona" para que el administrador la revise.
--       - "off": no se revisa la zona (la ubicación real se guarda igual).
--     Se configura en Configuración → Portal de empleados (attendance_settings.portalZone).
--   • Nueva columna employees.remote_punch: «Puede checar desde cualquier lugar» (home office,
--     vendedores, choferes). A ellos no se les revisa la zona, pero su ubicación real se guarda igual.
--   • Cada movimiento guarda la distancia a la sucursal, para verla en Registro de checadas.
--
-- El reloj checador (tablets fijas) no cambia: sigue usando el punto fijo de su sucursal.
-- Si una sucursal no tiene punto todavía, no hay con qué medir: se registra con la ubicación real.
-- Es seguro repetirla.
-- =============================================================================

begin;

alter table public.employees
  add column if not exists remote_punch boolean not null default false;

comment on column public.employees.remote_punch is
  'Puede checar desde el portal del empleado en cualquier lugar (sin revisar la zona de su sucursal).';

-- -----------------------------------------------------------------------------
-- Checar (reemplaza a la de 010): igual, más ubicación obligatoria y zona permitida
-- -----------------------------------------------------------------------------
create or replace function public.employee_portal_punch(p_token text, p_record jsonb, p_photo jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s public.employee_portal_sessions%rowtype := public.employee_portal_session(p_token);
  v_company public.companies%rowtype;
  v_employee public.employees%rowtype;
  v_local timestamp;
  r public.attendance_records%rowtype;
  previous public.attendance_records%rowtype;
  v_prev jsonb := '[]'::jsonb;
  v_added jsonb;
  v_new jsonb;
  v_type text;
  v_clean jsonb;
  v_minutes integer;
  v_now_minutes integer;
  v_photo_id uuid;
  v_captured timestamptz := now();
  v_data text;
  v_jpeg bytea;
  v_width integer;
  v_height integer;
  v_lat numeric;
  v_lng numeric;
  v_accuracy numeric;
  v_branch public.branches%rowtype;
  v_rule text;
  v_radius integer;
  v_distance numeric;
  v_outside boolean := false;
  v_saved public.attendance_records%rowtype;
  v_first_min integer;
  v_last_min integer;
  v_worked integer;
  v_overtime integer;
  v_late integer;
begin
  select * into v_company from public.companies c where c.id = s.company_id;
  select * into v_employee from public.employees e where e.id = s.employee_id;
  v_local := public.portal_local_now(v_company.timezone);

  if jsonb_typeof(p_record) is distinct from 'object'
     or jsonb_typeof(p_record -> 'punches') is distinct from 'array' then
    raise exception 'El registro no es válido.';
  end if;
  r := jsonb_populate_record(null::public.attendance_records, p_record);

  if r.date is distinct from v_local::date then
    raise exception 'La fecha de tu equipo no coincide con la de la empresa. Actualiza la página e inténtalo de nuevo.'
      using errcode = 'NX409';
  end if;

  -- De quién es y dónde cae lo decide el servidor, no el teléfono.
  r.company_id := s.company_id;
  r.employee_id := s.employee_id;
  r.branch_id := v_employee.branch_id;
  r.schedule_id := v_employee.schedule_id;

  -- Un solo guardado a la vez por empleado y día (reloj checador y teléfono incluidos).
  perform pg_advisory_xact_lock(hashtextextended(r.employee_id::text || ':' || r.date::text, 0));
  select * into previous
  from public.attendance_records a
  where a.employee_id = r.employee_id and a.date = r.date
  for update;
  if found then
    r.id := previous.id;
    r.note := previous.note;
    v_prev := previous.punches;
    if not (r.punches @> v_prev) then
      raise exception 'Tu día tiene movimientos más recientes. Actualiza la página e inténtalo de nuevo.'
        using errcode = 'NX409';
    end if;
  else
    r.id := gen_random_uuid();
    r.note := null;
  end if;

  if jsonb_array_length(r.punches) not between 1 and 4
     or exists (
       select 1 from jsonb_array_elements(r.punches) p
       where jsonb_typeof(p) is distinct from 'object'
          or coalesce(p ->> 'type', '') not in ('entry', 'lunch_out', 'lunch_in', 'exit')
          or coalesce(p ->> 'time', '') !~ '^([01]\d|2[0-3]):[0-5]\d$'
     )
     or (select count(distinct p ->> 'type') from jsonb_array_elements(r.punches) p)
        <> jsonb_array_length(r.punches) then
    raise exception 'Los movimientos del día no son válidos.';
  end if;

  select jsonb_agg(p) into v_added
  from jsonb_array_elements(r.punches) p
  where not (v_prev @> jsonb_build_array(p));
  if v_added is null or jsonb_array_length(v_added) <> 1 then
    raise exception 'Registra un movimiento a la vez.';
  end if;
  v_new := v_added -> 0;
  v_type := v_new ->> 'type';

  if exists (select 1 from jsonb_array_elements(v_prev) q where q ->> 'type' = v_type) then
    raise exception 'Ese movimiento ya está registrado hoy.';
  end if;
  if v_type <> 'entry'
     and not exists (select 1 from jsonb_array_elements(v_prev) q where q ->> 'type' = 'entry') then
    raise exception 'Primero registra tu entrada.';
  end if;
  if v_type = 'lunch_in'
     and not exists (select 1 from jsonb_array_elements(v_prev) q where q ->> 'type' = 'lunch_out') then
    raise exception 'No puedes regresar de comida sin haber salido a comer.';
  end if;
  if v_type = 'lunch_out'
     and exists (select 1 from jsonb_array_elements(v_prev) q where q ->> 'type' = 'exit') then
    raise exception 'Ya registraste tu salida del día.';
  end if;
  if v_type = 'exit'
     and exists (select 1 from jsonb_array_elements(v_prev) q where q ->> 'type' = 'lunch_out')
     and not exists (select 1 from jsonb_array_elements(v_prev) q where q ->> 'type' = 'lunch_in') then
    raise exception 'Estás en comida: registra primero tu regreso.';
  end if;

  v_minutes := split_part(v_new ->> 'time', ':', 1)::integer * 60 + split_part(v_new ->> 'time', ':', 2)::integer;
  v_now_minutes := extract(hour from v_local)::integer * 60 + extract(minute from v_local)::integer;
  if abs(v_minutes - v_now_minutes) > 5 then
    raise exception 'La hora de tu equipo no coincide con la de la empresa. Actualiza la página e inténtalo de nuevo.'
      using errcode = 'NX409';
  end if;

  -- Ubicación: obligatoria, del GPS del teléfono y precisa. Una PC o un teléfono sin GPS solo
  -- adivinan dónde están; con eso cualquiera podría checar desde su casa.
  begin
    v_lat := (v_new -> 'location' ->> 'lat')::numeric;
    v_lng := (v_new -> 'location' ->> 'lng')::numeric;
    v_accuracy := case when (v_new -> 'location' ->> 'accuracy') ~ '^\d+(\.\d+)?$'
                       then (v_new -> 'location' ->> 'accuracy')::numeric end;
  exception when others then
    v_lat := null;
    v_lng := null;
    v_accuracy := null;
  end;
  if v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
    raise exception 'Activa la ubicación (GPS) de tu celular y permite que esta página la use para poder checar.'
      using errcode = 'NX412';
  end if;
  if v_accuracy is null or v_accuracy > 100 then
    raise exception 'Tu ubicación todavía no es precisa. Activa el GPS, sal a un lugar abierto o acércate a una ventana y espera unos segundos.'
      using errcode = 'NX412';
  end if;

  -- Zona permitida alrededor del punto de su sucursal (Configuración → Portal de empleados).
  select * into v_branch from public.branches b where b.id = v_employee.branch_id;
  v_rule := coalesce(v_company.attendance_settings -> 'portalZone' ->> 'outsideZone', 'block');
  if v_rule not in ('block', 'flag', 'off') then
    v_rule := 'block';
  end if;
  v_radius := 150;
  if (v_company.attendance_settings -> 'portalZone' ->> 'radiusMeters') ~ '^\d{1,5}$' then
    v_radius := least(greatest((v_company.attendance_settings -> 'portalZone' ->> 'radiusMeters')::integer, 50), 5000);
  end if;
  if v_branch.lat is not null and v_branch.lng is not null then
    v_distance := round((2 * 6371000 * asin(sqrt(
      power(sin(radians(v_lat::double precision - v_branch.lat) / 2), 2)
      + cos(radians(v_branch.lat)) * cos(radians(v_lat::double precision))
        * power(sin(radians(v_lng::double precision - v_branch.lng) / 2), 2)
    )))::numeric);
  end if;
  -- Fuera es fuera aun contando el margen de error del GPS. Sin punto de sucursal no hay con qué medir.
  if v_rule <> 'off'
     and v_distance is not null
     and not coalesce(v_employee.remote_punch, false)
     and v_distance - v_accuracy > v_radius then
    if v_rule = 'block' then
      raise exception '%', format(
        'Estás a %s de tu sucursal (%s). Para checar desde el celular debes estar a menos de %s m de ella.',
        case when v_distance < 1000 then v_distance::text || ' m' else round(v_distance / 1000, 1)::text || ' km' end,
        v_branch.name,
        v_radius
      ) using errcode = 'NX403';
    end if;
    v_outside := true;
  end if;

  -- Foto: obligatoria, tomada en este momento, JPEG real y del tamaño permitido.
  if jsonb_typeof(p_photo) is distinct from 'object' then
    raise exception 'Falta la foto de verificación.';
  end if;
  begin
    v_photo_id := (p_photo ->> 'id')::uuid;
    v_width := (p_photo ->> 'width')::integer;
    v_height := (p_photo ->> 'height')::integer;
  exception when others then
    raise exception 'La foto no es válida. Tómala de nuevo.';
  end;
  v_data := p_photo ->> 'dataUrl';
  if v_photo_id is null
     or (v_new -> 'photoEvidence' ->> 'id') is distinct from v_photo_id::text
     or v_width is null or v_height is null
     or v_width not between 160 and 640 or v_height not between 120 and 640
     or v_data is null or length(v_data) not between 200 and 180000
     or v_data !~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]+={0,2}$' then
    raise exception 'La foto no es válida. Tómala de nuevo.';
  end if;
  v_jpeg := decode(split_part(v_data, ',', 2), 'base64');
  if octet_length(v_jpeg) < 100
     or substring(v_jpeg from 1 for 2) <> decode('ffd8', 'hex')
     or substring(v_jpeg from octet_length(v_jpeg) - 1 for 2) <> decode('ffd9', 'hex') then
    raise exception 'La foto no es válida. Tómala de nuevo.';
  end if;
  if exists (select 1 from public.attendance_photos f where f.id = v_photo_id) then
    raise exception 'Esa foto ya se usó. Tómala de nuevo.';
  end if;

  insert into public.attendance_photos (id, company_id, employee_id, attendance_date, captured_at, width, height, data_url)
  values (v_photo_id, r.company_id, r.employee_id, r.date, v_captured, v_width, v_height, v_data);

  -- El movimiento se vuelve a armar aquí: nada que el teléfono añada de más se guarda.
  v_clean := jsonb_build_object(
    'type', v_type,
    'time', v_new ->> 'time',
    'method', 'app',
    'photoEvidence', jsonb_build_object('id', v_photo_id, 'capturedAt', v_captured)
  );
  v_clean := v_clean || jsonb_build_object('location', jsonb_strip_nulls(jsonb_build_object(
    'lat', v_lat,
    'lng', v_lng,
    'accuracy', round(v_accuracy),
    'source', 'gps',
    'distance', v_distance,
    'outside', case when v_outside then true end
  )));

  select jsonb_agg(p order by p ->> 'time') into r.punches
  from jsonb_array_elements(v_prev || jsonb_build_array(v_clean)) p;

  -- Topes a lo que calculó el teléfono (el servidor no tiene las reglas de horario, pero sí sabe qué es posible).
  select min(split_part(p ->> 'time', ':', 1)::integer * 60 + split_part(p ->> 'time', ':', 2)::integer),
         max(split_part(p ->> 'time', ':', 1)::integer * 60 + split_part(p ->> 'time', ':', 2)::integer)
    into v_first_min, v_last_min
  from jsonb_array_elements(r.punches) p;
  v_worked := least(greatest(coalesce(r.worked_minutes, 0), 0), 1440, greatest(v_last_min - v_first_min, 0));
  v_overtime := least(greatest(coalesce(r.overtime_minutes, 0), 0), 1440, v_worked);
  v_late := least(greatest(coalesce(r.late_minutes, 0), 0), 1440, coalesce(
    (select split_part(p ->> 'time', ':', 1)::integer * 60 + split_part(p ->> 'time', ':', 2)::integer
       from jsonb_array_elements(r.punches) p where p ->> 'type' = 'entry' limit 1), 1440));

  insert into public.attendance_records (
    id, company_id, branch_id, employee_id, date, schedule_id, punches,
    status, worked_minutes, scheduled_minutes, late_minutes, overtime_minutes, missing_minutes, note
  )
  values (
    r.id, r.company_id, r.branch_id, r.employee_id, r.date, r.schedule_id, r.punches,
    case when r.status in ('present', 'late', 'absent', 'incomplete', 'overtime', 'rest') then r.status else 'present' end,
    v_worked,
    least(greatest(coalesce(r.scheduled_minutes, 0), 0), 1440),
    v_late,
    v_overtime,
    least(greatest(coalesce(r.missing_minutes, 0), 0), 1440),
    r.note
  )
  on conflict (employee_id, date) do update set
    punches = excluded.punches,
    status = excluded.status,
    worked_minutes = excluded.worked_minutes,
    scheduled_minutes = excluded.scheduled_minutes,
    late_minutes = excluded.late_minutes,
    overtime_minutes = excluded.overtime_minutes,
    missing_minutes = excluded.missing_minutes,
    updated_at = now()
  returning * into v_saved;

  return to_jsonb(v_saved);
end;
$$;

revoke all on function public.employee_portal_punch(text, jsonb, jsonb) from public;
grant execute on function public.employee_portal_punch(text, jsonb, jsonb) to anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación de instalación (no muestra datos personales).
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'employees' and column_name = 'remote_punch') as columna_checar_en_cualquier_lugar,
  to_regprocedure('public.employee_portal_punch(text,jsonb,jsonb)') as funcion_checar;
