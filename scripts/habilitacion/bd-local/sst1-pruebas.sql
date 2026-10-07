-- Pruebas de SG-SST F1 (0072): módulo, perfil y conteo de trabajadores.
\set ON_ERROR_STOP 1
select t.ok(count(*) = 1, 'módulo sst registrado y activo en la clínica A')
  from clinica_modulos cm join modulos m on m.id = cm.modulo_id
  where m.codigo = 'sst' and cm.activo and cm.clinica_id = (select id from clinicas where nombre = 'Clinica A');

select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
-- Solo cuenta los activos; empleados creados antes por otras pruebas también suman.
select (select count(*) from empleados where activo and categoria_contrato = 'laboral') as lab,
       (select count(*) from empleados where activo and categoria_contrato = 'servicios') as ser \gset
select t.ok(c.dependientes = :lab and c.contratistas = :ser and c.dependientes >= 2 and c.contratistas >= 1,
  format('conteo: %s dependientes y %s contratistas activos (el retirado no cuenta)', c.dependientes, c.contratistas))
  from fn_sst_conteo_trabajadores() c;
select t.ok(clase_cargos_max = 'IV', 'la mayor clase de los cargos vigentes es IV') from fn_sst_conteo_trabajadores();

-- La actividad económica ya no es del perfil SG-SST: vive en clinicas (0080, ver sst11).
insert into sst_perfil (clinica_id, created_by) values (clinica_actual(), '00000000-0000-0000-0000-00000000000b');
select t.ok(created_by = auth.uid(), 'el perfil queda a nombre de quien lo crea') from sst_perfil;
select t.debe_fallar('update sst_perfil set excluye_contratistas = true', 'exclusion_justificada');
update sst_perfil set excluye_contratistas = true, justificacion_exclusion = 'Contratos de menos de un mes, sin afiliación por la clínica';
select t.ok(excluye_contratistas, 'excluir contratistas con justificación') from sst_perfil;

-- Sin permiso de SST (recepción) y otra clínica.
reset role; select t.como('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
select t.debe_fallar('select * from fn_sst_conteo_trabajadores()', 'permiso');
select t.ok(count(*) = 0, 'sin permiso no ve el perfil') from sst_perfil;
reset role; select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok(count(*) = 0, 'otra clínica no ve el perfil') from sst_perfil;
select t.ok(dependientes = 0 and contratistas = 0, 'otra clínica cuenta solo los suyos') from fn_sst_conteo_trabajadores();
update sst_perfil set otros_trabajadores = 99;
reset role;
select t.ok(otros_trabajadores = 0, 'otra clínica no edita el perfil') from sst_perfil;
select t.ok(not has_function_privilege('anon', 'fn_sst_conteo_trabajadores()', 'execute'), 'anon no ejecuta el conteo');
