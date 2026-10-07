insert into tipos_tratamiento (id, clinica_id, codigo, nombre)
select '00000000-0000-0000-0000-000000000301', c.id, 'REPORTE_TEST', 'Tratamiento Reporte'
from clinicas c where c.nombre = 'Clinica A';
insert into tipos_tratamiento (id, clinica_id, codigo, nombre)
select '00000000-0000-0000-0000-000000000302', c.id, 'REPORTE_TEST', 'Tratamiento Reporte'
from clinicas c where c.nombre = 'Clinica B';
-- Homónimo a propósito: mismo nombre, otro id. La analítica agrupa por id,
-- así que deben salir como dos filas y no sumarse.
insert into tipos_tratamiento (id, clinica_id, codigo, nombre)
select '00000000-0000-0000-0000-000000000303', c.id, 'REPORTE_TEST_2', 'Tratamiento Reporte'
from clinicas c where c.nombre = 'Clinica A';

insert into medios_pago (id, clinica_id, codigo, nombre)
select '00000000-0000-0000-0000-000000000311', c.id, 'REPORTE_TEST', 'Medio Reporte'
from clinicas c where c.nombre = 'Clinica A';
insert into medios_pago (id, clinica_id, codigo, nombre)
select '00000000-0000-0000-0000-000000000312', c.id, 'REPORTE_TEST', 'Medio Reporte'
from clinicas c where c.nombre = 'Clinica B';

insert into pacientes (
  id, clinica_id, tipo_identificacion_id, numero_identificacion,
  primer_nombre, primer_apellido, pais_residencia_id
)
select
  '00000000-0000-0000-0000-000000000321', c.id,
  (select id from tipos_identificacion order by id limit 1),
  'REPORTE-A-1', 'Paciente', 'Colombia',
  (select id from paises where codigo = 'CO')
from clinicas c where c.nombre = 'Clinica A';
insert into pacientes (
  id, clinica_id, tipo_identificacion_id, numero_identificacion,
  primer_nombre, primer_apellido, pais_residencia_id
)
select
  '00000000-0000-0000-0000-000000000322', c.id,
  (select id from tipos_identificacion order by id limit 1),
  'REPORTE-A-2', 'Paciente', 'Sin Pais', null
from clinicas c where c.nombre = 'Clinica A';
insert into pacientes (
  id, clinica_id, tipo_identificacion_id, numero_identificacion,
  primer_nombre, primer_apellido, pais_residencia_id
)
select
  '00000000-0000-0000-0000-000000000323', c.id,
  (select id from tipos_identificacion order by id limit 1),
  'REPORTE-B-1', 'Paciente', 'Otra Clinica',
  (select id from paises where codigo = 'CO')
from clinicas c where c.nombre = 'Clinica B';

insert into tratamientos (
  id, clinica_id, paciente_id, tipo_tratamiento_id, profesional_id,
  fecha, costo, sede_id, medio_pago_id, created_by
)
select
  '00000000-0000-0000-0000-000000000331', c.id, p.id, tt.id, u.id,
  '2025-01-10', 400, s.id, mp.id, u.id
from clinicas c
join pacientes p on p.id = '00000000-0000-0000-0000-000000000321'
join tipos_tratamiento tt on tt.id = '00000000-0000-0000-0000-000000000301'
join usuarios u on u.clinica_id = c.id and u.nombre = 'Admin A'
join sedes s on s.clinica_id = c.id
join medios_pago mp on mp.id = '00000000-0000-0000-0000-000000000311'
where c.nombre = 'Clinica A';
insert into tratamientos (
  id, clinica_id, paciente_id, tipo_tratamiento_id, profesional_id,
  fecha, costo, sede_id, medio_pago_id, created_by
)
select
  '00000000-0000-0000-0000-000000000332', c.id, p.id, tt.id, u.id,
  '2025-02-10', null, s.id, mp.id, u.id
from clinicas c
join pacientes p on p.id = '00000000-0000-0000-0000-000000000322'
join tipos_tratamiento tt on tt.id = '00000000-0000-0000-0000-000000000303'
join usuarios u on u.clinica_id = c.id and u.nombre = 'Admin A'
join sedes s on s.clinica_id = c.id
join medios_pago mp on mp.id = '00000000-0000-0000-0000-000000000311'
where c.nombre = 'Clinica A';
insert into tratamientos (
  id, clinica_id, paciente_id, tipo_tratamiento_id, profesional_id,
  fecha, costo, anulado, anulado_motivo, anulado_por, anulado_en,
  sede_id, medio_pago_id, created_by
)
select
  '00000000-0000-0000-0000-000000000333', c.id, p.id, tt.id, u.id,
  '2025-02-12', 900, true, 'Fixture de prueba', u.id, now(),
  s.id, mp.id, u.id
from clinicas c
join pacientes p on p.id = '00000000-0000-0000-0000-000000000321'
join tipos_tratamiento tt on tt.id = '00000000-0000-0000-0000-000000000301'
join usuarios u on u.clinica_id = c.id and u.nombre = 'Admin A'
join sedes s on s.clinica_id = c.id
join medios_pago mp on mp.id = '00000000-0000-0000-0000-000000000311'
where c.nombre = 'Clinica A';
insert into tratamientos (
  id, clinica_id, paciente_id, tipo_tratamiento_id, profesional_id,
  fecha, costo, sede_id, medio_pago_id, created_by
)
select
  '00000000-0000-0000-0000-000000000334', c.id, p.id, tt.id, u.id,
  '2025-01-11', 2000, s.id, mp.id, u.id
from clinicas c
join pacientes p on p.id = '00000000-0000-0000-0000-000000000323'
join tipos_tratamiento tt on tt.id = '00000000-0000-0000-0000-000000000302'
join usuarios u on u.clinica_id = c.id and u.nombre = 'Admin B'
join sedes s on s.clinica_id = c.id
join medios_pago mp on mp.id = '00000000-0000-0000-0000-000000000312'
where c.nombre = 'Clinica B';
