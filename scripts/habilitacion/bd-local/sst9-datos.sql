-- SG-SST F8: un accidente de ayer sin reportar en la clínica A.
insert into accidentes_trabajo (id, clinica_id, empleado_id, fecha, resumen, tipo_evento, gravedad)
select '00000000-0000-0000-0000-0000000009a1', id, '00000000-0000-0000-0000-0000000005e2', (now() at time zone 'America/Bogota')::date - 1,
  'Pinchazo con aguja al recoger material', 'accidente', 'leve'
from clinicas where nombre = 'Clinica A';
