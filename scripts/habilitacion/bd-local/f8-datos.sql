-- Datos de prueba de F8: tres clínicas IPS privadas con PEDT (grupos D2, C2
-- y D1) para cotejar las fechas con el oráculo de reportes.json
-- (fechas_2026_2027, validación 8 del script de siembra).
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000008d2', 'd2@x.co'), ('00000000-0000-0000-0000-0000000008c2', 'c2@x.co'),
  ('00000000-0000-0000-0000-0000000008d1', 'd1@x.co');
create temp table g8 as select
  bootstrap_clinica('Clinica D2', 'NIT-D2', '00000000-0000-0000-0000-0000000008d2', 'Admin D2', 'd2@x.co') as d2,
  bootstrap_clinica('Clinica C2', 'NIT-C2', '00000000-0000-0000-0000-0000000008c2', 'Admin C2', 'c2@x.co') as c2,
  bootstrap_clinica('Clinica D1', 'NIT-D1', '00000000-0000-0000-0000-0000000008d1', 'Admin D1', 'd1@x.co') as d1;
insert into hab_perfil_prestador (clinica_id, tipo_prestador, estado_reps, naturaleza, grupo_supersalud, realiza_pedt)
select x.id, 'ips', 'no_inscrito', 'privada', x.g, true
from g8, lateral (values (d2, 'D2'), (c2, 'C2'), (d1, 'D1')) as x(id, g);
