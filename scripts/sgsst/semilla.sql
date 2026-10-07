-- Datos previos de los recorridos del SG-SST sobre el Supabase local de
-- scripts/habilitacion/supabase-local/levantar.sh: personal de la clínica
-- EWAH (2 laborales y 1 contratista), un cargo de clase III y, para F6, la
-- Enfermera Uno en ese cargo con examen de ingreso de hace 380 días.
insert into cargos (clinica_id, codigo, nombre, clase_riesgo_id)
select id, 'AUX', 'Auxiliar de enfermería', (select id from clases_riesgo where codigo = 'III' limit 1) from clinicas where nombre = 'EWAH S.A.S.';
insert into empleados (clinica_id, nombre, activo, tipo_contrato_id)
select c.id, x.n, true, (select id from tipos_contrato where codigo = x.t limit 1) from clinicas c,
  (values ('Enfermera Uno', 'TERMINO_INDEFINIDO'), ('Auxiliar Dos', 'TERMINO_FIJO'), ('Dermatóloga Contratista', 'PRESTACION_SERVICIOS')) x(n, t)
where c.nombre = 'EWAH S.A.S.';
insert into historial_cargos_empleado (clinica_id, empleado_id, cargo_id, fecha_inicio)
select e.clinica_id, e.id, (select id from cargos where codigo = 'AUX' and clinica_id = e.clinica_id), current_date - 400
from empleados e where e.nombre = 'Enfermera Uno';
insert into documentos_empleado (clinica_id, empleado_id, tipo, tipo_examen_id, storage_path, nombre_archivo, fecha_evento)
select e.clinica_id, e.id, 'examen_ocupacional', (select id from tipos_examen_ocupacional where codigo = 'INGRESO'), 'x/ingreso.pdf', 'ingreso.pdf', current_date - 380
from empleados e where e.nombre = 'Enfermera Uno';
