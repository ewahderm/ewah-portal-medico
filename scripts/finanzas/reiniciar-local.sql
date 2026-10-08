-- Deja el flujo de caja sin activar en el Supabase LOCAL (nunca en la BD
-- enlazada) para repetir los recorridos sin volver a levantar todo. Los
-- triggers de inmutabilidad se saltan solo en esta sesión.
set session_replication_role = replica;
delete from fin_movimientos;
delete from fin_cuentas;
delete from fin_socios;
delete from fin_categorias_clinica;
delete from fin_config;
delete from storage.objects where bucket_id = 'finanzas';
set session_replication_role = origin;
