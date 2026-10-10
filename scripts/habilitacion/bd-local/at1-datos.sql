-- Atención en un consultorio (0108): un consultorio en cada clínica.
insert into consultorios (id, clinica_id, codigo, nombre, sede_id)
select '00000000-0000-0000-0000-0000000a7c01', c.id, 'AT1', 'Consultorio At1', '00000000-0000-0000-0000-00000000005a'
from clinicas c where c.nombre = 'Clinica A';
insert into consultorios (id, clinica_id, codigo, nombre, sede_id)
select '00000000-0000-0000-0000-0000000a7c02', c.id, 'AT1', 'Consultorio At1 B', '00000000-0000-0000-0000-00000000005b'
from clinicas c where c.nombre = 'Clinica B';
-- Una segunda sede en A, para comprobar que el tratamiento no la toma.
insert into sedes (id, clinica_id, codigo, nombre, orden)
select '00000000-0000-0000-0000-0000000a7d01', c.id, 'AT1', 'Sede Norte', 2
from clinicas c where c.nombre = 'Clinica A';
