  -- =============================================================================
  -- NEXOTIME · 015 · Fecha del consentimiento al registrar el rostro desde el celular
  -- =============================================================================
  -- El rostro es un dato personal sensible: su tratamiento requiere consentimiento expreso y por escrito
  -- (Ley Federal de Protección de Datos Personales en Posesión de los Particulares, 2025, art. 8), y quien
  -- lo trata debe poder demostrarlo. Esta migración guarda, junto al rostro que el empleado registra desde
  -- su celular, CUÁNDO aceptó la casilla de consentimiento (consentAt) y que fue él (consentBy), y lo deja
  -- también en Auditoría.
  --
  -- Reemplaza la función de la migración 014 (mismas reglas). La app vieja, que no manda la fecha, sigue
  -- funcionando: se usa el momento en que el servidor recibe el registro.
  -- Es seguro repetirla.
  -- =============================================================================
  
  begin;
  
  -- The 014 version took two arguments; a second function with the same name would make calls ambiguous.
  drop function if exists public.employee_portal_enroll_face(text, jsonb);
  
  create or replace function public.employee_portal_enroll_face(
    p_token text,
    p_descriptors jsonb,
    p_consent_at timestamptz default null
  )
  returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
  declare
    s public.employee_portal_sessions%rowtype := public.employee_portal_session(p_token);
    v_company public.companies%rowtype;
    v_employee public.employees%rowtype;
    v_clean jsonb;
    v_face jsonb;
    v_now text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    v_nearest numeric;
    v_consent timestamptz;
    v_consent_text text;
  begin
    select * into v_company from public.companies c where c.id = s.company_id;
    -- One enrollment at a time for this employee (two phones, a double tap).
    select * into v_employee from public.employees e where e.id = s.employee_id for update;
  
    if coalesce(v_company.attendance_settings ->> 'portalFaceEnroll', 'true') = 'false' then
      raise exception 'Tu empresa no permite registrar el rostro desde el celular. Pide a tu administrador que lo registre.'
        using errcode = 'NX403';
    end if;
  
    -- Only when there is no usable face yet: changing one stays with the owner or an administrator.
    if exists (
      select 1
      from jsonb_array_elements(coalesce(v_employee.identifications, '[]'::jsonb)) i
      where i ->> 'method' = 'face'
        and jsonb_typeof(i -> 'descriptors') = 'array'
        and exists (
          select 1 from jsonb_array_elements(i -> 'descriptors') d
          where jsonb_typeof(d) = 'array' and jsonb_array_length(d) = 1024
        )
    ) then
      raise exception 'Ya tienes un rostro registrado. Para cambiarlo, pide a tu administrador que lo actualice.'
        using errcode = 'NX403';
    end if;
  
    -- 3 to 10 samples of exactly 1024 numbers, each in a sane range.
    if jsonb_typeof(p_descriptors) is distinct from 'array'
       or jsonb_array_length(p_descriptors) not between 3 and 10
       or exists (
         select 1 from jsonb_array_elements(p_descriptors) d
         where jsonb_typeof(d) is distinct from 'array'
            or jsonb_array_length(d) <> 1024
            or exists (
              select 1 from jsonb_array_elements(d) x
              where jsonb_typeof(x) is distinct from 'number' or abs(x::text::numeric) > 50
            )
       ) then
      raise exception 'El registro del rostro no es válido. Vuelve a intentarlo.';
    end if;
  
    -- Rebuilt here (rounded like the app stores them): nothing extra the phone adds is kept.
    select jsonb_agg(sample order by sn) into v_clean
    from (
      select sn, jsonb_agg(round(x::text::numeric, 3) order by xn) as sample
      from jsonb_array_elements(p_descriptors) with ordinality d(item, sn),
           jsonb_array_elements(d.item) with ordinality v(x, xn)
      group by sn
    ) q;
  
    -- Not someone else's face: the average of the new samples against every sample of the other
    -- employees of the company. Same scale as the app (Euclidean distance ÷ 20) and its "duplicate" limit.
    with mine as (
      select xn, avg(x::text::numeric) as v
      from jsonb_array_elements(v_clean) d(item),
           jsonb_array_elements(d.item) with ordinality v(x, xn)
      group by xn
    ),
    theirs as (
      select e.id, sm.sn, sm.sample
      from public.employees e,
           jsonb_array_elements(coalesce(e.identifications, '[]'::jsonb)) i,
           jsonb_array_elements(case when jsonb_typeof(i -> 'descriptors') = 'array' then i -> 'descriptors' else '[]'::jsonb end)
             with ordinality sm(sample, sn)
      where e.company_id = s.company_id
        and e.id <> s.employee_id
        and i ->> 'method' = 'face'
        and jsonb_typeof(sm.sample) = 'array'
        and jsonb_array_length(sm.sample) = 1024
    )
    select min(dist) into v_nearest
    from (
      select sqrt(sum(power(x::text::numeric - mine.v, 2))) / 20 as dist
      from theirs t,
           jsonb_array_elements(t.sample) with ordinality o(x, xn)
           join mine using (xn)
      group by t.id, t.sn
    ) q;
    if v_nearest is not null and v_nearest < 0.32 then
      raise exception 'Este rostro se parece al de otra persona registrada en tu empresa. Pide a tu administrador que registre tu rostro.'
        using errcode = 'NX403';
    end if;
  
    -- When they ticked the consent box. The phone's clock is not trusted blindly: anything missing, in the
    -- future or older than a day is replaced by the moment the server receives the registration.
    v_consent := case
      when p_consent_at is null or p_consent_at > now() + interval '5 minutes' or p_consent_at < now() - interval '1 day'
        then now()
      else least(p_consent_at, now())
    end;
    v_consent_text := to_char(v_consent at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  
    v_face := jsonb_build_object(
      'method', 'face',
      'enabled', true,
      'descriptors', v_clean,
      'enrolledAt', v_now,
      'selfEnrolled', true,
      'consentAt', v_consent_text,
      'consentBy', 'employee'
    );
  
    update public.employees e
    set identifications = case
      when exists (select 1 from jsonb_array_elements(coalesce(e.identifications, '[]'::jsonb)) i where i ->> 'method' = 'face')
        then (
          select jsonb_agg(case when i ->> 'method' = 'face' then v_face else i end order by ord)
          from jsonb_array_elements(e.identifications) with ordinality x(i, ord)
        )
      else coalesce(e.identifications, '[]'::jsonb) || jsonb_build_array(v_face)
    end
    where e.id = s.employee_id;
  
    insert into public.audit_log (company_id, actor_id, actor_name, actor_role, action, entity_type, entity_id, entity_label, reason, changes)
    values (
      s.company_id,
      null,
      v_employee.full_name,
      'employee',
      'employee.edit',
      'Employee',
      v_employee.id::text,
      v_employee.full_name,
      format(
        'Registró su propio rostro desde el portal del empleado (celular). Consentimiento expreso: casilla aceptada tras entrar con su número y PIN, el %s (UTC).',
        to_char(v_consent at time zone 'UTC', 'YYYY-MM-DD HH24:MI')
      ),
      jsonb_build_array(
        jsonb_build_object('field', 'Rostro', 'before', 'Sin registrar', 'after', 'Registrado por el empleado'),
        jsonb_build_object('field', 'Consentimiento', 'before', '—', 'after', v_consent_text)
      )
    );
  
    return jsonb_build_object('ok', true, 'enrolledAt', v_now, 'consentAt', v_consent_text, 'samples', jsonb_array_length(v_clean));
  end;
  $$;
  
  revoke all on function public.employee_portal_enroll_face(text, jsonb, timestamptz) from public;
  grant execute on function public.employee_portal_enroll_face(text, jsonb, timestamptz) to anon, authenticated;
  
  commit;
  
  notify pgrst, 'reload schema';
  
  -- Comprobación de instalación (no muestra datos personales).
  select to_regprocedure('public.employee_portal_enroll_face(text,jsonb,timestamptz)') as funcion_registrar_rostro;
