-- Inventario (0112): un insumo con lote en la sede principal y otro en la
-- Sede Norte de la clínica A (at1), y un lote de la clínica B.
insert into insumos (id, clinica_id, nombre, unidad_medida)
select '00000000-0000-0000-0000-0000000a4101', id, 'Toxina QA', 'ml' from clinicas where nombre = 'Clinica A';
insert into insumos (id, clinica_id, nombre, unidad_medida)
select '00000000-0000-0000-0000-0000000a4102', id, 'Insumo B', 'ml' from clinicas where nombre = 'Clinica B';
insert into lotes (id, clinica_id, insumo_id, sede_id, numero_lote)
select '00000000-0000-0000-0000-0000000a4201', id, '00000000-0000-0000-0000-0000000a4101', '00000000-0000-0000-0000-00000000005a', 'L-PRINCIPAL' from clinicas where nombre = 'Clinica A';
insert into lotes (id, clinica_id, insumo_id, sede_id, numero_lote)
select '00000000-0000-0000-0000-0000000a4202', id, '00000000-0000-0000-0000-0000000a4101', '00000000-0000-0000-0000-0000000a7d01', 'L-NORTE' from clinicas where nombre = 'Clinica A';
insert into lotes (id, clinica_id, insumo_id, sede_id, numero_lote)
select '00000000-0000-0000-0000-0000000a4203', id, '00000000-0000-0000-0000-0000000a4102', '00000000-0000-0000-0000-00000000005b', 'L-B' from clinicas where nombre = 'Clinica B';
insert into movimientos_insumos (clinica_id, lote_id, tipo, motivo_movimiento, cantidad)
select clinica_id, id, 'entrada', 'compra', 100 from lotes where id in (
  '00000000-0000-0000-0000-0000000a4201', '00000000-0000-0000-0000-0000000a4202', '00000000-0000-0000-0000-0000000a4203');
