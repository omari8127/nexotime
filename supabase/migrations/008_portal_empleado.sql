-- =============================================================================
-- NEXOTIME · 008 · Portal del empleado (entrar con número de empleado + PIN)
-- =============================================================================
-- Qué permite:
--   • Cada empleado entra desde su celular en /empleado con el código de su
--     empresa, su número de empleado y su PIN (el mismo del reloj checador).
--     No necesita correo ni cuenta de usuario.
--   • Desde ahí registra entrada, comida y salida. Cada movimiento exige una
--     foto tomada en ese momento, que queda guardada para que la administración
--     compruebe que fue esa persona (Asistencia → Registro de checadas).
--   • Pide vacaciones: la solicitud nace "pendiente" y la administración la
--     aprueba o la rechaza desde el panel.
--
-- Cómo está protegido:
--   • El empleado NO tiene sesión de Supabase: todo pasa por las funciones de
--     abajo, que comprueban el PIN, entregan una llave de sesión (se guarda solo
--     su huella, nunca la llave) y a partir de ahí solo dejan ver y escribir lo
--     de ESE empleado.
--   • 5 intentos fallidos bloquean ese número de empleado 15 minutos.
--   • La hora de cada movimiento se compara con la del servidor: nadie puede
--     checar "a otra hora" cambiando el reloj de su teléfono.
--   • La empresa puede apagar el portal (Configuración → Portal de empleados).
--
-- Ejecuta DESPUÉS de schema.sql, 002 a 007 y supabase/patches/NX01_fotos_entrada.sql.
-- Es seguro repetirla.
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.attendance_photos') is null then
    raise exception 'Falta la tabla de fotos: ejecuta primero supabase/patches/NX01_fotos_entrada.sql';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Empresa: código del portal e interruptor
-- -----------------------------------------------------------------------------
-- 8 caracteres sin 0/O/1/I (se dictan por teléfono y se teclean a mano).
create or replace function public.new_portal_code()
returns text
language sql volatile set search_path = ''
as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (get_byte(b, i) % 32) + 1, 1), '')
  from (select decode(replace(gen_random_uuid()::text, '-', ''), 'hex') as b) src,
       unnest(array[0, 1, 2, 3, 4, 5, 10, 11]) as i
$$;

alter table public.companies add column if not exists portal_code text;
alter table public.companies add column if not exists portal_enabled boolean not null default true;

update public.companies set portal_code = public.new_portal_code() where portal_code is null;
alter table public.companies alter column portal_code set default public.new_portal_code();
alter table public.companies alter column portal_code set not null;
create unique index if not exists companies_portal_code_key on public.companies (portal_code);

comment on column public.companies.portal_code is
  'Código que los empleados escriben (o traen en su enlace) para entrar al portal del empleado.';
comment on column public.companies.portal_enabled is
  'Si es false, nadie puede entrar ni checar desde el portal del empleado.';

-- El código no se cambia desde el navegador: los enlaces y QR ya repartidos dejarían de servir.
create or replace function public.guard_portal_code()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and new.portal_code is distinct from old.portal_code then
    raise exception 'El código del portal de empleados no se puede cambiar desde el panel';
  end if;
  return new;
end;
$$;

drop trigger if exists companies_portal_code_guard on public.companies;
create trigger companies_portal_code_guard
  before update on public.companies
  for each row execute function public.guard_portal_code();

-- -----------------------------------------------------------------------------
-- Sesiones e intentos fallidos (solo las funciones de este archivo las tocan)
-- -----------------------------------------------------------------------------
create table if not exists public.employee_portal_sessions (
  token_hash text primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists employee_portal_sessions_employee_idx
  on public.employee_portal_sessions (employee_id);

create table if not exists public.employee_portal_attempts (
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_key text not null,
  failed_count integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (company_id, employee_key)
);

alter table public.employee_portal_sessions enable row level security;
alter table public.employee_portal_attempts enable row level security;
revoke all on public.employee_portal_sessions from public, anon, authenticated;
revoke all on public.employee_portal_attempts from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Funciones de apoyo
-- -----------------------------------------------------------------------------
-- La hora de pared de la empresa. Una zona horaria mal escrita no debe tumbar el portal.
create or replace function public.portal_local_now(p_tz text)
returns timestamp
language plpgsql stable set search_path = ''
as $$
begin
  return now() at time zone p_tz;
exception when others then
  return now() at time zone 'America/Mexico_City';
end;
$$;

-- Devuelve la sesión de esa llave, o falla con NX401 ("vuelve a entrar").
create or replace function public.employee_portal_session(p_token text)
returns public.employee_portal_sessions
language plpgsql stable security definer set search_path = ''
as $$
declare
  s public.employee_portal_sessions%rowtype;
begin
  if p_token is null or length(p_token) <> 64 then
    raise exception 'Tu sesión terminó. Vuelve a entrar.' using errcode = 'NX401';
  end if;
  select * into s
  from public.employee_portal_sessions x
  where x.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    and x.expires_at > now();
  if not found then
    raise exception 'Tu sesión terminó. Vuelve a entrar.' using errcode = 'NX401';
  end if;
  if not exists (
    select 1
    from public.employees e
    join public.companies c on c.id = e.company_id
    where e.id = s.employee_id
      and e.company_id = s.company_id
      and e.status = 'active'
      and c.portal_enabled
  ) then
    raise exception 'Tu acceso al portal ya no está activo. Pregunta en Recursos Humanos.' using errcode = 'NX401';
  end if;
  return s;
end;
$$;

-- -----------------------------------------------------------------------------
-- Entrar: código de empresa + número de empleado + PIN
-- -----------------------------------------------------------------------------
-- Devuelve {ok:false, error} en vez de lanzar un error cuando los datos no
-- coinciden: así el intento fallido SÍ queda contado (un error lo desharía).
create or replace function public.employee_portal_login(
  p_company_code text,
  p_employee_number text,
  p_pin text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_fail constant jsonb := jsonb_build_object(
    'ok', false, 'error', 'Código de empresa, número de empleado o PIN incorrectos.');
  v_company public.companies%rowtype;
  v_key text := lower(btrim(coalesce(p_employee_number, '')));
  v_digits text;
  v_attempt public.employee_portal_attempts%rowtype;
  v_employee public.employees%rowtype;
  v_matches integer;
  v_token text;
  v_expires timestamptz := now() + interval '12 hours';
begin
  if v_key = '' or length(v_key) > 40
     or coalesce(length(p_pin), 0) not between 1 and 12
     or coalesce(length(btrim(p_company_code)), 0) not between 1 and 40 then
    return v_fail;
  end if;

  select * into v_company from public.companies c where c.portal_code = upper(btrim(p_company_code));
  if not found then
    return v_fail;
  end if;
  if not v_company.portal_enabled or v_company.subscription_status = 'canceled' then
    return jsonb_build_object('ok', false, 'error', 'El portal de empleados de esta empresa no está disponible.');
  end if;

  -- Igual que en el reloj checador: el número tal cual ("EMP-007") o solo sus dígitos ("7").
  select count(*) into v_matches
  from public.employees e
  where e.company_id = v_company.id and e.status = 'active' and lower(e.employee_number) = v_key;
  if v_matches = 1 then
    select * into v_employee
    from public.employees e
    where e.company_id = v_company.id and e.status = 'active' and lower(e.employee_number) = v_key;
  elsif v_matches = 0 then
    v_digits := regexp_replace(v_key, '\D', '', 'g');
    if v_digits <> '' and length(v_digits) <= 12 then
      select count(*) into v_matches
      from public.employees e
      where e.company_id = v_company.id and e.status = 'active'
        and regexp_replace(e.employee_number, '\D', '', 'g') ~ '^\d{1,12}$'
        and regexp_replace(e.employee_number, '\D', '', 'g')::numeric = v_digits::numeric;
      if v_matches = 1 then
        select * into v_employee
        from public.employees e
        where e.company_id = v_company.id and e.status = 'active'
          and regexp_replace(e.employee_number, '\D', '', 'g') ~ '^\d{1,12}$'
          and regexp_replace(e.employee_number, '\D', '', 'g')::numeric = v_digits::numeric;
      end if;
    end if;
  end if;

  -- Los intentos se cuentan por EMPLEADO, no por cómo se escribió su número: "7", "007" y
  -- "EMP-007" gastan los mismos 5 intentos.
  if v_matches = 1 then
    v_key := 'id:' || v_employee.id::text;
  else
    v_key := 'n:' || v_key;
  end if;

  delete from public.employee_portal_attempts a
  where a.company_id = v_company.id and a.updated_at < now() - interval '1 day';

  insert into public.employee_portal_attempts (company_id, employee_key)
  values (v_company.id, v_key)
  on conflict (company_id, employee_key) do nothing;
  select * into v_attempt
  from public.employee_portal_attempts a
  where a.company_id = v_company.id and a.employee_key = v_key
  for update;

  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    return jsonb_build_object(
      'ok', false,
      'error', format(
        'Demasiados intentos. Espera %s min e inténtalo de nuevo.',
        greatest(1, ceil(extract(epoch from (v_attempt.locked_until - now())) / 60)::integer)));
  end if;

  if v_matches <> 1 or coalesce(v_employee.pin, '') = '' or v_employee.pin <> p_pin then
    update public.employee_portal_attempts a
    set failed_count = case when a.failed_count + 1 >= 5 then 0 else a.failed_count + 1 end,
        locked_until = case when a.failed_count + 1 >= 5 then now() + interval '15 minutes' else null end,
        updated_at = now()
    where a.company_id = v_company.id and a.employee_key = v_key;
    return v_fail;
  end if;

  delete from public.employee_portal_attempts a
  where a.company_id = v_company.id and a.employee_key = v_key;
  delete from public.employee_portal_sessions s where s.expires_at < now();

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.employee_portal_sessions (token_hash, company_id, employee_id, expires_at)
  values (encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_company.id, v_employee.id, v_expires);

  return jsonb_build_object('ok', true, 'token', v_token, 'expiresAt', v_expires);
end;
$$;

create or replace function public.employee_portal_logout(p_token text)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.employee_portal_sessions s
  where s.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
$$;

-- -----------------------------------------------------------------------------
-- Lo que ve el empleado: sus datos, su horario, sus registros y sus solicitudes
-- -----------------------------------------------------------------------------
create or replace function public.employee_portal_state(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  s public.employee_portal_sessions%rowtype := public.employee_portal_session(p_token);
  v_company public.companies%rowtype;
  v_employee public.employees%rowtype;
  v_today date;
begin
  select * into v_company from public.companies c where c.id = s.company_id;
  select * into v_employee from public.employees e where e.id = s.employee_id;
  v_today := public.portal_local_now(v_company.timezone)::date;

  return jsonb_build_object(
    'serverNow', now(),
    'today', v_today,
    'expiresAt', s.expires_at,
    'company', jsonb_build_object(
      'id', v_company.id,
      'name', v_company.name,
      'timezone', v_company.timezone,
      -- Sin el código que desbloquea la salida del reloj checador.
      'attendance_settings', v_company.attendance_settings #- '{kiosk,exitPin}'
    ),
    -- Sin PIN ni códigos de gafete; solo su propio rostro registrado (para compararlo en su teléfono).
    'employee', (to_jsonb(v_employee) - 'pin' - 'identifications') || jsonb_build_object(
      'identifications', coalesce((
        select jsonb_agg(i)
        from jsonb_array_elements(
          case when jsonb_typeof(v_employee.identifications) = 'array'
               then v_employee.identifications else '[]'::jsonb end) i
        where i ->> 'method' = 'face'
      ), '[]'::jsonb)
    ),
    'branch', (select to_jsonb(b) from public.branches b where b.id = v_employee.branch_id),
    'schedule', (select to_jsonb(sc) from public.schedules sc where sc.id = v_employee.schedule_id),
    'attendance', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.date desc)
      from public.attendance_records a
      where a.employee_id = v_employee.id and a.date >= v_today - 62
    ), '[]'::jsonb),
    'incidencias', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.from_date desc)
      from public.incidencias i
      where i.employee_id = v_employee.id
    ), '[]'::jsonb)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Checar: un movimiento a la vez, con foto y a la hora del servidor
-- -----------------------------------------------------------------------------
-- p_record: el día completo ya calculado por la app (mismas reglas que el reloj
-- checador), con el movimiento nuevo incluido. p_photo: la foto de ese momento.
-- El servidor decide de quién es el registro (el dueño de la llave), en qué día
-- cae y a qué hora: lo que mande el teléfono solo se acepta si coincide.
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
  v_saved public.attendance_records%rowtype;
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
  begin
    v_lat := (v_new -> 'location' ->> 'lat')::numeric;
    v_lng := (v_new -> 'location' ->> 'lng')::numeric;
  exception when others then
    v_lat := null;
    v_lng := null;
  end;
  if v_lat between -90 and 90 and v_lng between -180 and 180 then
    v_clean := v_clean || jsonb_build_object('location', jsonb_strip_nulls(jsonb_build_object(
      'lat', v_lat,
      'lng', v_lng,
      'accuracy', case when (v_new -> 'location' ->> 'accuracy') ~ '^\d+(\.\d+)?$'
                       then round((v_new -> 'location' ->> 'accuracy')::numeric) end
    )));
  end if;

  select jsonb_agg(p order by p ->> 'time') into r.punches
  from jsonb_array_elements(v_prev || jsonb_build_array(v_clean)) p;

  insert into public.attendance_records (
    id, company_id, branch_id, employee_id, date, schedule_id, punches,
    status, worked_minutes, scheduled_minutes, late_minutes, overtime_minutes, missing_minutes, note
  )
  values (
    r.id, r.company_id, r.branch_id, r.employee_id, r.date, r.schedule_id, r.punches,
    case when r.status in ('present', 'late', 'absent', 'incomplete', 'overtime', 'rest') then r.status else 'present' end,
    least(greatest(coalesce(r.worked_minutes, 0), 0), 1440),
    least(greatest(coalesce(r.scheduled_minutes, 0), 0), 1440),
    least(greatest(coalesce(r.late_minutes, 0), 0), 1440),
    least(greatest(coalesce(r.overtime_minutes, 0), 0), 1440),
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

-- -----------------------------------------------------------------------------
-- Vacaciones: el empleado las pide; la administración las aprueba o rechaza
-- -----------------------------------------------------------------------------
create or replace function public.employee_portal_request_vacation(
  p_token text,
  p_from date,
  p_to date,
  p_reason text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s public.employee_portal_sessions%rowtype := public.employee_portal_session(p_token);
  v_today date;
  v_row public.incidencias%rowtype;
begin
  select public.portal_local_now(c.timezone)::date into v_today
  from public.companies c where c.id = s.company_id;

  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Revisa las fechas: el regreso no puede ser antes de la salida.';
  end if;
  if p_from < v_today then
    raise exception 'Las vacaciones deben empezar hoy o después.';
  end if;
  if p_to - p_from > 60 or p_from > v_today + 730 then
    raise exception 'Ese periodo no se puede solicitar desde el portal. Habla con Recursos Humanos.';
  end if;
  if exists (
    select 1 from public.incidencias i
    where i.employee_id = s.employee_id and i.type = 'vacaciones'
      and i.status in ('pending', 'approved')
      and i.from_date <= p_to and i.to_date >= p_from
  ) then
    raise exception 'Ya tienes vacaciones solicitadas o aprobadas en esas fechas.';
  end if;
  if (
    select count(*) from public.incidencias i
    where i.employee_id = s.employee_id and i.type = 'vacaciones' and i.status = 'pending'
  ) >= 5 then
    raise exception 'Tienes varias solicitudes pendientes. Espera a que las revisen.';
  end if;

  insert into public.incidencias (company_id, employee_id, type, from_date, to_date, reason, status)
  values (
    s.company_id, s.employee_id, 'vacaciones', p_from, p_to,
    nullif(left(btrim(coalesce(p_reason, '')), 300), ''), 'pending'
  )
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

-- Solo mientras siga pendiente: una ya revisada no la quita el empleado.
create or replace function public.employee_portal_cancel_vacation(p_token text, p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  s public.employee_portal_sessions%rowtype := public.employee_portal_session(p_token);
begin
  delete from public.incidencias i
  where i.id = p_id and i.employee_id = s.employee_id
    and i.type = 'vacaciones' and i.status = 'pending';
  if not found then
    raise exception 'Esa solicitud ya fue revisada o no existe.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos: el portal se usa SIN sesión (rol anon); la sesión interna no se expone
-- -----------------------------------------------------------------------------
revoke all on function public.employee_portal_session(text) from public, anon, authenticated;
revoke all on function public.guard_portal_code() from public, anon, authenticated;

revoke all on function public.employee_portal_login(text, text, text) from public;
revoke all on function public.employee_portal_logout(text) from public;
revoke all on function public.employee_portal_state(text) from public;
revoke all on function public.employee_portal_punch(text, jsonb, jsonb) from public;
revoke all on function public.employee_portal_request_vacation(text, date, date, text) from public;
revoke all on function public.employee_portal_cancel_vacation(text, uuid) from public;

grant execute on function public.employee_portal_login(text, text, text) to anon, authenticated;
grant execute on function public.employee_portal_logout(text) to anon, authenticated;
grant execute on function public.employee_portal_state(text) to anon, authenticated;
grant execute on function public.employee_portal_punch(text, jsonb, jsonb) to anon, authenticated;
grant execute on function public.employee_portal_request_vacation(text, date, date, text) to anon, authenticated;
grant execute on function public.employee_portal_cancel_vacation(text, uuid) to anon, authenticated;

commit;

-- Para que la API vea las funciones nuevas de inmediato.
notify pgrst, 'reload schema';

-- Comprobación de instalación (no muestra datos personales).
select
  (select count(*) from public.companies where portal_code is not null) as empresas_con_codigo,
  to_regprocedure('public.employee_portal_login(text,text,text)') as funcion_entrar,
  to_regprocedure('public.employee_portal_punch(text,jsonb,jsonb)') as funcion_checar;
