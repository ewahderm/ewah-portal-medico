-- Datos de SG-SST F1: en la clínica A, 2 empleados laborales (uno con cargo
-- de clase IV), 1 contratista y 1 inactivo.
insert into cargos (id, clinica_id, codigo, nombre, clase_riesgo_id)
select '00000000-0000-0000-0000-0000000005c1', c.id, 'RX', 'Tecnólogo de rayos X', (select id from clases_riesgo where codigo = 'IV' limit 1)
from clinicas c where c.nombre = 'Clinica A';
insert into empleados (id, clinica_id, nombre, activo, tipo_contrato_id)
select x.id, c.id, x.n, x.activo, (select id from tipos_contrato where codigo = x.tipo limit 1)
from clinicas c, (values
  ('00000000-0000-0000-0000-0000000005e1'::uuid, 'SST Laboral 1', true, 'TERMINO_INDEFINIDO'),
  ('00000000-0000-0000-0000-0000000005e2'::uuid, 'SST Laboral 2', true, 'TERMINO_FIJO'),
  ('00000000-0000-0000-0000-0000000005e3'::uuid, 'SST Contratista', true, 'PRESTACION_SERVICIOS'),
  ('00000000-0000-0000-0000-0000000005e4'::uuid, 'SST Retirado', false, 'TERMINO_FIJO')
) as x(id, n, activo, tipo)
where c.nombre = 'Clinica A';
insert into historial_cargos_empleado (clinica_id, empleado_id, cargo_id, fecha_inicio)
select c.id, '00000000-0000-0000-0000-0000000005e2', '00000000-0000-0000-0000-0000000005c1', current_date - 30
from clinicas c where c.nombre = 'Clinica A';
