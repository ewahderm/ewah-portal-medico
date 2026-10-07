-- SG-SST F7: una incapacidad de 5 días en agosto de 2026 del laboral 1.
insert into incapacidades_empleado (clinica_id, empleado_id, fecha_inicio, dias, origen)
select id, '00000000-0000-0000-0000-0000000005e1', '2026-08-28', 5, 'laboral' from clinicas where nombre = 'Clinica A';

-- 0087 · severidad y ausentismo con bases homogéneas (clínica A, empleado laboral 1).
-- AT de marzo con incapacidad registrada en RRHH (10 días desde el 26-mar: 6 en marzo y 4 en abril)
-- y un "dias_incapacidad" digitado a mano (99) que NO debe pesar si hay incapacidades ligadas.
insert into accidentes_trabajo (id, clinica_id, empleado_id, fecha, resumen, tipo_evento, gravedad, dias_incapacidad)
select '00000000-0000-0000-0000-0000000007a1', id, '00000000-0000-0000-0000-0000000005e1', '2026-03-26', 'AT con incapacidad registrada', 'accidente', 'leve', 99
from clinicas where nombre = 'Clinica A';
insert into incapacidades_empleado (clinica_id, empleado_id, fecha_inicio, dias, origen, accidente_trabajo_id)
select id, '00000000-0000-0000-0000-0000000005e1', '2026-03-26', 10, 'laboral', '00000000-0000-0000-0000-0000000007a1'
from clinicas where nombre = 'Clinica A';
-- AT de mayo sin incapacidades ligadas: se usan los 5 días digitados, contados desde el 28-may (4 en mayo, 1 en junio).
insert into accidentes_trabajo (id, clinica_id, empleado_id, fecha, resumen, tipo_evento, gravedad, dias_incapacidad)
select '00000000-0000-0000-0000-0000000007a2', id, '00000000-0000-0000-0000-0000000005e1', '2026-05-28', 'AT con días digitados', 'accidente', 'leve', 5
from clinicas where nombre = 'Clinica A';
-- Dos incapacidades que se cruzan (lun 6 a vie 10 y mié 8 a dom 12 de julio): 5 días hábiles distintos, no 8.
insert into incapacidades_empleado (clinica_id, empleado_id, fecha_inicio, dias, origen)
select id, '00000000-0000-0000-0000-0000000005e2', x.f, 5, 'enfermedad_general'
from clinicas, (values ('2026-07-06'::date), ('2026-07-08'::date)) x(f) where nombre = 'Clinica A';
