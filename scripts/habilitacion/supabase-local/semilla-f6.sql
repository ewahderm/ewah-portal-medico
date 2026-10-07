-- Prerrequisitos de recorrido-f6.mjs (después de recorrido-f5): personal
-- de RRHH, una nevera con 30 días de registros e insumos de Inventario.
create temp table k as select c.id as a, s.id as sa from clinicas c join sedes s on s.clinica_id = c.id and s.codigo = 'PRINC' where c.nombre = 'EWAH S.A.S.';
insert into empleados (id, clinica_id, nombre, activo, numero_tarjeta_profesional) select gen_random_uuid(), a, 'Dra. Ana Pérez', true, 'TP-123' from k;
insert into empleados (clinica_id, nombre, activo) select a, 'Luis Gómez', true from k;
insert into documentos_empleado (clinica_id, empleado_id, tipo, storage_path, nombre_archivo, fecha_vencimiento)
select k.a, e.id, d.t, 'x/' || d.t, d.t || '.pdf', d.v from k join empleados e on e.clinica_id = k.a and e.nombre = 'Dra. Ana Pérez',
  (values ('acta_diploma', null::date), ('vacuna', current_date + 200)) as d(t, v);
insert into neveras (id, clinica_id, sede_id, codigo, nombre) select gen_random_uuid(), a, sa, 'N1', 'Nevera de toxina' from k;
insert into registros_temperatura_nevera (clinica_id, sede_id, nevera_id, temperatura_celsius, fecha, jornada)
select k.a, k.sa, n.id, 4.5, (now() at time zone 'America/Bogota')::date - g, 'AM' from k join neveras n on n.clinica_id = k.a, generate_series(0, 29) g;
insert into insumos (clinica_id, codigo, nombre, registro_sanitario, activo) select a, 'AH', 'Ácido hialurónico', 'INVIMA 2021DM-1', true from k;
insert into insumos (clinica_id, codigo, nombre, activo) select a, 'GAS', 'Gasa estéril', true from k;
