-- Datos de demostración para las capturas del manual (SOLO el Supabase
-- local de scripts/habilitacion/supabase-local; nunca la BD enlazada).
-- Clínica "EWAH S.A.S.": profesionales, pacientes, agenda de la semana,
-- atenciones con tratamientos, inventario, RRHH, campañas y medio ambiente.
-- Idempotente: si ya existe la paciente "Valentina Ortiz", no hace nada.
do $$
declare
  c uuid := (select id from clinicas where nombre = 'EWAH S.A.S.');
  admin uuid := (select id from usuarios where email = 'admin@ewah.local');
  dra uuid := '00000000-0000-0000-0000-00000000d0c1';
  sede uuid := (select id from sedes where clinica_id = (select id from clinicas where nombre = 'EWAH S.A.S.') order by orden, nombre limit 1);
  cons1 uuid := (select id from consultorios where nombre = 'Consultorio 1');
  cons2 uuid;
  hoy date := (now() at time zone 'America/Bogota')::date;
  lunes date := date_trunc('week', (now() at time zone 'America/Bogota')::date)::date;
  cc uuid := (select id from tipos_identificacion where codigo = 'CC');
  fem uuid := (select id from generos where nombre = 'Femenino');
  mas uuid := (select id from generos where nombre = 'Masculino');
  co uuid := (select id from paises where codigo = 'CO');
  ig uuid := (select id from canales_captacion where nombre = 'Instagram');
  rec uuid := (select id from canales_captacion where nombre = 'Recomendado por otro paciente');
  botox uuid := (select id from tipos_tratamiento where nombre like 'Toxina%' and clinica_id = (select id from clinicas where nombre = 'EWAH S.A.S.'));
  hialu uuid := (select id from tipos_tratamiento where nombre = 'Ácido hialurónico' and clinica_id = (select id from clinicas where nombre = 'EWAH S.A.S.'));
  limpieza uuid := (select id from tipos_tratamiento where nombre = 'Limpieza facial' and clinica_id = (select id from clinicas where nombre = 'EWAH S.A.S.'));
  peeling uuid := (select id from tipos_tratamiento where nombre = 'Peeling químico' and clinica_id = (select id from clinicas where nombre = 'EWAH S.A.S.'));
  efectivo uuid := (select id from medios_pago where codigo = 'EFECTIVO' and clinica_id = (select id from clinicas where nombre = 'EWAH S.A.S.'));
  tarjeta uuid := (select id from medios_pago where codigo = 'TARJETA_CREDITO' and clinica_id = (select id from clinicas where nombre = 'EWAH S.A.S.'));
  transf uuid := (select id from medios_pago where codigo = 'TRANSFERENCIA' and clinica_id = (select id from clinicas where nombre = 'EWAH S.A.S.'));
  rol_medico uuid;
  v_camp uuid;
  p uuid[];
  ins_botox uuid; ins_hialu uuid; ins_guantes uuid; ins_gasas uuid;
  l_botox uuid; l_hialu uuid; l_guantes uuid; l_gasas uuid;
  nev uuid;
  a uuid; t uuid; ci uuid;
  i int;
begin
  if exists (select 1 from pacientes where clinica_id = c and primer_nombre = 'Valentina' and primer_apellido = 'Ortiz') then
    raise notice 'La semilla del manual ya estaba cargada.';
    return;
  end if;

  -- Clínica y profesionales.
  update clinicas set nombre_comercial = 'EWAH Dermatología', direccion = 'Calle 93 # 15-40, consultorio 302', telefono = '601 745 2210',
    email = 'contacto@ewah.local', codigo_actividad_economica = '8621' where id = c;
  update usuarios set nombre = 'Andrés Mejía' where id = admin;
  update sedes set nombre = 'Sede Chicó' where id = sede;
  insert into consultorios (clinica_id, nombre, sede_id) values (c, 'Consultorio 2', sede) returning id into cons2;
  insert into consultorios (clinica_id, nombre, sede_id) values (c, 'Sala de procedimientos', sede);
  insert into roles (clinica_id, nombre, descripcion, nivel) values (c, 'Médico', 'Atiende pacientes y registra tratamientos', 3) returning id into rol_medico;
  insert into rol_modulo_permiso (rol_id, modulo_id, permiso_id, concedido)
  select rol_medico, m.id, pe.id, true from modulos m, permisos pe
  where m.codigo in ('pacientes', 'citas', 'tratamientos', 'reportes') and pe.codigo in ('VIEW', 'CREATE', 'EDIT')
  on conflict do nothing;
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (dra, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'laura.gomez@ewah.local', crypt('Prueba-local-123!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now())
  on conflict (id) do nothing;
  insert into usuarios (id, clinica_id, rol_id, nombre, email) values (dra, c, rol_medico, 'Laura Gómez', 'laura.gomez@ewah.local') on conflict (id) do nothing;

  -- Campañas.
  insert into campanas (clinica_id, nombre, canal_captacion_id, fecha_inicio, fecha_fin, presupuesto, objetivo, created_by)
  values (c, 'Rejuvenecimiento facial · octubre', ig, hoy - 20, hoy + 10, 1500000, 'Agendar 25 valoraciones de toxina y relleno', admin) returning id into v_camp;
  insert into campanas (clinica_id, nombre, canal_captacion_id, fecha_inicio, fecha_fin, presupuesto, objetivo, created_by)
  values (c, 'Referidos de pacientes', rec, hoy - 60, null, 0, 'Premiar a quien nos recomienda', admin);

  -- Pacientes (la última, con información pendiente).
  with nuevos as (
    insert into pacientes (clinica_id, tipo_identificacion_id, numero_identificacion, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
      fecha_nacimiento, genero_id, pais_residencia_id, nacionalidad_id, email, telefono1, canal_captacion_id, campana_id)
    select c, case when v.doc is null then null else cc end, v.doc, v.n1, v.n2, v.a1, v.a2, v.nac::date, case v.g when 'F' then fem else mas end, co, co, v.mail, v.tel,
      case when v.camp then ig else rec end, case when v.camp then v_camp end
    from (values
      ('1020456789', 'Valentina', null, 'Ortiz', 'Ramírez', '1991-04-12', 'F', 'valentina.ortiz@correo.co', '3104567890', true),
      ('52367812', 'Claudia', 'Patricia', 'Herrera', 'Ríos', '1978-09-03', 'F', 'claudia.herrera@correo.co', '3157894561', false),
      ('80123456', 'Juan', 'Camilo', 'Restrepo', 'Vélez', '1985-01-27', 'M', 'juan.restrepo@correo.co', '3001234567', true),
      ('1032478965', 'Mariana', null, 'López', 'Castaño', '1996-11-19', 'F', 'mariana.lopez@correo.co', '3208765432', true),
      ('43678901', 'Ana', 'María', 'Quintero', 'Gil', '1969-06-08', 'F', 'ana.quintero@correo.co', '3112345678', false),
      ('1015432198', 'Sofía', null, 'Martínez', 'Duque', '1999-02-14', 'F', 'sofia.martinez@correo.co', '3016549870', true),
      ('79854123', 'Carlos', 'Andrés', 'Pineda', 'Torres', '1975-08-30', 'M', 'carlos.pineda@correo.co', '3183456789', false),
      ('1144567321', 'Daniela', null, 'Cárdenas', 'Mora', '1993-07-22', 'F', 'daniela.cardenas@correo.co', '3129876543', true),
      (null, 'Isabela', null, 'Rojas', null, '1988-12-01', 'F', null, '3045551234', true)
    ) as v(doc, n1, n2, a1, a2, nac, g, mail, tel, camp)
    returning id, primer_nombre
  )
  select array_agg(id order by array_position(array['Valentina','Claudia','Juan','Mariana','Ana','Sofía','Carlos','Daniela','Isabela'], primer_nombre)) into p from nuevos;

  -- Inventario: insumos, lotes con entradas de compra.
  insert into proveedores (clinica_id, nombre) values (c, 'Distribuciones Dermamed SAS'), (c, 'Insumos Clínicos de Colombia');
  insert into insumos (clinica_id, nombre, unidad_medida, registro_sanitario) values (c, 'Toxina botulínica tipo A 100 U', 'unidades', 'INVIMA 2019M-0012345') returning id into ins_botox;
  insert into insumos (clinica_id, nombre, unidad_medida, registro_sanitario) values (c, 'Ácido hialurónico 1 ml', 'jeringas', 'INVIMA 2020DM-0023456') returning id into ins_hialu;
  insert into insumos (clinica_id, nombre, unidad_medida) values (c, 'Guantes de nitrilo talla M', 'pares') returning id into ins_guantes;
  insert into insumos (clinica_id, nombre, unidad_medida) values (c, 'Gasa estéril 7,5 x 7,5', 'paquetes') returning id into ins_gasas;
  insert into lotes (clinica_id, sede_id, insumo_id, numero_lote, fecha_vencimiento, costo_unitario, proveedor, created_by)
  values (c, sede, ins_botox, 'BTX-24117', hoy + 240, 9800, 'Distribuciones Dermamed SAS', admin) returning id into l_botox;
  insert into lotes (clinica_id, sede_id, insumo_id, numero_lote, fecha_vencimiento, costo_unitario, proveedor, created_by)
  values (c, sede, ins_hialu, 'HA-55021', hoy + 45, 310000, 'Distribuciones Dermamed SAS', admin) returning id into l_hialu;
  insert into lotes (clinica_id, sede_id, insumo_id, numero_lote, fecha_vencimiento, costo_unitario, proveedor, created_by)
  values (c, sede, ins_guantes, 'GN-8890', hoy + 500, 450, 'Insumos Clínicos de Colombia', admin) returning id into l_guantes;
  insert into lotes (clinica_id, sede_id, insumo_id, numero_lote, fecha_vencimiento, costo_unitario, proveedor, created_by)
  values (c, sede, ins_gasas, 'GZ-1203', hoy + 365, 1200, 'Insumos Clínicos de Colombia', admin) returning id into l_gasas;
  insert into movimientos_insumos (clinica_id, lote_id, tipo, cantidad, motivo_movimiento, created_by) values
    (c, l_botox, 'entrada', 400, 'compra', admin), (c, l_hialu, 'entrada', 12, 'compra', admin),
    (c, l_guantes, 'entrada', 200, 'compra', admin), (c, l_gasas, 'entrada', 8, 'compra', admin);

  -- Agenda de esta semana: atendidas (con atención y tratamiento), confirmadas,
  -- agendadas, una cancelada y una no asistió.
  for i in 1..9 loop
    insert into citas (clinica_id, paciente_id, profesional_id, consultorio_id, tipo_tratamiento_id, fecha, hora_inicio, hora_fin, estado, created_by)
    values (c, p[i], case when i % 2 = 0 then dra else admin end, case when i % 2 = 0 then cons2 else cons1 end,
      (array[botox, hialu, limpieza, peeling, botox, limpieza, hialu, peeling, botox])[i],
      lunes + (i - 1) % 5, (time '08:00' + ((i % 4) * interval '90 minutes')), (time '09:00' + ((i % 4) * interval '90 minutes')),
      case when lunes + (i - 1) % 5 < hoy then (array['atendida','atendida','no_asistio','atendida','cancelada','atendida','atendida','atendida','atendida'])[i]
           when lunes + (i - 1) % 5 = hoy then 'confirmada' else 'agendada' end, admin)
    returning id into ci;
    if (select estado from citas where id = ci) = 'cancelada' then update citas set motivo = 'La paciente viajó' where id = ci; end if;
  end loop;
  -- Citas de la próxima semana.
  insert into citas (clinica_id, paciente_id, profesional_id, consultorio_id, tipo_tratamiento_id, fecha, hora_inicio, hora_fin, estado, created_by)
  select c, p[k], admin, cons1, botox, lunes + 7 + k % 5, time '10:00', time '11:00', 'agendada', admin from generate_series(1, 4) k;
  -- Bloqueo de horario (almuerzo de la doctora el miércoles).
  insert into citas (clinica_id, profesional_id, fecha, hora_inicio, hora_fin, estado, es_bloqueo, motivo, created_by)
  values (c, dra, lunes + 2, '12:00', '14:00', 'agendada', true, 'Capacitación', admin);

  -- Atenciones con tratamientos para las citas atendidas.
  for ci in select id from citas where clinica_id = c and estado = 'atendida' order by fecha, hora_inicio loop
    insert into atenciones (clinica_id, paciente_id, cita_id, profesional_id, fecha, motivo, created_by)
    select clinica_id, paciente_id, id, profesional_id, fecha, null, admin from citas where id = ci returning id into a;
    insert into tratamientos (clinica_id, paciente_id, tipo_tratamiento_id, profesional_id, atencion_id, fecha, costo, sede_id, medio_pago_id, notas, created_by)
    select x.clinica_id, x.paciente_id, x.tipo_tratamiento_id, x.profesional_id, a, x.fecha,
      case x.tipo_tratamiento_id when botox then 850000 when hialu then 1200000 when limpieza then 180000 else 320000 end,
      sede, case when extract(day from x.fecha)::int % 3 = 0 then tarjeta when extract(day from x.fecha)::int % 3 = 1 then efectivo else transf end,
      'Sin complicaciones', admin
    from citas x where x.id = ci returning id into t;
    insert into evoluciones_paciente (clinica_id, paciente_id, profesional_id, evolucion, atencion_id, fecha)
    select clinica_id, paciente_id, profesional_id, 'Paciente tolera bien el procedimiento. Se dan recomendaciones de cuidado en casa y control en 15 días.', a, fecha
    from atenciones where id = a;
    if (select tipo_tratamiento_id from tratamientos where id = t) = botox then
      insert into movimientos_insumos (clinica_id, lote_id, tipo, cantidad, tratamiento_id, sitio_anatomico, motivo_movimiento, created_by)
      values (c, l_botox, 'salida', 50, t, 'Frente y entrecejo', 'consumo_tratamiento', admin);
    elsif (select tipo_tratamiento_id from tratamientos where id = t) = hialu then
      insert into movimientos_insumos (clinica_id, lote_id, tipo, cantidad, tratamiento_id, sitio_anatomico, motivo_movimiento, created_by)
      values (c, l_hialu, 'salida', 1, t, 'Labios', 'consumo_tratamiento', admin);
    end if;
    insert into movimientos_insumos (clinica_id, lote_id, tipo, cantidad, tratamiento_id, motivo_movimiento, created_by)
    values (c, l_guantes, 'salida', 2, t, 'consumo_tratamiento', admin);
  end loop;
  -- Anamnesis de la primera paciente.
  insert into anamnesis_paciente (clinica_id, paciente_id, profesional_id, fecha, motivo_consulta, antecedentes_personales, alergias, habitos, fototipo,
    examen_fisico_hallazgos, talla_cm, peso_kg, tipo_sangre, atencion_id, created_by)
  select clinica_id, paciente_id, profesional_id, fecha, 'Líneas de expresión en frente y entrecejo; desea aspecto descansado.',
    array['Ninguno'], array['Ninguna conocida'], array['Ejercicio'], 'III', 'Líneas dinámicas moderadas en región glabelar.', 165, 58, 'O+', id, admin
  from atenciones where clinica_id = c and paciente_id = p[1] order by fecha limit 1;

  -- Recursos humanos.
  insert into empleados (clinica_id, nombre, numero_identificacion, tipo_identificacion_id, email, celular, fecha_inicio_contrato, categoria_contrato, activo)
  values (c, 'Laura Gómez', '52987654', cc, 'laura.gomez@ewah.local', '3105556677', hoy - 400, 'laboral', true),
         (c, 'Paola Andrea Suárez', '1019876543', cc, 'paola.suarez@correo.co', '3126667788', hoy - 210, 'laboral', true),
         (c, 'Diego Fernando Ruiz', '80765432', cc, 'diego.ruiz@correo.co', '3017778899', hoy - 90, 'prestacion_servicios', true);

  -- Medio ambiente: nevera, temperaturas, extintor, limpieza y residuos.
  insert into neveras (clinica_id, sede_id, nombre) values (c, sede, 'Nevera de medicamentos') returning id into nev;
  insert into registros_temperatura_nevera (clinica_id, sede_id, nevera_id, temperatura_celsius, fecha, hora, jornada, created_by)
  select c, sede, nev, 4.2 + (d % 3) * 0.6, hoy - d, case j when 'AM' then time '08:00' else time '16:00' end, j, admin
  from generate_series(0, 6) d, unnest(array['AM', 'PM']) j where hoy - d >= lunes - 3;
  insert into extintores (clinica_id, sede_id, tipo_extintor_id, ubicacion, fecha_vencimiento)
  values (c, sede, (select id from tipos_extintor where clinica_id = c and nombre like 'Multipropósito%' limit 1), 'Recepción, junto a la puerta', hoy + 25);
  insert into registros_limpieza (clinica_id, sede_id, area_tipo, consultorio_id, fecha, hora, jornada, created_by)
  select c, sede, 'consultorio', cons1, hoy - d, time '07:30', 'AM', admin from generate_series(0, 4) d;
  insert into registros_residuos (clinica_id, sede_id, tipo_residuo, peso_kg, fecha, hora, jornada, created_by)
  values (c, sede, 'biosanitario', 1.8, hoy - 1, '18:00', 'PM', admin), (c, sede, 'cortopunzante', 0.4, hoy - 1, '18:00', 'PM', admin),
         (c, sede, 'aprovechable', 2.5, hoy - 2, '18:00', 'PM', admin);
end $$;

-- El paciente de los recorridos de finanzas, con nombre de demostración.
update pacientes set primer_apellido = 'Restrepo', tipo_identificacion_id = (select id from tipos_identificacion where codigo = 'CC'),
  numero_identificacion = '1098765432', email = 'lucia.restrepo@correo.co', telefono1 = '3141234567'
where numero_identificacion = 'RECORRIDO-FC3';
alter table tratamientos disable trigger tratamientos_solo_anular;
update tratamientos set notas = 'Sin complicaciones' where notas = 'recorrido-fc3';
alter table tratamientos enable trigger tratamientos_solo_anular;

-- La tarifa de Bold de los recorridos empieza hoy; para que los cobros de la
-- semana de demostración muestren su neto, una tarifa desde el 1 de enero
-- (sin los controles de tarifas ya usadas: solo datos locales).
set session_replication_role = replica;
insert into fin_tarifas_medio_pago (clinica_id, medio_pago_id, vigente_desde, porcentaje_comision, comision_incluye_iva, valor_fijo_comision,
  porcentaje_retefuente, porcentaje_reteica, porcentaje_reteiva, dias_habiles_abono)
select m.clinica_id, m.id, date_trunc('year', now())::date, 3.79, true, 300, 1.5, 0.414, 0, 1
from medios_pago m join clinicas c on c.id = m.clinica_id
where c.nombre = 'EWAH S.A.S.' and m.codigo = 'TARJETA_CREDITO'
on conflict (medio_pago_id, vigente_desde) do nothing;
set session_replication_role = origin;
