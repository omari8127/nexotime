-- =============================================================================
-- NEXOTIME · 007 · RFC del empleado
-- =============================================================================
-- El gafete imprimible (Empleados → Gafete) muestra el RFC del empleado junto a
-- su QR y su número de empleado. Es opcional: un empleado sin RFC se guarda e
-- imprime igual, solo sin ese renglón.
--
-- Ejecuta DESPUÉS de schema.sql y 002 a 006. Es seguro repetirla.
-- =============================================================================

alter table public.employees
  add column if not exists rfc text;

comment on column public.employees.rfc is 'RFC del empleado (12 o 13 caracteres, en mayúsculas). Opcional; se imprime en el gafete.';
