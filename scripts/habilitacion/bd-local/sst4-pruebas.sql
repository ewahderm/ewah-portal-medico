-- Pruebas de SG-SST F4 (0074): documentos del sistema.
\set ON_ERROR_STOP 1
select t.ok(count(*) = 25, 'tipos del SG-SST sembrados (24 nuevos + la política): ' || count(*))
  from tipos_documento_normativo where categoria = 'sgsst';
select id as tipo from tipos_documento_normativo where codigo = 'SST_PLAN_ANUAL' \gset
select id as clin from clinicas where nombre = 'Clinica A' \gset

select t.como('00000000-0000-0000-0000-0000000005a5'); set role authenticated;
insert into documentos_normativos (clinica_id, tipo_documento_id, version, storage_path, nombre_archivo)
values (clinica_actual(), :'tipo', 0, clinica_actual() || '/documentos/' || :'tipo' || '/a.pdf', 'plan.pdf');
insert into documentos_normativos (clinica_id, tipo_documento_id, version, storage_path, nombre_archivo, created_by)
values (clinica_actual(), :'tipo', 99, clinica_actual() || '/documentos/' || :'tipo' || '/b.pdf', 'plan v2.pdf', '00000000-0000-0000-0000-00000000000b');
select t.ok(array_agg(version order by version) = '{1,2}' and bool_and(created_by = auth.uid()), 'la BD asigna la versión y la autoría')
  from documentos_normativos where tipo_documento_id = :'tipo';
select t.debe_fallar(format($q$insert into documentos_normativos (clinica_id, tipo_documento_id, version, storage_path, nombre_archivo) values (clinica_actual(), %L, 0, clinica_actual() || '/normativos/x.pdf', 'x.pdf')$q$, :'tipo'), 'row-level');
update documentos_normativos set nombre_archivo = 'otro' where tipo_documento_id = :'tipo';
select t.ok(bool_and(nombre_archivo like 'plan%'), 'el responsable SST no edita versiones') from documentos_normativos where tipo_documento_id = :'tipo';
select t.ok(count(*) = 0, 'el responsable SST no ve los protocolos de RRHH ni de habilitación')
  from documentos_normativos d join tipos_documento_normativo t2 on t2.id = d.tipo_documento_id where t2.categoria <> 'sgsst';

-- Administrador: no borra; desde RRHH no carga documentos del SG-SST fuera de documentos/.
reset role; select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
delete from documentos_normativos where tipo_documento_id = :'tipo';
reset role;
select t.ok(count(*) = 2, 'ni el administrador borra versiones del SG-SST (sin política)') from documentos_normativos where tipo_documento_id = :'tipo';
select t.debe_fallar(format('delete from documentos_normativos where tipo_documento_id = %L', :'tipo'), 'se conservan');
select t.como('00000000-0000-0000-0000-0000000000a4'); set role authenticated;
select t.ok(count(*) = 0, 'sin permiso de SST no ve los documentos del SG-SST')
  from documentos_normativos d join tipos_documento_normativo t2 on t2.id = d.tipo_documento_id where t2.categoria = 'sgsst';
reset role; select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok(count(*) = 0, 'otra clínica no ve documentos ajenos') from documentos_normativos where clinica_id <> clinica_actual();
reset role;
