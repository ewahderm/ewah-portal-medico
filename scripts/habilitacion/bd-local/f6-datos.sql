-- Datos de prueba de F6 (corre después de f5-*): registros de otros módulos
-- en la sede A, y un usuario A3 con rol "Calidad" que tiene Habilitación
-- (VIEW/CREATE/EDIT) pero NO RRHH ni Medio Ambiente ni Inventario.
create temp table ctx6 as select
  (select id from clinicas where nombre = 'Clinica A') as a,
  '00000000-0000-0000-0000-00000000005a'::uuid as sa,
  '00000000-0000-0000-0000-00000000005b'::uuid as sb;

-- RRHH: 2 empleados; Ana con título, tarjeta y vacuna vigente; Luis sin nada.
-- Salario cargado a propósito: ninguna proveedora debe devolverlo.
insert into empleados (id, clinica_id, nombre, activo, numero_tarjeta_profesional)
select '00000000-0000-0000-0000-0000000000e1', a, 'Ana Médica', true, 'TP-123' from ctx6;
insert into empleados (id, clinica_id, nombre, activo) select '00000000-0000-0000-0000-0000000000e2', a, 'Luis Auxiliar', true from ctx6;
insert into documentos_empleado (clinica_id, empleado_id, tipo, storage_path, nombre_archivo, fecha_vencimiento)
select a, '00000000-0000-0000-0000-0000000000e1', t, 'x/' || t, t || '.pdf', v from ctx6,
  (values ('acta_diploma', null::date), ('vacuna', current_date + 200)) as d(t, v);
insert into documentos_empleado (clinica_id, empleado_id, tipo, storage_path, nombre_archivo, fecha_vencimiento)
select a, '00000000-0000-0000-0000-0000000000e2', 'vacuna', 'x/v', 'v.pdf', current_date - 5 from ctx6;
insert into historial_salarios_empleado (clinica_id, empleado_id, salario, fecha_inicio)
select a, '00000000-0000-0000-0000-0000000000e1', 9876543, current_date from ctx6;

-- Medio Ambiente: nevera con 30 días de registros, uno fuera de rango;
-- nevera de la otra sede para probar parámetros.
insert into neveras (id, clinica_id, sede_id, codigo, nombre) select '00000000-0000-0000-0000-0000000000c1', a, sa, 'N1', 'Nevera vacunas' from ctx6;
insert into registros_temperatura_nevera (clinica_id, sede_id, nevera_id, temperatura_celsius, fecha, jornada)
select a, sa, '00000000-0000-0000-0000-0000000000c1', case when g = 3 then 9.5 else 5 end, (now() at time zone 'America/Bogota')::date - g, 'AM'
from ctx6, generate_series(0, 29) g;
insert into extintores (clinica_id, sede_id, tipo_extintor_id, ubicacion, fecha_vencimiento, activo)
select a, sa, (select id from tipos_extintor limit 1), u, v, true from ctx6, (values ('Recepción', current_date + 300), ('Bodega', current_date - 10)) as e(u, v);
insert into registros_residuos (clinica_id, sede_id, tipo_residuo, peso_kg, fecha, jornada)
select a, sa, 'biosanitario', 1.5, current_date - 2, 'AM' from ctx6;

-- Inventario: un insumo sin registro y un lote vencido con existencia.
insert into insumos (id, clinica_id, codigo, nombre, registro_sanitario, activo)
select '00000000-0000-0000-0000-0000000000d1', a, 'TOX', 'Toxina botulínica', 'INVIMA 2020M-1', true from ctx6;
insert into insumos (clinica_id, codigo, nombre, activo) select a, 'GAS', 'Gasa estéril', true from ctx6;
insert into lotes (clinica_id, sede_id, insumo_id, numero_lote, fecha_vencimiento, cantidad_actual, activo)
select a, sa, '00000000-0000-0000-0000-0000000000d1', 'L-01', (now() at time zone 'America/Bogota')::date - 1, 3, true from ctx6;

-- Rol Calidad: solo Habilitación.
insert into roles (id, clinica_id, nombre, nivel) select '00000000-0000-0000-0000-0000000000f2', a, 'Calidad', 2 from ctx6;
insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id, concedido)
select '00000000-0000-0000-0000-0000000000f2', m.id, p.id, true
from modulos m, permisos p where m.codigo = 'habilitacion' and p.codigo in ('VIEW', 'CREATE', 'EDIT');
insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000000a3', 'a3@x.co');
insert into usuarios (id, clinica_id, rol_id, nombre, email)
select '00000000-0000-0000-0000-0000000000a3', a, '00000000-0000-0000-0000-0000000000f2', 'A3 Calidad', 'a3@x.co' from ctx6;

-- Un protocolo de RRHH ya cargado (Habilitación no debe verlo).
insert into documentos_normativos (clinica_id, tipo_documento_id, version, storage_path, nombre_archivo)
select a, (select id from tipos_documento_normativo where codigo = 'MANUAL_FUNCIONES'), 1, a || '/normativos/m.pdf', 'manual.pdf' from ctx6;
