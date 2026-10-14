-- =============================================================================
-- NEXOTIME · 010 · Portal del empleado: bloqueo progresivo y topes a los totales
-- =============================================================================
-- Mejora a 008 (revisión de seguridad):
--
--   1. Bloqueo progresivo. Antes: 5 intentos fallidos = 15 minutos, siempre. Con un
--      PIN de 4 dígitos eso deja probar ~480 PIN por empleado al día. Ahora cada
--      bloqueo seguido dura 4 veces más que el anterior: 15 min, 1 h, 4 h, 16 h y
--      24 h (tope). Si pasa un día sin intentos, se empieza de cero. Un acceso
--      correcto también reinicia el conteo.
--
--   2. Topes a lo que calcula el teléfono. El servidor no recalcula retardos ni
--      horas (las reglas viven en la aplicación), pero ya no acepta totales
--      imposibles para los movimientos del día:
--        • horas trabajadas  ≤ tiempo entre el primer y el último movimiento
--        • horas extra       ≤ horas trabajadas
--        • minutos de retardo ≤ hora de la entrada (no se llega "tarde" de más)
--      y el servidor ya pone en 'present' cualquier estado fuera de catálogo.
--
--   3. La comparación de números de empleado sin letras ya no depende del orden
--      en que Postgres evalúe los filtros.
--
-- Ejecuta DESPUÉS de 008. Es seguro repetirla.
-- =============================================================================

begin;

alter table public.employee_portal_attempts
  add column if not exists lock_count integer not null default 0;

-- -----------------------------------------------------------------------------
-- Entrar (reemplaza a la de 008)
-- -----------------------------------------------------------------------------
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
  v_minutes integer;
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
      -- CASE: la conversión solo se evalúa en números que sí son dígitos (un AND no garantiza el orden).
      select count(*) into v_matches
      from public.employees e
      where e.company_id = v_company.id and e.status = 'active'
        and case when regexp_replace(e.employee_number, '\D', '', 'g') ~ '^\d{1,12}$'
                 then regexp_replace(e.employee_number, '\D', '', 'g')::numeric end = v_digits::numeric;
      if v_matches = 1 then
        select * into v_employee
        from public.employees e
        where e.company_id = v_company.id and e.status = 'active'
          and case when regexp_replace(e.employee_number, '\D', '', 'g') ~ '^\d{1,12}$'
                   then regexp_replace(e.employee_number, '\D', '', 'g')::numeric end = v_digits::numeric;
      end if;
    end if;
  end if;

  -- Los intentos se cuentan por EMPLEADO, no por cómo se escribió su número.
  if v_matches = 1 then
    v_key := 'id:' || v_employee.id::text;
  else
    v_key := 'n:' || v_key;
  end if;

  -- Un día sin intentos borra el historial (y con él, el bloqueo progresivo).
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
    v_minutes := greatest(1, ceil(extract(epoch from (v_attempt.locked_until - now())) / 60)::integer);
    return jsonb_build_object(
      'ok', false,
      'error', case
        when v_minutes >= 120 then format('Demasiados intentos. Espera %s h e inténtalo de nuevo.', ceil(v_minutes / 60.0)::integer)
        else format('Demasiados intentos. Espera %s min e inténtalo de nuevo.', v_minutes)
      end);
  end if;

  if v_matches <> 1 or coalesce(v_employee.pin, '') = '' or v_employee.pin <> p_pin then
    -- 5 fallos = un bloqueo; cada bloqueo seguido dura 4 veces más: 15 min, 1 h, 4 h, 16 h, 24 h.
    update public.employee_portal_attempts a
    set failed_count = case when a.failed_count + 1 >= 5 then 0 else a.failed_count + 1 end,
        lock_count = case when a.failed_count + 1 >= 5 then least(a.lock_count + 1, 6) else a.lock_count end,
        locked_until = case
          when a.failed_count + 1 >= 5
            then now() + make_interval(mins => least(15 * (4 ^ a.lock_count)::integer, 1440))
          else null
        end,
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

-- -----------------------------------------------------------------------------
-- Checar (reemplaza a la de 008): igual, más topes a los totales del día
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

-- Los permisos se conservan al reemplazar; se repiten por si esta migración se corre sola.
revoke all on function public.employee_portal_login(text, text, text) from public;
revoke all on function public.employee_portal_punch(text, jsonb, jsonb) from public;
grant execute on function public.employee_portal_login(text, text, text) to anon, authenticated;
grant execute on function public.employee_portal_punch(text, jsonb, jsonb) to anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación de instalación (no muestra datos personales).
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'employee_portal_attempts' and column_name = 'lock_count') as columna_bloqueo,
  to_regprocedure('public.employee_portal_login(text,text,text)') as funcion_entrar,
  to_regprocedure('public.employee_portal_punch(text,jsonb,jsonb)') as funcion_checar;
