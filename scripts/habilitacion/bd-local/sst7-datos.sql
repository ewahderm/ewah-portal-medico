-- SG-SST F7: una incapacidad de 5 días en agosto de 2026 del laboral 1.
insert into incapacidades_empleado (clinica_id, empleado_id, fecha_inicio, dias, origen)
select id, '00000000-0000-0000-0000-0000000005e1', '2026-08-28', 5, 'laboral' from clinicas where nombre = 'Clinica A';
