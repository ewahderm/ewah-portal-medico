-- SG-SST F3: un usuario de la clínica A con permisos de SST pero SIN RRHH.
insert into roles (id, clinica_id, nombre, nivel)
select '00000000-0000-0000-0000-0000000005f1', id, 'Responsable SST', 3 from clinicas where nombre = 'Clinica A';
insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id, concedido)
select '00000000-0000-0000-0000-0000000005f1', m.id, p.id, true
from modulos m, permisos p where m.codigo = 'sst' and p.codigo in ('VIEW', 'CREATE', 'EDIT');
insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000005a5', 'sst@x.co');
insert into usuarios (id, clinica_id, rol_id, nombre, email)
select '00000000-0000-0000-0000-0000000005a5', id, '00000000-0000-0000-0000-0000000005f1', 'Responsable SST', 'sst@x.co' from clinicas where nombre = 'Clinica A';
