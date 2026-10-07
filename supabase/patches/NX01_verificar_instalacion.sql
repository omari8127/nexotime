-- Ejecutar DESPUÉS de NX01_fotos_entrada.sql. Solo lectura, sin fotos/datos personales.
-- Los resultados deben indicar RLS activo, cero permisos anónimos/de edición de fotos,
-- SECURITY INVOKER y trigger instalado.
select c.relname as tabla, c.relrowsecurity as rls_activo
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='attendance_photos';
select has_table_privilege('anon','public.attendance_photos','SELECT') as anon_puede_leer,
       has_table_privilege('authenticated','public.attendance_photos','UPDATE') as puede_reemplazar_foto,
       has_table_privilege('authenticated','public.attendance_photos','DELETE') as puede_borrar_foto;
select p.proname, not p.prosecdef as security_invoker
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('save_attendance_with_photos','check_attendance_photo');
select policyname, cmd, roles from pg_policies
where schemaname='public' and tablename='attendance_photos';
select tgname, tgenabled from pg_trigger
where tgrelid='public.attendance_records'::regclass and tgname='attendance_photo_required';
