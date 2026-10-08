-- Flujo de caja FC2: un proveedor de la clínica A.
insert into proveedores (id, clinica_id, numero_identificacion, nombre)
select '00000000-0000-0000-0000-0000000f2001', id, '900123456', 'Insumos Médicos SAS' from clinicas where nombre = 'Clinica A';
