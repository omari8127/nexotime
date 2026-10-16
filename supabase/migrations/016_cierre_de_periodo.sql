-- =============================================================================
-- NEXOTIME · 016 · Cierre de periodo de nómina
-- =============================================================================
-- Qué resuelve: al terminar la quincena (o la semana, o el mes) RH revisa las checadas, las
-- exporta para la nómina y CIERRA el periodo. Cerrar guarda una copia de las cuentas
-- (días, faltas, retardos, horas, extras) y bloquea los movimientos de esas fechas, para que
-- nadie cambie una hora después de pagada. Reabrir exige un motivo, queda en el historial y
-- el periodo puede cerrarse de nuevo.
--
--   1. Tabla payroll_periods (por empresa): fechas, copia de las cuentas, quién cerró y cuándo,
--      y —si se reabrió— quién, cuándo y por qué. Nunca se borra una fila.
--   2. close_payroll_period(): cierra (propietario, administrador o RH). Solo periodos ya
--      terminados, de hasta 62 días y que no se crucen con otro cierre vigente.
--   3. reopen_payroll_period(): reabre (solo propietario o administrador), con motivo.
--   4. Un disparador en attendance_records: ninguna checada de una fecha cerrada se agrega,
--      cambia ni borra mientras el cierre esté vigente. Se omite para procesos internos del
--      servidor (sin sesión de usuario), por ejemplo la limpieza de fotos.
--
-- Ejecuta DESPUÉS de schema.sql, 002 a 015 y supabase/patches/NX01_fotos_entrada.sql.
-- Es seguro repetirla.
-- =============================================================================

begin;

-- 1. La tabla ------------------------------------------------------------------
create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  from_date date not null,
  to_date date not null,
  note text,
  summary jsonb not null default '[]'::jsonb,
  totals jsonb not null default '{}'::jsonb,
  closed_at timestamptz not null default now(),
  closed_by uuid,
  closed_by_name text not null default '',
  reopened_at timestamptz,
  reopened_by uuid,
  reopened_by_name text,
  reopen_reason text,
  constraint payroll_periods_dates check (to_date >= from_date and to_date - from_date <= 61),
  constraint payroll_periods_summary check (jsonb_typeof(summary) = 'array')
);

create index if not exists payroll_periods_company_idx on public.payroll_periods (company_id, from_date);

alter table public.payroll_periods enable row level security;

-- Ver: el personal del panel de la empresa. Escribir: solo por las dos funciones de abajo.
drop policy if exists "payroll_periods_select" on public.payroll_periods;
create policy "payroll_periods_select" on public.payroll_periods
  for select using (company_id = public.current_company_id() and public.is_staff());

-- 2. Cerrar ----------------------------------------------------------------------
create or replace function public.close_payroll_period(
  p_from date,
  p_to date,
  p_note text,
  p_summary jsonb,
  p_totals jsonb
)
returns public.payroll_periods
language plpgsql security definer set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_name text;
  v_row public.payroll_periods;
begin
  if auth.uid() is null or v_company is null or not public.is_manager() then
    raise exception 'Solo propietario, administrador o RH pueden cerrar un periodo';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Las fechas del periodo no son válidas';
  end if;
  if p_to - p_from > 61 then
    raise exception 'Un periodo no puede durar más de 62 días';
  end if;
  if p_to >= current_date then
    raise exception 'Solo se cierran periodos que ya terminaron';
  end if;
  if p_summary is null or jsonb_typeof(p_summary) <> 'array' then
    raise exception 'Faltan las cuentas del periodo';
  end if;

  -- Un cierre por empresa a la vez: que dos personas no cierren el mismo periodo en paralelo.
  perform pg_advisory_xact_lock(hashtextextended('payroll:' || v_company::text, 0));

  if exists (
    select 1 from public.payroll_periods
    where company_id = v_company and reopened_at is null
      and from_date <= p_to and p_from <= to_date
  ) then
    raise exception 'Ya hay un periodo cerrado que se cruza con estas fechas';
  end if;

  select name into v_name from public.profiles where id = auth.uid();

  insert into public.payroll_periods (company_id, from_date, to_date, note, summary, totals, closed_by, closed_by_name)
  values (v_company, p_from, p_to, nullif(btrim(coalesce(p_note, '')), ''), p_summary, coalesce(p_totals, '{}'::jsonb), auth.uid(), coalesce(v_name, ''))
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.close_payroll_period(date, date, text, jsonb, jsonb) from public, anon;
grant execute on function public.close_payroll_period(date, date, text, jsonb, jsonb) to authenticated;

-- 3. Reabrir -----------------------------------------------------------------------
create or replace function public.reopen_payroll_period(p_id uuid, p_reason text)
returns public.payroll_periods
language plpgsql security definer set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_name text;
  v_row public.payroll_periods;
begin
  if auth.uid() is null or v_company is null or public.current_role() not in ('owner', 'admin') then
    raise exception 'Solo el propietario o un administrador pueden reabrir un periodo';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Escribe el motivo de la reapertura';
  end if;

  select name into v_name from public.profiles where id = auth.uid();

  update public.payroll_periods
  set reopened_at = now(),
      reopened_by = auth.uid(),
      reopened_by_name = coalesce(v_name, ''),
      reopen_reason = btrim(p_reason)
  where id = p_id and company_id = v_company and reopened_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Ese periodo no existe o ya estaba reabierto';
  end if;
  return v_row;
end;
$$;

revoke all on function public.reopen_payroll_period(uuid, text) from public, anon;
grant execute on function public.reopen_payroll_period(uuid, text) to authenticated;

-- 4. El candado ------------------------------------------------------------------------
create or replace function public.guard_closed_period()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_company uuid;
  v_dates date[];
  v_from date;
  v_to date;
begin
  -- Procesos internos del servidor (sin sesión de usuario): no se estorban.
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- Fechas que toca la operación: la nueva (alta o cambio) y la anterior (cambio o borrado).
  if tg_op = 'INSERT' then
    v_company := new.company_id;
    v_dates := array[new.date];
  elsif tg_op = 'UPDATE' then
    v_company := new.company_id;
    v_dates := array[new.date, old.date];
  else
    v_company := old.company_id;
    v_dates := array[old.date];
  end if;

  select p.from_date, p.to_date into v_from, v_to
  from public.payroll_periods p
  where p.company_id = v_company and p.reopened_at is null
    and exists (select 1 from unnest(v_dates) d where d between p.from_date and p.to_date)
  limit 1;

  if v_from is not null then
    raise exception 'El periodo del % al % ya está cerrado: no se pueden cambiar sus checadas. Un administrador puede reabrirlo.',
      to_char(v_from, 'DD/MM/YYYY'), to_char(v_to, 'DD/MM/YYYY');
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists attendance_period_lock on public.attendance_records;
create trigger attendance_period_lock before insert or update or delete on public.attendance_records
  for each row execute function public.guard_closed_period();

commit;
