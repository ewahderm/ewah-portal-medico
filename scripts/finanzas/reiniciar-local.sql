-- Deja el flujo de caja sin activar en el Supabase LOCAL (nunca en la BD
-- enlazada) para repetir los recorridos sin volver a levantar todo. Los
-- triggers de inmutabilidad se saltan solo en esta sesión.
set session_replication_role = replica;
delete from fin_movimientos;
delete from fin_medios_pago;
delete from fin_liquidaciones_pasarela;
delete from fin_tarifas_medio_pago;
-- Lo que siembra recorrido-fc3.mjs.
delete from tratamientos where notas = 'recorrido-fc3';
delete from atenciones where paciente_id in (select id from pacientes where numero_identificacion = 'RECORRIDO-FC3');
delete from pacientes where numero_identificacion = 'RECORRIDO-FC3';
delete from fin_cuentas;
delete from fin_socios;
delete from fin_categorias_clinica;
delete from fin_config;
delete from storage.objects where bucket_id = 'finanzas';
set session_replication_role = origin;
