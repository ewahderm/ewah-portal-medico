-- Pruebas de perfil de clínica (0080): backfill, validación, atomicidad y aislamiento.
-- La actividad económica vive en clinicas.codigo_actividad_economica; la
-- columna vieja sst_perfil.codigo_actividad se borra en una migración
-- pendiente (scripts/habilitacion/pendientes/0085_*), no aquí.
begin;
select t.ok(
  (select codigo_actividad_economica = '3862101'
   from clinicas where id = '00000000-0000-0000-0000-000000000080'),
  'el código de actividad anterior se conserva al migrar al perfil de clínica'
);
select t.debe_fallar(
  $$update clinicas set codigo_actividad_economica = '8621' where id = '00000000-0000-0000-0000-000000000080'$$,
  'check'
);

select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select fn_actualizar_perfil_propia_clinica('Clínica A Legal', 'Clínica A', '3862101');
select t.ok(
  (select nombre = 'Clínica A Legal' and nombre_comercial = 'Clínica A'
          and codigo_actividad_economica = '3862101'
   from clinicas where nombre = 'Clínica A Legal'),
  'el administrador guarda ambos nombres y el código de su clínica'
);
select t.ok(
  (select nombre = 'Clínica de prueba perfil 0080'
          and codigo_actividad_economica = '3862101'
   from clinicas where id = '00000000-0000-0000-0000-000000000080'),
  'guardar el perfil de A no altera otra clínica'
);
select t.debe_fallar(
  $$select fn_actualizar_perfil_propia_clinica(' ', 'Marca', '3862101')$$,
  'nombre legal'
);
select t.debe_fallar(
  $$select fn_actualizar_perfil_propia_clinica('Nombre válido', null, '8621')$$,
  'actividad económica'
);

-- Marca ya no toca el nombre comercial (el parámetro se ignora).
select fn_actualizar_marca_propia_clinica('Otra marca', 'avisos@a.co', null);
select t.ok(
  (select nombre_comercial = 'Clínica A' and correo_notificaciones = 'avisos@a.co'
   from clinicas where id = clinica_actual()),
  'la marca guarda el correo sin cambiar el nombre comercial'
);

-- Guardado atómico: un NIT duplicado revierte también el nombre.
select t.debe_fallar(
  $$select fn_guardar_datos_basicos_clinica(
      'Nombre que no debe quedar', null, null, 'MIGRATION-0080',
      (select pais_operacion_id from clinicas where id = clinica_actual()), false,
      null, null, null, null, null, null, null, null, null, null, null)$$,
  'Ya existe otra clínica'
);
select t.ok(
  (select nombre = 'Clínica A Legal' from clinicas where id = clinica_actual()),
  'si el NIT falla, el nombre legal no queda a medio guardar'
);

reset role; select t.como('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
select t.debe_fallar(
  $$select fn_actualizar_perfil_propia_clinica('Nombre', null, null)$$,
  'administrador'
);

reset role;
select t.ok(
  not has_function_privilege(
    'anon',
    'fn_actualizar_perfil_propia_clinica(text,text,text)',
    'execute'
  ),
  'anónimo no puede ejecutar el RPC de perfil clínico'
);
select t.ok(
  not has_function_privilege(
    'anon',
    'fn_actualizar_marca_propia_clinica(text,text,text)',
    'execute'
  ),
  'anónimo no puede ejecutar el RPC de marca'
);
rollback;
