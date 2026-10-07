-- SG-SST F6: un examen de ingreso (soporte de RRHH) para el laboral 2 y una
-- vacuna vencida para el laboral 1 (clínica A).
insert into documentos_empleado (clinica_id, empleado_id, tipo, tipo_examen_id, storage_path, nombre_archivo, fecha_evento)
select c.id, '00000000-0000-0000-0000-0000000005e2', 'examen_ocupacional', (select id from tipos_examen_ocupacional where codigo = 'INGRESO'), 'x/ingreso.pdf', 'ingreso.pdf', '2025-10-01'
from clinicas c where c.nombre = 'Clinica A';
insert into documentos_empleado (clinica_id, empleado_id, tipo, storage_path, nombre_archivo, fecha_vencimiento)
select c.id, '00000000-0000-0000-0000-0000000005e1', 'vacuna', 'x/vacuna.pdf', 'vacuna.pdf', '2026-01-01'
from clinicas c where c.nombre = 'Clinica A';
