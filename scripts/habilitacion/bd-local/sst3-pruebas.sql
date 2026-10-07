-- Pruebas de SG-SST F3 (0073): eventos, plazos, investigación y acciones.
\set ON_ERROR_STOP 1
\set E1 '''00000000-0000-0000-0000-0000000005e1'''
select t.como('00000000-0000-0000-0000-0000000005a5'); set role authenticated;
select t.ok(count(*) = 0, 'el responsable SST no lee empleados (no tiene RRHH)') from empleados;
select t.ok(count(*) >= 1, 'pero sí los elige con el picker') from fn_empleados_picker();

-- Viernes 2026-08-14 → 2 días hábiles: martes 18 y miércoles 19 (lunes 17 es festivo).
insert into accidentes_trabajo (clinica_id, empleado_id, fecha, resumen, tipo_evento, gravedad, riesgo_biologico, created_by)
values (clinica_actual(), :E1, '2026-08-14', 'Pinchazo con aguja al recapuchar', 'accidente', 'leve', true, '00000000-0000-0000-0000-00000000000b')
returning id as ev \gset
select t.ok(fecha_limite_reporte = '2026-08-19' and fecha_limite_investigacion = '2026-08-29',
  format('plazos: reporte %s (2 días hábiles con festivo), investigación %s (15 días)', fecha_limite_reporte, fecha_limite_investigacion))
  from accidentes_trabajo where id = :'ev';
select t.ok(created_by = auth.uid(), 'el evento queda a nombre de quien lo registra') from accidentes_trabajo where id = :'ev';
select t.debe_fallar($q$insert into accidentes_trabajo (clinica_id, empleado_id, fecha, resumen) values (clinica_actual(), '00000000-0000-0000-0000-0000000005e1', current_date + 5, 'futuro')$q$, 'futura');
select t.debe_fallar($q$insert into accidentes_trabajo (clinica_id, empleado_id, fecha, resumen, tipo_evento, gravedad) values (clinica_actual(), '00000000-0000-0000-0000-0000000005e1', current_date - 1, 'casi', 'incidente', 'leve')$q$, 'incidente_sin_lesion');
select t.debe_fallar(format('update accidentes_trabajo set reportado_arl = true where id = %L', :'ev'), 'reportes_con_fecha');
select t.debe_fallar(format('update accidentes_trabajo set reportado_mintrabajo = true, fecha_reporte_mintrabajo = current_date - 1 where id = %L', :'ev'), 'graves o mortales');
update accidentes_trabajo set reportado_arl = true, fecha_reporte_arl = current_date - 1, furat_numero = 'FURAT-1' where id = :'ev';
select t.ok(reportado_arl and furat_numero = 'FURAT-1', 'reporte a la ARL con FURAT') from accidentes_trabajo where id = :'ev';

-- Persona de otra clínica.
reset role;
insert into empleados (id, clinica_id, nombre, activo) select '00000000-0000-0000-0000-0000000005b9', id, 'De B', true from clinicas where nombre = 'Clinica B';
select t.como('00000000-0000-0000-0000-0000000005a5'); set role authenticated;
select t.debe_fallar($q$insert into accidentes_trabajo (clinica_id, empleado_id, fecha, resumen) values (clinica_actual(), '00000000-0000-0000-0000-0000000005b9', current_date - 1, 'ajeno')$q$, 'no pertenece');

-- Investigación.
insert into sst_investigaciones (clinica_id, accidente_id, fecha_inicio, equipo)
values (clinica_actual(), :'ev', current_date - 1, '[{"nombre":"Jefe","rol":"jefe_inmediato"},{"nombre":"Vigía","rol":"copasst_vigia"}]')
returning id as inv \gset
select t.debe_fallar(format('update sst_investigaciones set estado = ''cerrada'', fecha_cierre = current_date where id = %L', :'inv'), 'sst_investigacion_cierre');
update sst_investigaciones set causas_inmediatas = 'Recapuchado de la aguja usada', causas_basicas = 'Falta de guardián cerca del sitio de atención',
  metodologia = 'cinco_porques', estado = 'cerrada', fecha_cierre = current_date where id = :'inv';
select t.debe_fallar(format('update sst_investigaciones set conclusiones = ''cambio'' where id = %L', :'inv'), 'cerrada');
select t.debe_fallar(format($q$insert into sst_investigaciones (clinica_id, accidente_id, fecha_inicio) values (clinica_actual(), %L, current_date)$q$, :'ev'), 'duplicate|llave');

-- Acciones.
insert into sst_acciones (clinica_id, origen, origen_id, descripcion, responsable_id, fecha_compromiso)
values (clinica_actual(), 'investigacion', :'inv', 'Instalar guardián en cada consultorio', '00000000-0000-0000-0000-0000000005a5', current_date + 10)
returning id as acc \gset
select t.debe_fallar(format($q$insert into sst_acciones (clinica_id, origen, origen_id, descripcion, responsable_id, fecha_compromiso) values (clinica_actual(), 'investigacion', %L, 'Acción con responsable ajeno', '00000000-0000-0000-0000-00000000000b', current_date)$q$, :'inv'), 'responsable no pertenece');
select t.debe_fallar($q$insert into sst_acciones (clinica_id, origen, origen_id, descripcion, responsable_id, fecha_compromiso) values (clinica_actual(), 'investigacion', gen_random_uuid(), 'Origen inventado para probar', '00000000-0000-0000-0000-0000000005a5', current_date)$q$, 'no pertenece');
update sst_acciones set estado = 'cerrada', fecha_cierre = current_date, cierre_observacion = 'Guardianes instalados en los 3 consultorios' where id = :'acc';
select t.debe_fallar(format('update sst_acciones set descripcion = ''Cambiada después de cerrar'' where id = %L', :'acc'), 'cerrada');

-- RRHH sin SST sigue viendo sus accidentes; recepción no ve nada; otra clínica tampoco.
reset role; select t.como('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
select t.ok(count(*) = 0, 'sin RRHH ni SST no ve eventos') from accidentes_trabajo;
reset role; select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok(count(*) = 0, 'otra clínica no ve eventos ajenos') from accidentes_trabajo where clinica_id <> clinica_actual();
select t.ok(count(*) = 0, 'ni investigaciones') from sst_investigaciones;
select t.ok(count(*) = 0, 'ni acciones') from sst_acciones;
reset role;
