-- Precio y cobro por atención (0109): un segundo tipo de tratamiento en la
-- clínica A para cobrar dos tratamientos en la misma atención.
insert into tipos_tratamiento (id, clinica_id, codigo, nombre)
select '00000000-0000-0000-0000-0000000a7e01', c.id, 'AT2_TOXINA', 'Toxina'
from clinicas c where c.nombre = 'Clinica A';
