-- RRHH 0107 (solicitudes): en la clínica A, una gerente de RRHH (rol con
-- rrhh VIEW/CREATE/EDIT/APPROVE, sin ser Administradora), A2 (Recepción,
-- sin acceso a RRHH) vinculada a un empleado laboral con un año de
-- contrato, un empleado laboral sin usuario y uno por servicios.
insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000a7', 'a7@x.co');
insert into roles (id, clinica_id, nombre, nivel)
select '00000000-0000-0000-0000-0000000000f7', id, 'Gerente de Recursos Humanos', 2 from clinicas where nombre = 'Clinica A';
insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id)
select '00000000-0000-0000-0000-0000000000f7', m.id, p.id from modulos m, permisos p
where m.codigo = 'rrhh' and p.codigo in ('VIEW', 'CREATE', 'EDIT', 'APPROVE');
insert into usuarios (id, clinica_id, rol_id, nombre, email)
select '00000000-0000-0000-0000-0000000000a7', id, '00000000-0000-0000-0000-0000000000f7', 'Gerente RRHH', 'a7@x.co' from clinicas where nombre = 'Clinica A';

insert into empleados (id, clinica_id, nombre, activo, tipo_contrato_id, fecha_inicio_contrato, usuario_id)
select '00000000-0000-0000-0000-0000000e0a02', id, 'Empleada A2', true, (select id from tipos_contrato where codigo = 'TERMINO_INDEFINIDO'), ((now() at time zone 'America/Bogota')::date - interval '1 year')::date,
  '00000000-0000-0000-0000-0000000000a2' from clinicas where nombre = 'Clinica A';
insert into empleados (id, clinica_id, nombre, activo, tipo_contrato_id, fecha_inicio_contrato, usuario_id)
select '00000000-0000-0000-0000-0000000e0a03', id, 'Gerente RRHH', true, (select id from tipos_contrato where codigo = 'TERMINO_INDEFINIDO'), ((now() at time zone 'America/Bogota')::date - interval '3 years')::date,
  '00000000-0000-0000-0000-0000000000a7' from clinicas where nombre = 'Clinica A';
insert into empleados (id, clinica_id, nombre, activo, tipo_contrato_id, fecha_inicio_contrato)
select '00000000-0000-0000-0000-0000000e0a04', id, 'Auxiliar sin usuario', true, (select id from tipos_contrato where codigo = 'TERMINO_INDEFINIDO'), ((now() at time zone 'America/Bogota')::date - interval '2 months')::date
from clinicas where nombre = 'Clinica A';
insert into empleados (id, clinica_id, nombre, activo, tipo_contrato_id, fecha_inicio_contrato)
select '00000000-0000-0000-0000-0000000e0a05', id, 'Contratista', true, (select id from tipos_contrato where codigo = 'PRESTACION_SERVICIOS'), ((now() at time zone 'America/Bogota')::date - interval '1 year')::date
from clinicas where nombre = 'Clinica A';
