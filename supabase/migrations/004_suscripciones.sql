-- =============================================================================
-- NEXOTIME · 004 · Suscripción por empresa (Fase 1 del reemplazo del servidor
-- de licencias por "cuenta de empresa con plan y pago")
-- =============================================================================
-- Qué hace esta migración:
--   - Agrega a `companies` el plan, el estado de la suscripción y sus fechas.
--   - Crea `payments`, la bitácora de pagos (reemplaza la que hoy vive en el
--     servidor de licencias, SQLite aparte).
--   - Protege esas columnas con un disparador: ni el propietario ni nadie con
--     sesión normal puede cambiarlas por su cuenta (solo un proceso con la
--     llave de servicio de Supabase — un webhook de cobro o tú a mano). Así
--     una empresa no puede "activarse" a sí misma editando el navegador.
--
-- Qué NO hace todavía (vendrá en la Fase 2):
--   - La app todavía no lee ni exige estas columnas. `LicenseGate` sigue
--     siendo el que manda hasta que se reemplace por `PlanGate`.
--
-- Ejecuta DESPUÉS de schema.sql, 002 y 003. Es seguro repetirla.
-- =============================================================================

alter table public.companies
  add column if not exists plan text not null default 'basico'
    check (plan in ('basico', 'profesional', 'empresa')),
  add column if not exists subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing', 'active', 'past_due', 'canceled')),
  add column if not exists trial_ends_at timestamptz not null default (now() + interval '14 days'),
  add column if not exists current_period_end timestamptz;

comment on column public.companies.plan is
  'Qué funciones desbloquea (mismos nombres que license-server/src/plans.js). Solo lo cambia un proceso con la llave de servicio.';
comment on column public.companies.subscription_status is
  'trialing = en periodo de prueba; active = al corriente; past_due = pago atrasado (corre con tolerancia); canceled = bloqueada.';
comment on column public.companies.trial_ends_at is
  'Vencimiento de la prueba gratis de 14 días, fijado al crear la empresa.';
comment on column public.companies.current_period_end is
  'Hasta cuándo cubre el último pago registrado. Null mientras está en prueba.';

-- -----------------------------------------------------------------------------
-- Bitácora de pagos
-- -----------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  amount numeric not null,
  currency text not null default 'MXN',
  method text not null default 'manual' check (method in ('manual', 'stripe', 'mercadopago')),
  reference text not null default '',
  months_covered integer not null default 1,
  recorded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists payments_company_id_idx on public.payments (company_id);

alter table public.payments enable row level security;

-- Solo propietario/administrador consultan el historial de pagos de su empresa.
drop policy if exists "payments_select" on public.payments;
create policy "payments_select" on public.payments
  for select using (
    company_id = public.current_company_id()
    and coalesce(public.current_role(), '') in ('owner', 'admin')
  );

-- A propósito no hay política de INSERT/UPDATE/DELETE para el rol "authenticated":
-- ninguna sesión normal (ni siquiera el propietario) puede escribir un pago.
-- Solo un proceso con la llave de servicio (un webhook de Stripe/Mercado Pago,
-- o un script que corres tú al registrar un pago a mano) puede insertar aquí,
-- porque esa llave no pasa por RLS.

-- -----------------------------------------------------------------------------
-- Candado: ni el propietario ni nadie con sesión normal cambia su propio plan
-- o estado de pago. Mismo patrón que 003_biometricos_solo_admin.sql.
-- -----------------------------------------------------------------------------
create or replace function public.guard_subscription_write()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- Migraciones y llave de servicio (sin sesión de usuario) pasan siempre.
  if auth.uid() is null then
    return new;
  end if;

  if new.plan is distinct from old.plan
     or new.subscription_status is distinct from old.subscription_status
     or new.trial_ends_at is distinct from old.trial_ends_at
     or new.current_period_end is distinct from old.current_period_end then
    raise exception 'El plan y el estado de la suscripción solo los cambia el sistema de cobro';
  end if;
  return new;
end;
$$;

drop trigger if exists companies_subscription_guard on public.companies;
create trigger companies_subscription_guard
  before update on public.companies
  for each row execute function public.guard_subscription_write();

-- -----------------------------------------------------------------------------
-- Comprobación rápida (opcional), desde el SQL Editor con "Run as user" sobre
-- una empresa existente: update public.companies set plan = 'empresa' where id = '...';
-- debe fallar con el mensaje de arriba.
-- -----------------------------------------------------------------------------
