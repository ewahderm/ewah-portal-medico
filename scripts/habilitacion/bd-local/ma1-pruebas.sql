-- PGIRASA: declaración mensual de cero, aislamiento, conflictos y corrección.
\set ON_ERROR_STOP 1
begin;
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select fn_confirmar_cero_pgirasa('00000000-0000-0000-0000-00000000005a', '2024-01-01') as cero_id \gset
select t.ok(
  (select count(*) = 1
   from pgirasa_ceros_mensuales
   where sede_id = '00000000-0000-0000-0000-00000000005a'
     and mes = '2024-01-01'
     and revocada_en is null),
  'queda una confirmación activa por sede y mes'
);
select t.debe_fallar(
  $$select fn_confirmar_cero_pgirasa('00000000-0000-0000-0000-00000000005a', '2024-01-01')$$,
  'confirmación de cero'
);
select t.debe_fallar(
  $$select fn_confirmar_cero_pgirasa('00000000-0000-0000-0000-00000000005b', '2024-01-01')$$,
  'sede'
);
select t.debe_fallar(
  $$select fn_confirmar_cero_pgirasa('00000000-0000-0000-0000-00000000005a', '2024-02-15')$$,
  'primer día'
);

select t.debe_fallar(
  $$insert into registros_residuos (clinica_id, sede_id, tipo_residuo, peso_kg, fecha, jornada, created_by)
    values (clinica_actual(), '00000000-0000-0000-0000-00000000005a', 'biosanitario', 1, '2024-01-10', 'AM', auth.uid())$$,
  'confirmación de cero'
);
select t.debe_fallar(
  $$insert into registros_residuos (clinica_id, sede_id, tipo_residuo, peso_kg, fecha, jornada, created_by)
    values (clinica_actual(), '00000000-0000-0000-0000-00000000005b', 'aprovechable', 1, '2024-01-10', 'AM', auth.uid())$$,
  'no pertenece'
);
insert into registros_residuos (clinica_id, sede_id, tipo_residuo, peso_kg, fecha, jornada, created_by)
values (clinica_actual(), '00000000-0000-0000-0000-00000000005a', 'aprovechable', 1, '2024-01-10', 'AM', auth.uid());

select fn_revocar_cero_pgirasa(:'cero_id', 'Corrección de una declaración equivocada');
select t.ok(
  (select revocada_en is not null and motivo_revocacion = 'Corrección de una declaración equivocada'
   from pgirasa_ceros_mensuales where id = :'cero_id'),
  'la corrección se conserva con motivo en vez de borrar el antecedente'
);
insert into registros_residuos (clinica_id, sede_id, tipo_residuo, peso_kg, fecha, jornada, created_by)
values (clinica_actual(), '00000000-0000-0000-0000-00000000005a', 'biosanitario', 1, '2024-01-10', 'AM', auth.uid());
select t.debe_fallar(
  $$select fn_confirmar_cero_pgirasa('00000000-0000-0000-0000-00000000005a', '2024-01-01')$$,
  'pesajes de residuos peligrosos'
);
insert into registros_residuos (clinica_id, sede_id, tipo_residuo, peso_kg, fecha, jornada, created_by)
values
  (clinica_actual(), '00000000-0000-0000-0000-00000000005a', 'quimico_toxico', 0.25, '2024-02-10', 'AM', auth.uid()),
  (clinica_actual(), '00000000-0000-0000-0000-00000000005a', 'quimico', 0.5, '2024-02-11', 'AM', auth.uid());
select t.ok(
  (select count(*) = 2 and sum(peso_kg) = 2
   from fn_pgirasa_reporte_sede('00000000-0000-0000-0000-00000000005a', '2024-01-01')
   where tipo_residuo is not null),
  'el reporte agrega los pesajes de la sede propia por categoría'
);
select t.ok(
  (select count(*) = 1 and bool_and(revocada_en is not null)
   from fn_pgirasa_reporte_sede('00000000-0000-0000-0000-00000000005a', '2024-01-01')
   where confirmacion_id = :'cero_id'),
  'el reporte conserva visible la declaración revocada'
);
select t.debe_fallar(
  $$select * from fn_pgirasa_reporte_sede('00000000-0000-0000-0000-00000000005b', '2024-01-01')$$,
  'sede'
);

reset role; select t.como('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
select t.debe_fallar(
  format($$select fn_revocar_cero_pgirasa(%L, 'Sin permiso')$$, :'cero_id'),
  'permiso'
);
select t.debe_fallar(
  $$select * from fn_pgirasa_reporte_sede('00000000-0000-0000-0000-00000000005a', '2024-01-01')$$,
  'permiso'
);
reset role;
select t.ok(
  not has_function_privilege('anon', 'fn_confirmar_cero_pgirasa(uuid,date)', 'execute')
    and not has_function_privilege('anon', 'fn_revocar_cero_pgirasa(uuid,text)', 'execute')
    and not has_function_privilege('anon', 'fn_pgirasa_reporte_sede(uuid,date)', 'execute')
    and not has_table_privilege('authenticated', 'pgirasa_ceros_mensuales', 'INSERT'),
  'las RPC PGIRASA requieren sesión y no existe INSERT directo a confirmaciones'
);
select t.ok(
  fn_residuo_es_peligroso('quimico') and fn_residuo_es_peligroso('cortopunzante')
    and not fn_residuo_es_peligroso('organico') and not fn_residuo_es_peligroso('aprovechable'),
  'una sola lista de tipos peligrosos: el químico histórico cuenta, los no peligrosos no'
);
rollback;
