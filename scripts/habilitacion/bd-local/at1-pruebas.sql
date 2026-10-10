-- Pruebas de 0108: la atención ocurre en un consultorio de una sede y sus
-- tratamientos heredan (y guardan) ese lugar.
\set ON_ERROR_STOP 1
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;

-- La sede de la atención sale del consultorio.
insert into atenciones (clinica_id, paciente_id, profesional_id, fecha, consultorio_id, created_by)
values (clinica_actual(), '00000000-0000-0000-0000-000000000321', auth.uid(), '2026-10-01', '00000000-0000-0000-0000-0000000a7c01', auth.uid())
returning id as atencion \gset
select t.ok(sede_id = '00000000-0000-0000-0000-00000000005a', 'la atención toma la sede de su consultorio') from atenciones where id = :'atencion';

-- Un consultorio de otra clínica no sirve (ni se ve).
select t.debe_fallar(format($q$insert into atenciones (clinica_id, paciente_id, profesional_id, fecha, consultorio_id) values (clinica_actual(), '00000000-0000-0000-0000-000000000321', auth.uid(), '2026-10-01', '00000000-0000-0000-0000-0000000a7c02')$q$), 'consultorio indicado no es válido');
select t.debe_fallar(format($q$insert into atenciones (clinica_id, paciente_id, profesional_id, fecha, sede_id) values (clinica_actual(), '00000000-0000-0000-0000-000000000321', auth.uid(), '2026-10-01', '00000000-0000-0000-0000-00000000005b')$q$), 'sede indicada no es válida');

-- El tratamiento hereda sede y consultorio aunque el formulario mande otra sede.
insert into tratamientos (clinica_id, paciente_id, tipo_tratamiento_id, profesional_id, atencion_id, fecha, costo, sede_id, medio_pago_id, created_by)
values (clinica_actual(), '00000000-0000-0000-0000-000000000321', '00000000-0000-0000-0000-000000000301', auth.uid(), :'atencion', '2026-10-01', 1000,
  '00000000-0000-0000-0000-0000000a7d01', '00000000-0000-0000-0000-000000000311', auth.uid())
returning id as trat \gset
select t.ok(sede_id = '00000000-0000-0000-0000-00000000005a' and consultorio_id = '00000000-0000-0000-0000-0000000a7c01',
  'el tratamiento guarda la sede y el consultorio de su atención') from tratamientos where id = :'trat';

-- El lugar del tratamiento no se puede cambiar después.
select t.debe_fallar(format($q$update tratamientos set consultorio_id = null where id = %L$q$, :'trat'), 'solo anular');

-- Atención sin lugar (como las del legado): se respeta la sede del formulario.
insert into atenciones (clinica_id, paciente_id, profesional_id, fecha, created_by)
values (clinica_actual(), '00000000-0000-0000-0000-000000000321', auth.uid(), '2026-10-02', auth.uid())
returning id as legado \gset
insert into tratamientos (clinica_id, paciente_id, tipo_tratamiento_id, profesional_id, atencion_id, fecha, costo, sede_id, medio_pago_id, created_by)
values (clinica_actual(), '00000000-0000-0000-0000-000000000321', '00000000-0000-0000-0000-000000000301', auth.uid(), :'legado', '2026-10-02', 1000,
  '00000000-0000-0000-0000-0000000a7d01', '00000000-0000-0000-0000-000000000311', auth.uid())
returning id as trat_legado \gset
select t.ok(sede_id = '00000000-0000-0000-0000-0000000a7d01' and consultorio_id is null,
  'si la atención no tiene lugar, el tratamiento conserva la sede que trae') from tratamientos where id = :'trat_legado';

-- Atención solo con sede (clínica sin consultorios): se guarda y se hereda.
insert into atenciones (clinica_id, paciente_id, profesional_id, fecha, sede_id, created_by)
values (clinica_actual(), '00000000-0000-0000-0000-000000000321', auth.uid(), '2026-10-03', '00000000-0000-0000-0000-0000000a7d01', auth.uid())
returning id as solo_sede \gset
insert into tratamientos (clinica_id, paciente_id, tipo_tratamiento_id, profesional_id, atencion_id, fecha, costo, sede_id, medio_pago_id, created_by)
values (clinica_actual(), '00000000-0000-0000-0000-000000000321', '00000000-0000-0000-0000-000000000301', auth.uid(), :'solo_sede', '2026-10-03', 1000,
  '00000000-0000-0000-0000-00000000005a', '00000000-0000-0000-0000-000000000311', auth.uid())
returning id as trat_sede \gset
select t.ok(sede_id = '00000000-0000-0000-0000-0000000a7d01' and consultorio_id is null,
  'una atención con solo sede también la hereda al tratamiento') from tratamientos where id = :'trat_sede';

reset role;
