-- SG-SST F8: un accidente de ayer sin reportar en la clínica A.
insert into accidentes_trabajo (id, clinica_id, empleado_id, fecha, resumen, tipo_evento, gravedad)
select '00000000-0000-0000-0000-0000000009a1', id, '00000000-0000-0000-0000-0000000005e2', (now() at time zone 'America/Bogota')::date - 1,
  'Pinchazo con aguja al recoger material', 'accidente', 'leve'
from clinicas where nombre = 'Clinica A';
-- 0087: un accidente GRAVE de ayer con la ARL ya reportada (faltan EPS y MinTrabajo)...
insert into accidentes_trabajo (id, clinica_id, empleado_id, fecha, resumen, tipo_evento, gravedad, reportado_arl, fecha_reporte_arl)
select '00000000-0000-0000-0000-0000000009a2', id, '00000000-0000-0000-0000-0000000005e2', (now() at time zone 'America/Bogota')::date - 1,
  'Caída desde escalera con fractura', 'accidente', 'grave', true, (now() at time zone 'America/Bogota')::date
from clinicas where nombre = 'Clinica A';
-- ...y uno CERRADO sin reportes registrados: no debe alertar.
insert into accidentes_trabajo (id, clinica_id, empleado_id, fecha, resumen, tipo_evento, gravedad, cerrado, fecha_cierre)
select '00000000-0000-0000-0000-0000000009a3', id, '00000000-0000-0000-0000-0000000005e2', (now() at time zone 'America/Bogota')::date - 1,
  'Evento ya cerrado', 'accidente', 'leve', true, (now() at time zone 'America/Bogota')::date
from clinicas where nombre = 'Clinica A';
