-- Pruebas de RRHH 0107: solicitudes de vacaciones, permisos y reposiciones.
\set ON_ERROR_STOP 1
\set a2 '00000000-0000-0000-0000-0000000000a2'
\set e_a2 '00000000-0000-0000-0000-0000000e0a02'
\set e_ger '00000000-0000-0000-0000-0000000e0a03'
\set e_sin '00000000-0000-0000-0000-0000000e0a04'
\set e_serv '00000000-0000-0000-0000-0000000e0a05'
-- Semana del 7 al 13 de diciembre de 2026: el martes 8 es festivo.
\set lun '2026-12-07'
\set dom '2026-12-13'
select id as clinica_a from clinicas where nombre = 'Clinica A' \gset
update clinicas set pais_operacion_id = (select id from paises where codigo = 'CO') where id = :'clinica_a' and pais_operacion_id is null;
select t.ok(exists (select 1 from festivos f join paises p on p.id = f.pais_id where p.codigo = 'CO' and f.fecha = '2026-12-08'), 'el 8 de diciembre es festivo en el calendario');

-- Días hábiles: domingo y festivo no cuentan; el sábado depende de la clínica.
select t.ok(fn_rrhh_dias_habiles(:'clinica_a', :'lun', :'dom') = 5, 'lunes a domingo con festivo y sábado laboral: 5 días');
update clinicas set rrhh_sabado_laboral = false where id = :'clinica_a';
select t.ok(fn_rrhh_dias_habiles(:'clinica_a', :'lun', :'dom') = 4, 'sin sábado laboral: 4 días');
update clinicas set rrhh_sabado_laboral = true where id = :'clinica_a';

-- ===== La empleada A2 (sin acceso a RRHH) solicita para sí misma.
select t.como(:'a2'); set role authenticated;
select t.ok((fn_rrhh_saldos(:'e_a2') -> 'vacaciones' ->> 'disponibles')::numeric = 15, 'un año de contrato: 15 días disponibles');
select fn_rrhh_solicitar(null, 'vacaciones', :'lun', :'dom', null, null, null, 'Viaje familiar') as vac1 \gset
select t.ok(tipo = 'vacaciones' and dias = 5 and estado = 'pendiente' and not excede_saldo and empleado_id = :'e_a2' and solicitado_por = :'a2',
  'la solicitud queda pendiente, con 5 días hábiles y a su nombre') from rrhh_solicitudes where id = :'vac1';
select t.ok((fn_rrhh_saldos(:'e_a2') -> 'vacaciones' ->> 'pendientes')::numeric = 5 and (fn_rrhh_saldos(:'e_a2') -> 'vacaciones' ->> 'disponibles')::numeric = 10,
  'lo pendiente se reserva del saldo');
select t.debe_fallar($q$select fn_rrhh_solicitar(null, 'vacaciones', '2026-12-10', '2026-12-15', null, null, null, null)$q$, 'Ya hay vacaciones');
-- Más días de los acumulados: se permite y queda marcado.
select fn_rrhh_solicitar(null, 'vacaciones', '2027-01-04', '2027-01-30', null, null, null, 'Largas') as vac2 \gset
select t.ok(excede_saldo and dias > 10, 'pedir más días de los acumulados se permite y queda marcado') from rrhh_solicitudes where id = :'vac2';
-- Permiso por horas y reposición.
select fn_rrhh_solicitar(null, 'permiso', null, null, '2026-11-20', '08:00', '11:30', 'Cita médica') as per1 \gset
select t.ok(horas = 3.5 and estado = 'pendiente', 'el permiso cuenta 3,5 horas') from rrhh_solicitudes where id = :'per1';
select t.debe_fallar($q$select fn_rrhh_solicitar(null, 'permiso', null, null, '2026-11-20', '10:00', '12:00', 'Otro')$q$, 'en ese horario');
select t.debe_fallar($q$select fn_rrhh_solicitar(null, 'permiso', null, null, '2026-11-21', '12:00', '10:00', 'Mal')$q$, 'rango de horas');
select t.debe_fallar($q$select fn_rrhh_solicitar(null, 'permiso', null, null, '2026-11-21', '08:00', '09:00', '')$q$, 'motivo');
-- No puede registrar para otro empleado, ni aprobar.
select t.debe_fallar(format($q$select fn_rrhh_solicitar(%L, 'permiso', null, null, '2026-11-22', '08:00', '09:00', 'Ajeno')$q$, :'e_sin'), 'otros empleados');
select t.debe_fallar(format($q$select fn_rrhh_resolver(%L, true, null, null)$q$, :'vac1'), 'No tienes permiso para aprobar');
select t.ok(count(*) = 3, 've solo sus propias solicitudes') from rrhh_solicitudes;
select t.ok(fn_rrhh_saldos(:'e_sin') is null, 'no ve el saldo de otro empleado');
reset role;

-- ===== La gerente de RRHH aprueba y registra para quien no tiene usuario.
select t.como('00000000-0000-0000-0000-0000000000a7'); set role authenticated;
select t.ok(count(*) >= 3, 'RRHH ve las solicitudes de la clínica') from rrhh_solicitudes;
select t.debe_fallar(format($q$select fn_rrhh_resolver(%L, true, null, null)$q$, :'per1'), 'se repone, es remunerado o no remunerado');
select fn_rrhh_resolver(:'per1', true, 'se_repone', null);
select fn_rrhh_resolver(:'vac1', true, null, 'Disfrútalas');
select t.ok(s.estado = 'aprobada' and v.dias_tomados = 5 and v.fecha_inicio = :'lun' and s.resuelto_por = '00000000-0000-0000-0000-0000000000a7',
  'aprobar las vacaciones las registra en las del empleado') from rrhh_solicitudes s join vacaciones_empleado v on v.id = s.vacaciones_id where s.id = :'vac1';
select t.debe_fallar(format($q$select fn_rrhh_resolver(%L, false, null, '')$q$, :'vac2'), 'por qué se rechaza');
select fn_rrhh_resolver(:'vac2', false, null, 'No hay reemplazo en enero');
select t.debe_fallar(format($q$select fn_rrhh_resolver(%L, true, null, null)$q$, :'vac2'), 'ya se resolvió');
-- Registra para el empleado sin usuario.
select fn_rrhh_solicitar(:'e_sin', 'permiso', null, null, '2026-11-25', '14:00', '16:00', 'Diligencia') as per_sin \gset
select t.ok(empleado_id = :'e_sin' and solicitado_por = '00000000-0000-0000-0000-0000000000a7', 'RRHH registra la solicitud de quien no tiene usuario')
  from rrhh_solicitudes where id = :'per_sin';
select fn_rrhh_resolver(:'per_sin', true, 'remunerado', null);
-- Su propia solicitud la aprueba otra persona.
select fn_rrhh_solicitar(null, 'permiso', null, null, '2026-11-26', '08:00', '09:00', 'Trámite') as per_ger \gset
select t.debe_fallar(format($q$select fn_rrhh_resolver(%L, true, 'remunerado', null)$q$, :'per_ger'), 'otra persona');
-- Contrato por servicios: sin vacaciones.
select t.debe_fallar(format($q$select fn_rrhh_solicitar(%L, 'vacaciones', '2026-12-14', '2026-12-18', null, null, null, null)$q$, :'e_serv'), 'prestación de servicios');
-- Sábado laboral: lo configura quien edita RRHH.
select fn_rrhh_config_sabado(false);
select t.ok(not rrhh_sabado_laboral, 'RRHH configura el sábado laboral') from clinicas where id = :'clinica_a';
select fn_rrhh_config_sabado(true);
reset role;

-- ===== A2 repone horas y ve su saldo.
select t.como(:'a2'); set role authenticated;
select t.ok((fn_rrhh_saldos(:'e_a2') -> 'horas' ->> 'pendientes')::numeric = 3.5, 'le quedan 3,5 horas por reponer');
select fn_rrhh_solicitar(null, 'reposicion', null, null, '2026-11-28', '08:00', '10:00', 'Sábado') as rep1 \gset
select t.ok((fn_rrhh_saldos(:'e_a2') -> 'horas' ->> 'pendientes')::numeric = 3.5, 'la reposición cuenta solo cuando se aprueba');
select fn_rrhh_solicitar(null, 'permiso', null, null, '2026-11-30', '15:00', '16:00', 'Me arrepiento') as per_cancel \gset
select fn_rrhh_cancelar(:'per_cancel');
select t.ok(estado = 'cancelada', 'puede cancelar su solicitud pendiente') from rrhh_solicitudes where id = :'per_cancel';
select t.debe_fallar(format($q$select fn_rrhh_cancelar(%L)$q$, :'vac1'), 'Solo se cancela una solicitud pendiente');
reset role;
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select fn_rrhh_resolver(:'rep1', true, null, 'Confirmado');
-- El Administrador sí puede aprobar la de la gerente.
select fn_rrhh_resolver(:'per_ger', true, 'remunerado', null);
select t.ok(estado = 'aprobada', 'el Administrador aprueba la solicitud de la gerente') from rrhh_solicitudes where id = :'per_ger';
reset role;
select t.como(:'a2'); set role authenticated;
select t.ok((fn_rrhh_saldos(:'e_a2') -> 'horas' ->> 'pendientes')::numeric = 1.5 and (fn_rrhh_saldos(:'e_a2') -> 'horas' ->> 'repuestas')::numeric = 2,
  'aprobada la reposición, quedan 1,5 horas por reponer');
select t.ok((fn_rrhh_saldos(:'e_a2') -> 'vacaciones' ->> 'tomados')::numeric = 5 and (fn_rrhh_saldos(:'e_a2') -> 'vacaciones' ->> 'disponibles')::numeric = 10,
  'las vacaciones aprobadas descuentan del saldo');
reset role;

-- ===== Avisos y otra clínica.
select t.ok(array_agg(email order by email) = array['a7@x.co', 'a@x.co'], 'aprueban la Administradora y la gerente de RRHH') from fn_rrhh_aprobadores(:'clinica_a');
select t.ok(not has_function_privilege('authenticated', 'fn_rrhh_aprobadores(uuid)', 'execute'), 'la lista de quienes aprueban solo la lee el servidor');
select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok(count(*) = 0, 'otra clínica no ve estas solicitudes') from rrhh_solicitudes;
select t.debe_fallar(format($q$select fn_rrhh_resolver(%L, true, null, null)$q$, :'rep1'), 'no existe');
reset role;
