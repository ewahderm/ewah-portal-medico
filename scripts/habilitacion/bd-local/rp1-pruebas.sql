\set ON_ERROR_STOP 1
begin;
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select t.ok(
  (select cantidad = 2 and cantidad_con_valor = 1 and valor_registrado = 400
   from fn_reportes_analitica_clinica('2025-01-01', '2025-02-28')
   where dimension = 'resumen'),
  'el resumen de A incluye solo tratamientos propios no anulados y separa costo nulo'
);
select t.ok(
  (select cantidad = 1 and valor_registrado = 0
   from fn_reportes_analitica_clinica('2025-02-01', '2025-02-28')
   where dimension = 'mes' and periodo = '2025-02-01'),
  'los meses sin valor quedan en cero sin perder el conteo de tratamientos'
);
select t.ok(
  (select cantidad = 1 and nombre = 'Sin país informado' and pais_iso is null
   from fn_reportes_analitica_clinica('2025-01-01', '2025-02-28')
   where dimension = 'pais' and clave = '__sin_pais__'),
  'los pacientes sin país permanecen en un agregado explícito'
);
select t.ok(
  (select count(*) = 2
     and bool_and(nombre = 'Tratamiento Reporte' and cantidad = 1)
     and bool_or(clave = '00000000-0000-0000-0000-000000000301')
     and bool_or(clave = '00000000-0000-0000-0000-000000000303')
   from fn_reportes_analitica_clinica('2025-01-01', '2025-02-28')
   where dimension = 'tratamiento'),
  'dos tipos homónimos se agrupan por id y no se suman en una sola fila'
);
select t.ok(
  (select count(*) = 1 and bool_and(cantidad = 2 and clave = (select id::text from usuarios where nombre = 'Admin A'))
   from fn_reportes_analitica_clinica('2025-01-01', '2025-02-28')
   where dimension = 'profesional'),
  'el profesional se identifica por su id, con el nombre solo para mostrar'
);
select t.ok(
  (select count(*) = 0 from fn_reportes_analitica_clinica('2025-03-01', '2025-03-31')
   where dimension = 'pais'),
  'no se incluyen países sin tratamientos en el rango'
);
select t.debe_fallar(
  $$select * from fn_reportes_analitica_clinica('2025-02-01', '2025-01-01')$$,
  'rango de fechas'
);
-- 0088: varios años seguidos sí se pueden consultar y los totales no cambian
-- por ensanchar el rango (los tratamientos de la fixture son de 2025).
select t.ok(
  (select sum(cantidad) from fn_reportes_analitica_clinica('2020-01-01', '2026-10-07') where dimension = 'resumen')
  = (select sum(cantidad) from fn_reportes_analitica_clinica('2025-01-01', '2025-02-28') where dimension = 'resumen'),
  'un rango de varios años devuelve los mismos totales cuando los datos caben en el rango corto'
);
select t.ok(
  (select count(*) from fn_reportes_analitica_clinica('2016-01-02', '2026-01-01') where dimension = 'mes') >= 100,
  'la tendencia de 10 años trae una fila por mes'
);
-- Tope exacto: 3.653 días con el primero y el último; un día más se rechaza.
-- Si el límite no se aceptara, la función lanzaría y esta consulta abortaría.
select t.ok(
  (select count(*) from fn_reportes_analitica_clinica('2015-01-02', '2025-01-01')) >= 0,
  'el límite exacto de 10 años se acepta'
);
select t.debe_fallar(
  $$select * from fn_reportes_analitica_clinica('2015-01-01', '2025-01-01')$$,
  '10 años'
);

reset role; select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok(
  (select cantidad = 1 and valor_registrado = 2000
   from fn_reportes_analitica_clinica('2025-01-01', '2025-02-28')
   where dimension = 'resumen'),
  'la misma RPC devuelve solo agregados de la clínica B en su sesión'
);

reset role; select t.como('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
select t.debe_fallar(
  $$select * from fn_reportes_analitica_clinica('2025-01-01', '2025-02-28')$$,
  'permisos'
);

reset role;
select t.ok(
  not has_function_privilege('anon', 'fn_reportes_analitica_clinica(date,date)', 'execute'),
  'el rol anon no puede ejecutar el agregado'
);
rollback;

begin;
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select t.ok(
  exists (select 1 from fn_modulos_nav_visibles() where codigo = 'reportes'),
  'el menú devuelve el módulo habilitado para administradores'
);
reset role; select t.como('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
select t.ok(
  not exists (select 1 from fn_modulos_nav_visibles() where codigo = 'reportes'),
  'el menú no expone módulos sin permiso de lectura'
);
reset role;
select t.ok(
  not has_function_privilege('anon', 'fn_modulos_nav_visibles()', 'execute'),
  'el rol anon no puede consultar módulos del menú'
);
rollback;
