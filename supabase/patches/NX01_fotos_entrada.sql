-- NexoTime NX01. SQL de instalación incremental para SQL Editor.
-- Requiere schema.sql y migración 002 (roles/alcance) ya aplicados.
-- No modifica registros históricos. Ejecutar ANTES de publicar el frontend.
-- CLI no disponible en el entorno de entrega; este parche no añade historial al CLI.
begin;

create table if not exists public.attendance_photos (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  attendance_date date not null,
  captured_at timestamptz not null,
  received_at timestamptz not null default now(),
  width integer not null check (width between 160 and 640),
  height integer not null check (height between 120 and 640),
  data_url text not null check (length(data_url) between 200 and 180000
    and data_url ~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]+={0,2}$')
);
create index if not exists attendance_photos_employee_date_idx
  on public.attendance_photos(company_id, employee_id, attendance_date);
alter table public.attendance_photos enable row level security;
revoke all on public.attendance_photos from public, anon, authenticated;
grant select, insert on public.attendance_photos to authenticated;

drop policy if exists attendance_photos_select on public.attendance_photos;
create policy attendance_photos_select on public.attendance_photos for select to authenticated
using (company_id = (select public.current_company_id()) and public.can_see_employee(employee_id));
drop policy if exists attendance_photos_insert on public.attendance_photos;
create policy attendance_photos_insert on public.attendance_photos for insert to authenticated
with check (
  company_id = (select public.current_company_id()) and public.can_see_employee(employee_id)
  and exists (select 1 from public.employees e where e.id = attendance_photos.employee_id and e.company_id = attendance_photos.company_id and e.status = 'active')
);

-- No SECURITY DEFINER: each statement is subject to the caller's privileges and RLS.
create or replace function public.save_attendance_with_photos(p_record jsonb, p_photos jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  r public.attendance_records%rowtype;
  item jsonb;
  previous public.attendance_records%rowtype;
  existing_photo public.attendance_photos%rowtype;
  photo_id uuid;
  incoming_time timestamptz;
  jpeg bytea;
begin
  if auth.uid() is null then raise exception 'Se requiere una sesión válida'; end if;
  if jsonb_typeof(p_photos) is distinct from 'array' or jsonb_array_length(p_photos) not between 1 and 4 then
    raise exception 'Cantidad de fotos no válida';
  end if;
  r := jsonb_populate_record(null::public.attendance_records, p_record);
  if r.company_id is distinct from public.current_company_id() or not public.can_see_employee(r.employee_id) then
    raise exception 'No tienes acceso a este empleado';
  end if;
  if not exists (select 1 from public.employees e where e.id = r.employee_id and e.company_id = r.company_id and e.status = 'active')
    or not exists (select 1 from public.branches b where b.id = r.branch_id and b.company_id = r.company_id)
    or not exists (select 1 from public.schedules s where s.id = r.schedule_id and s.company_id = r.company_id) then
    raise exception 'Empleado, sucursal u horario no válidos';
  end if;
  if jsonb_typeof(r.punches) is distinct from 'array' then raise exception 'Movimientos no válidos'; end if;
  -- Serializes competing kiosks for the same day, including the first insert.
  perform pg_advisory_xact_lock(hashtextextended(r.employee_id::text || ':' || r.date::text, 0));
  select * into previous from public.attendance_records where employee_id = r.employee_id and date = r.date for update;
  if found then
    r.id := previous.id;
    -- A queued entry must not erase a newer exit or a different entry.
    if not (r.punches @> previous.punches) then
      raise exception 'Ya hay movimientos más recientes: revisa la sincronización antes de reemplazarlos';
    end if;
  end if;
  for item in select value from jsonb_array_elements(p_photos) loop
    photo_id := (item->>'id')::uuid;
    incoming_time := (item->>'capturedAt')::timestamptz;
    if item->>'companyId' is distinct from r.company_id::text
      or item->>'employeeId' is distinct from r.employee_id::text
      or item->>'date' is distinct from r.date::text
      or incoming_time is null or incoming_time > now() + interval '5 minutes'
      or not exists (select 1 from jsonb_array_elements(r.punches) p
        where p->>'type' = 'entry' and p->'photoEvidence'->>'id' = photo_id::text
          and (p->'photoEvidence'->>'capturedAt')::timestamptz = incoming_time) then
      raise exception 'La foto no corresponde a esta entrada';
    end if;
    if item->>'dataUrl' is null or length(item->>'dataUrl') not between 200 and 180000
      or (item->>'dataUrl') !~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]+={0,2}$' then
      raise exception 'Formato o tamaño de foto no válido';
    end if;
    jpeg := decode(split_part(item->>'dataUrl', ',', 2), 'base64');
    if octet_length(jpeg) < 100 or substring(jpeg from 1 for 2) <> decode('ffd8','hex')
      or substring(jpeg from octet_length(jpeg)-1 for 2) <> decode('ffd9','hex') then
      raise exception 'La fotografía no es un JPEG válido';
    end if;
    select * into existing_photo from public.attendance_photos where id = photo_id;
    if found then
      if existing_photo.width <> (item->>'width')::integer or existing_photo.height <> (item->>'height')::integer
        or existing_photo.company_id <> r.company_id or existing_photo.employee_id <> r.employee_id
        or existing_photo.attendance_date <> r.date or existing_photo.data_url is distinct from item->>'dataUrl'
        or existing_photo.captured_at <> incoming_time then
        raise exception 'La foto existente no se puede reemplazar';
      end if;
    else
      insert into public.attendance_photos(id, company_id, employee_id, attendance_date, captured_at, width, height, data_url)
      values(photo_id, r.company_id, r.employee_id, r.date, incoming_time,
        (item->>'width')::integer, (item->>'height')::integer, item->>'dataUrl');
    end if;
  end loop;
  insert into public.attendance_records(id, company_id, branch_id, employee_id, date, schedule_id, punches,
    status, worked_minutes, scheduled_minutes, late_minutes, overtime_minutes, missing_minutes, note)
  values(r.id, r.company_id, r.branch_id, r.employee_id, r.date, r.schedule_id, r.punches,
    r.status, r.worked_minutes, r.scheduled_minutes, r.late_minutes, r.overtime_minutes, r.missing_minutes, r.note)
  on conflict(employee_id,date) do update set
    punches=excluded.punches, status=excluded.status, worked_minutes=excluded.worked_minutes,
    scheduled_minutes=excluded.scheduled_minutes, late_minutes=excluded.late_minutes,
    overtime_minutes=excluded.overtime_minutes, missing_minutes=excluded.missing_minutes,
    note=excluded.note, updated_at=now();
end;
$$;
revoke all on function public.save_attendance_with_photos(jsonb,jsonb) from public, anon;
grant execute on function public.save_attendance_with_photos(jsonb,jsonb) to authenticated;

-- Enforces evidence even when a caller bypasses the UI. Existing identical punches stay valid.
create or replace function public.check_attendance_photo()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare p jsonb;
begin
  for p in select value from jsonb_array_elements(new.punches) loop
    if p->>'type' = 'entry' and p->>'method' in ('employee_number','pin') then
      if tg_op = 'UPDATE' and old.employee_id = new.employee_id and old.company_id = new.company_id
        and old.date = new.date and old.punches @> jsonb_build_array(p) then continue; end if;
      if not exists (select 1 from public.attendance_photos f
        where f.id::text = p->'photoEvidence'->>'id' and f.company_id = new.company_id
          and f.employee_id = new.employee_id and f.attendance_date = new.date
          and f.captured_at = (p->'photoEvidence'->>'capturedAt')::timestamptz) then
        raise exception 'La entrada por número de empleado requiere foto de evidencia';
      end if;
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.check_attendance_photo() from public, anon;
drop trigger if exists attendance_photo_required on public.attendance_records;
create trigger attendance_photo_required before insert or update on public.attendance_records
  for each row execute function public.check_attendance_photo();

commit;
-- Verificación de instalación (no muestra fotos ni datos personales).
select to_regclass('public.attendance_photos') as tabla_fotos,
       to_regprocedure('public.save_attendance_with_photos(jsonb,jsonb)') as guardado_atomico;
