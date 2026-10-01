-- =============================================================================
-- NEXOTIME · 005 · Coordenadas de la sucursal
-- =============================================================================
-- El reloj checador ya no intenta adivinar dónde está el dispositivo con el
-- GPS del navegador (lento la primera vez y puede fallar sin avisar). En su
-- lugar usa la ubicación que el administrador fija aquí, una sola vez por
-- sucursal — más confiable para un equipo que nunca se mueve.
--
-- Ejecuta DESPUÉS de schema.sql, 002, 003 y 004. Es seguro repetirla.
-- =============================================================================

alter table public.branches
  add column if not exists lat double precision,
  add column if not exists lng double precision;

comment on column public.branches.lat is 'Latitud de la sucursal, fijada a mano o por búsqueda de dirección en el panel.';
comment on column public.branches.lng is 'Longitud de la sucursal, fijada a mano o por búsqueda de dirección en el panel.';
