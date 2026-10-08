-- Flujo de caja FC1: un empleado de la clínica A que es socio.
insert into empleados (id, clinica_id, nombre, activo)
select '00000000-0000-0000-0000-0000000f1e01', id, 'Socia Empleada', true from clinicas where nombre = 'Clinica A';
