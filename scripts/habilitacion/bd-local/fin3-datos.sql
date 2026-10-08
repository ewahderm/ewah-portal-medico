-- Flujo de caja FC3: medios de pago y una cuenta de pasarela en la clínica A
-- (paciente 321, tipo 301 y atención 341 vienen de rp1). En la clínica B,
-- sin flujo de caja, un medio para probar que sus tratamientos no generan nada.
insert into medios_pago (id, clinica_id, codigo, nombre)
select v.id::uuid, c.id, v.codigo, v.nombre
from clinicas c, (values
  ('00000000-0000-0000-0000-0000000f3001', 'FC3_BOLD', 'Datáfono Bold'),
  ('00000000-0000-0000-0000-0000000f3002', 'FC3_CREDITO', 'Crédito'),
  ('00000000-0000-0000-0000-0000000f3003', 'FC3_SIN', 'Sin cuenta aún')
) as v(id, codigo, nombre)
where c.nombre = 'Clinica A';
insert into fin_cuentas (id, clinica_id, nombre, tipo)
select '00000000-0000-0000-0000-0000000f3101', id, 'Bold por abonar', 'pasarela' from clinicas where nombre = 'Clinica A';

-- Contador: solo finanzas (sin pacientes ni tratamientos), para probar que
-- no ve nombres de pacientes.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000f3c01', 'contador@x.co');
insert into roles (id, clinica_id, nombre, nivel) select '00000000-0000-0000-0000-0000000f3c02', id, 'Contador', 3 from clinicas where nombre = 'Clinica A';
insert into usuarios (id, clinica_id, rol_id, nombre, email)
select '00000000-0000-0000-0000-0000000f3c01', id, '00000000-0000-0000-0000-0000000f3c02', 'Contador', 'contador@x.co' from clinicas where nombre = 'Clinica A';
insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id, concedido)
select '00000000-0000-0000-0000-0000000f3c02', m.id, p.id, true from modulos m, permisos p where m.codigo = 'finanzas' and p.codigo in ('VIEW', 'CREATE');
