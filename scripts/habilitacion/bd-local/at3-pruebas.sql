-- Pruebas de 0110/0111: la factura electrónica (número, CUFE, PDF/XML) va en
-- el cobro de la atención y el tratamiento ya no tiene CUFE.
\set ON_ERROR_STOP 1
\set cufe 'ABCDEF0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789'
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;
-- El cobro vigente que dejó at2 (en efectivo, por 1.050.000).
select id as cobro, clinica_id as clinica from cobros_atencion where notas is null and not anulado and not automatico and valor = 1050000 \gset
select id as anulado from cobros_atencion where notas = 'Descuento por paquete' \gset

select t.ok(not exists (select 1 from information_schema.columns where table_name = 'tratamientos' and column_name = 'cufe'),
  'el tratamiento ya no tiene CUFE');

-- Número y CUFE (con espacios y mayúsculas: se normaliza).
select fn_cobro_factura(:'cobro', ' FE-1001 ', ' ' || :'cufe' || ' ');
select t.ok(factura_numero = 'FE-1001' and factura_cufe = lower(:'cufe') and factura_actualizada_por = auth.uid() and factura_actualizada_en is not null,
  'el cobro guarda número y CUFE normalizados, con quién y cuándo') from cobros_atencion where id = :'cobro';
select t.ok(valor = 1050000 and not anulado, 'lo cobrado no cambia al registrar la factura') from cobros_atencion where id = :'cobro';
select t.debe_fallar(format($q$select fn_cobro_factura(%L, 'FE-1', 'abc123')$q$, :'cobro'), '96 caracteres');
select t.debe_fallar(format($q$select fn_cobro_factura(%L, repeat('9', 41), null)$q$, :'cobro'), 'demasiado largo');
select t.debe_fallar(format($q$select fn_cobro_factura(%L, 'FE-2', %L)$q$, :'anulado', :'cufe'), 'anulado');
-- Corregir: cambia y queda en la auditoría.
select fn_cobro_factura(:'cobro', 'FE-1002', :'cufe');
select t.ok(factura_numero = 'FE-1002', 'la factura se puede corregir') from cobros_atencion where id = :'cobro';
reset role;
select t.ok(count(*) >= 2, 'cada cambio de la factura queda en la auditoría')
  from auditoria where tabla = 'cobros_atencion' and registro_id = :'cobro'::uuid and accion = 'UPDATE';
select t.como('00000000-0000-0000-0000-00000000000a'); set role authenticated;

-- Archivos: la ruta debe ser de este cobro.
select fn_cobro_factura_archivo(:'cobro', 'pdf', :'clinica' || '/' || :'cobro' || '/factura-1.pdf');
select fn_cobro_factura_archivo(:'cobro', 'xml', :'clinica' || '/' || :'cobro' || '/factura-1.xml');
select t.ok(factura_pdf_path like '%/factura-1.pdf' and factura_xml_path like '%/factura-1.xml', 'guarda la ruta del PDF y del XML') from cobros_atencion where id = :'cobro';
select t.debe_fallar(format($q$select fn_cobro_factura_archivo(%L, 'pdf', 'otra-clinica/x/f.pdf')$q$, :'cobro'), 'no corresponde');
select t.debe_fallar(format($q$select fn_cobro_factura_archivo(%L, 'zip', null)$q$, :'cobro'), 'inválido');
select fn_cobro_factura_archivo(:'cobro', 'xml', null);
select t.ok(factura_xml_path is null, 'un archivo se puede quitar') from cobros_atencion where id = :'cobro';

-- El valor y el medio siguen sin poder editarse por la API.
update cobros_atencion set factura_numero = 'X', valor = 1 where id = :'cobro';
select t.ok(valor = 1050000 and factura_numero = 'FE-1002', 'sin las funciones, el cobro no se edita') from cobros_atencion where id = :'cobro';
reset role;

-- Sin permiso de tratamientos (contador) y otra clínica.
select t.como('00000000-0000-0000-0000-0000000f3c01'); set role authenticated;
select t.debe_fallar(format($q$select fn_cobro_factura(%L, 'FE-9', null)$q$, :'cobro'), 'permiso');
select t.ok(factura_numero = 'FE-1002', 'finanzas ve la factura del cobro') from cobros_atencion where id = :'cobro';
reset role;
select t.como('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.debe_fallar(format($q$select fn_cobro_factura(%L, 'FE-9', null)$q$, :'cobro'), 'no existe');
reset role;
