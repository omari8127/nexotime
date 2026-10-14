-- =============================================================================
-- NEXOTIME · 009 · Borrado automático de las fotos de checada (90 días)
-- =============================================================================
-- Cada movimiento del reloj checador y del portal del empleado guarda una foto
-- (tabla attendance_photos). Sin límite, la base crece sin parar: con 10 empleados
-- son cientos de MB al año y el plan gratuito de Supabase tiene 500 MB en total.
--
-- Qué hace:
--   • public.purge_old_attendance_photos(): borra las fotos de días anteriores a
--     hoy menos 90 días, en tandas de 2000 para no bloquear la base.
--   • Cada empresa puede cambiar el plazo con attendance_settings.photoRetentionDays
--     (entre 30 y 3650 días). Sin ese valor, son 90.
--   • Se programa todos los días a las 10:30 UTC (3:30 am en Tijuana) con pg_cron.
--
-- Qué NO toca: los registros de asistencia, horas, retardos ni auditoría. Solo la
-- imagen. En el panel, una foto vencida aparece como "foto eliminada".
--
-- Ejecuta DESPUÉS de schema.sql, 002 a 008 y supabase/patches/NX01_fotos_entrada.sql.
-- Es seguro repetirla.
-- =============================================================================

begin;

create or replace function public.purge_old_attendance_photos(p_default_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer := 0;
  v_batch integer;
  v_default integer := least(greatest(coalesce(p_default_days, 90), 30), 3650);
  c record;
  v_days integer;
begin
  for c in select id, attendance_settings from public.companies loop
    -- Plazo propio de la empresa si es un número válido; si no, el general.
    v_days := v_default;
    if (c.attendance_settings ->> 'photoRetentionDays') ~ '^\d{1,4}$' then
      v_days := least(greatest((c.attendance_settings ->> 'photoRetentionDays')::integer, 30), 3650);
    end if;

    loop
      delete from public.attendance_photos p
      where p.id in (
        select f.id
        from public.attendance_photos f
        where f.company_id = c.id
          and f.attendance_date < (now() at time zone 'utc')::date - v_days
        limit 2000
      );
      get diagnostics v_batch = row_count;
      v_total := v_total + v_batch;
      exit when v_batch = 0;
    end loop;
  end loop;
  return v_total;
end;
$$;

-- Nadie la llama desde la aplicación: solo el programador de la base de datos.
revoke all on function public.purge_old_attendance_photos(integer) from public, anon, authenticated;

comment on function public.purge_old_attendance_photos(integer) is
  'Borra fotos de checada con más de N días (90 por defecto; por empresa: attendance_settings.photoRetentionDays).';

commit;

-- -----------------------------------------------------------------------------
-- Programación diaria (pg_cron). Si la extensión no está disponible, el aviso de
-- abajo lo dice y la función sigue sirviendo: se puede llamar a mano con
--   select public.purge_old_attendance_photos();
-- -----------------------------------------------------------------------------
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'No se pudo activar pg_cron (%). Actívalo en Database → Extensions y vuelve a correr este archivo.', sqlerrm;
    return;
  end;

  perform cron.schedule(
    'nexotime-borrar-fotos-90-dias',
    '30 10 * * *',
    'select public.purge_old_attendance_photos(90)'
  );
  raise notice 'Borrado de fotos programado: todos los días a las 10:30 UTC.';
exception when others then
  raise notice 'No se pudo programar el borrado (%). La función existe: llámala a mano o programa el cron desde Database → Cron.', sqlerrm;
end $$;

-- Comprobación (no muestra fotos ni datos personales).
select
  (select count(*) from public.attendance_photos) as fotos_guardadas,
  (select count(*) from public.attendance_photos
    where attendance_date < (now() at time zone 'utc')::date - 90) as vencidas_hoy,
  (select pg_size_pretty(coalesce(sum(length(data_url)), 0)::bigint) from public.attendance_photos) as espacio_fotos,
  to_regprocedure('public.purge_old_attendance_photos(integer)') as funcion,
  (select count(*) from pg_catalog.pg_extension where extname = 'pg_cron') as pg_cron_activo;
-- Para ver el programa: select jobname, schedule, active from cron.job;
