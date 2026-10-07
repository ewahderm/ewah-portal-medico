-- Datos de prueba de F7 (corre después de f5/f6): perfil IPS de la clínica A
-- y un usuario A4 con rol "Consulta" que solo tiene habilitacion/VIEW.
insert into hab_perfil_prestador (clinica_id, tipo_prestador, estado_reps, naturaleza, grupo_supersalud)
select id, 'ips', 'no_inscrito', 'privada', 'D2' from clinicas where nombre = 'Clinica A';

insert into roles (id, clinica_id, nombre, nivel)
select '00000000-0000-0000-0000-0000000000f3', id, 'Consulta', 3 from clinicas where nombre = 'Clinica A';
insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id, concedido)
select '00000000-0000-0000-0000-0000000000f3', m.id, p.id, true
from modulos m, permisos p where m.codigo = 'habilitacion' and p.codigo = 'VIEW';
insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000a4', 'a4@x.co');
insert into usuarios (id, clinica_id, rol_id, nombre, email)
select '00000000-0000-0000-0000-0000000000a4', id, '00000000-0000-0000-0000-0000000000f3', 'A4 Consulta', 'a4@x.co' from clinicas where nombre = 'Clinica A';
