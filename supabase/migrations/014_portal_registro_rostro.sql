-- =============================================================================
-- NEXOTIME · 014 · Portal del empleado: registrar su propio rostro desde el celular
-- =============================================================================
-- Un empleado que todavía no tiene rostro registrado puede registrarlo él mismo desde el portal
-- (número + PIN), con la misma guía de 5 tomas que usa el administrador. Así ya no hace falta que
-- pase con el administrador antes de poder checar con reconocimiento facial.
--
-- Reglas (las aplica la base de datos, no el teléfono):
--   • SOLO si no tiene un rostro registrado. Para cambiar o borrar uno existente sigue haciendo falta
--     el propietario o un administrador (migración 003).
--   • Solo su propio rostro: la sesión del portal decide de quién es, no lo que mande el teléfono.
--   • Entre 3 y 10 muestras de exactamente 1024 números cada una (las de Human).
--   • Si el rostro se parece al de otra persona de la empresa, no se guarda (evita que alguien con el
--     PIN de un compañero registre su propia cara en la ficha del otro).
--   • La empresa puede apagarlo: Configuración → Portal de empleados (attendance_settings.portalFaceEnroll).
--   • Queda en Auditoría, y la muestra queda marcada "selfEnrolled" para que el administrador la vea.
--
-- Es seguro repetirla.
-- =============================================================================

begin;

create or replace function public.employee_portal_enroll_face(p_token text, p_descriptors jsonb)
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

  v_face := jsonb_build_object(
    'method', 'face',
    'enabled', true,
    'descriptors', v_clean,
    'enrolledAt', v_now,
    'selfEnrolled', true
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
    'Registró su propio rostro desde el portal del empleado (celular).',
    jsonb_build_array(jsonb_build_object('field', 'Rostro', 'before', 'Sin registrar', 'after', 'Registrado por el empleado'))
  );

  return jsonb_build_object('ok', true, 'enrolledAt', v_now, 'samples', jsonb_array_length(v_clean));
end;
$$;

revoke all on function public.employee_portal_enroll_face(text, jsonb) from public;
grant execute on function public.employee_portal_enroll_face(text, jsonb) to anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación de instalación (no muestra datos personales).
select to_regprocedure('public.employee_portal_enroll_face(text,jsonb)') as funcion_registrar_rostro;
