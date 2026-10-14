-- =============================================================================
-- NEXOTIME · 012 · Borrar los rostros registrados con el motor anterior
-- =============================================================================
-- El reconocimiento facial cambió de face-api a Human. Cada muestra del motor anterior
-- tenía 128 números; las de Human tienen 1024. No se pueden comparar entre sí: las viejas
-- ya no sirven para reconocer a nadie y solo ocupan espacio (también en la copia sin
-- Internet de cada reloj checador).
--
-- Qué hace:
--   • En cada empleado, quita del método "rostro" toda muestra que no sea de Human
--     (que no tenga exactamente 1024 números).
--   • Si al empleado no le queda ninguna muestra, el método "rostro" queda apagado y sin
--     fecha de registro: aparece como "No registrado" y se vuelve a registrar desde
--     Empleados o Configuración → Reloj checador.
--   • Las muestras nuevas (de Human) y los demás métodos (QR, código de barras, PIN) no se tocan.
--   • Deja constancia en Auditoría, una línea por empresa.
--
-- Es seguro repetirla: la segunda vez ya no encuentra nada que borrar.
-- No se puede deshacer: las muestras borradas no se recuperan (de todos modos ya no servían).
-- =============================================================================

begin;

-- Muestras de rostro válidas para Human: un arreglo de exactamente 1024 números.
create or replace function pg_temp.human_samples(item jsonb)
returns jsonb
language sql immutable
as $$
  select coalesce(jsonb_agg(d), '[]'::jsonb)
  from jsonb_array_elements(
    case when jsonb_typeof(item -> 'descriptors') = 'array' then item -> 'descriptors' else '[]'::jsonb end
  ) d
  where jsonb_typeof(d) = 'array' and jsonb_array_length(d) = 1024
$$;

-- Empleados que tienen al menos una muestra que no es de Human.
create temporary table rostros_a_limpiar on commit drop as
select e.id, e.company_id
from public.employees e
where jsonb_typeof(e.identifications) = 'array'
  and exists (
    select 1
    from jsonb_array_elements(e.identifications) i
    where i ->> 'method' = 'face'
      and jsonb_typeof(i -> 'descriptors') = 'array'
      and jsonb_array_length(i -> 'descriptors') > jsonb_array_length(pg_temp.human_samples(i))
  );

update public.employees e
set identifications = (
  select jsonb_agg(
    case
      when i ->> 'method' <> 'face' then i
      when jsonb_array_length(pg_temp.human_samples(i)) = 0
        then (i - 'descriptors' - 'enrolledAt') || jsonb_build_object('enabled', false)
      else jsonb_set(i, '{descriptors}', pg_temp.human_samples(i))
    end
    order by ord
  )
  from jsonb_array_elements(e.identifications) with ordinality as x(i, ord)
)
where e.id in (select id from rostros_a_limpiar);

insert into public.audit_log (company_id, actor_id, actor_name, actor_role, action, entity_type, entity_id, entity_label, reason, changes)
select
  company_id,
  null,
  'Sistema',
  'owner',
  'employee.edit',
  'Employee',
  'bulk',
  format('Rostros del motor anterior borrados (%s %s)', count(*), case when count(*) = 1 then 'empleado' else 'empleados' end),
  'Cambio de reconocimiento facial a Human: las muestras anteriores no son compatibles y deben registrarse de nuevo.',
  jsonb_build_array(jsonb_build_object('field', 'Rostro', 'before', 'Muestras del motor anterior', 'after', 'Borradas: registrar de nuevo'))
from rostros_a_limpiar
group by company_id;

-- Resultado (no muestra datos personales).
select count(*) as empleados_con_rostros_viejos_borrados from rostros_a_limpiar;

commit;
