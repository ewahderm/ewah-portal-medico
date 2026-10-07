-- Datos de prueba de F9/F10 (corre después de f5..f8): una clínica Gratis
-- para comprobar que no recibe alertas por correo.
insert into auth.users(id, email) values ('00000000-0000-0000-0000-0000000009f0', 'gratis@x.co');
select bootstrap_clinica('Clinica Gratis', 'NIT-G', '00000000-0000-0000-0000-0000000009f0', 'Admin G', 'gratis@x.co');
