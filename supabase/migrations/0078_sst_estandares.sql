-- ============================================================
-- 0078 · SG-SST F2 · Estándares mínimos y autoevaluación
-- ============================================================
-- Diseño: docs/sgsst/diseno-tecnico-sgsst.md, fila F2.
--   1. sst_estandares (global): los 60 ítems de la tabla de valores de la
--      Res. 0312 de 2019 con su peso y a cuál de los grupos de 7 y 21
--      estándares corresponde cada uno. ESTADO DE LA VERIFICACIÓN: la
--      estructura (60 ítems, pesos por ciclo 25/60/5/10) es la conocida de
--      la norma, pero el entorno no pudo abrir el texto oficial: `nombre` y
--      `descripcion` son redacción propia (no se presentan como literales)
--      y `verificado` queda en false hasta cotejarlos. La pantalla lo dice.
--   2. sst_autoevaluaciones + items: una por año. Se crea por RPC (el
--      conjunto de ítems lo pone la BD según el grupo); al cerrarla la BD
--      calcula el puntaje y el nivel, y desde ahí no cambia.
--      Puntaje = Σ peso de los ítems que cumplen o no aplican (justificado)
--                ÷ Σ peso de los ítems del grupo × 100.
--      Nivel: < 60 crítico; 60–85 moderadamente aceptable; > 85 aceptable.
--   3. Plan de mejoramiento: sst_acciones con origen 'autoevaluacion'
--      (el ítem que no se cumple).

create table sst_estandares (
  codigo text primary key,
  ciclo text not null check (ciclo in ('planear', 'hacer', 'verificar', 'actuar')),
  componente text not null,
  nombre text not null,
  descripcion text not null,
  peso numeric(5, 2) not null check (peso > 0),
  en_7 boolean not null default false,
  en_21 boolean not null default false,
  orden int not null,
  verificado boolean not null default false
);

alter table sst_estandares enable row level security;
create policy "sst_estandares_select" on sst_estandares for select to authenticated using (true);

insert into sst_estandares (codigo, ciclo, componente, nombre, descripcion, peso, en_7, en_21, orden) values
  ('1.1.1', 'planear', 'Recursos', 'Responsable del SG-SST', 'Hay una persona designada para diseñar y ejecutar el SG-SST, con la formación exigida.', 0.5, true, true, 1),
  ('1.1.2', 'planear', 'Recursos', 'Responsabilidades en el SG-SST', 'Las responsabilidades en SST están asignadas y comunicadas en todos los niveles.', 0.5, false, false, 2),
  ('1.1.3', 'planear', 'Recursos', 'Asignación de recursos', 'Hay recursos financieros, técnicos y humanos asignados al SG-SST.', 0.5, false, true, 3),
  ('1.1.4', 'planear', 'Recursos', 'Afiliación a riesgos laborales', 'Todo el personal está afiliado al Sistema General de Riesgos Laborales.', 0.5, true, true, 4),
  ('1.1.5', 'planear', 'Recursos', 'Pensión especial de alto riesgo', 'Si hay actividades de alto riesgo, se cotiza la pensión especial.', 0.5, false, false, 5),
  ('1.1.6', 'planear', 'Recursos', 'Conformación del COPASST o vigía', 'El COPASST (o vigía) está conformado y funciona.', 0.5, false, true, 6),
  ('1.1.7', 'planear', 'Recursos', 'Capacitación del COPASST o vigía', 'Los integrantes del COPASST (o el vigía) están capacitados.', 0.5, false, false, 7),
  ('1.1.8', 'planear', 'Recursos', 'Conformación del Comité de Convivencia', 'El Comité de Convivencia Laboral está conformado y funciona.', 0.5, false, true, 8),
  ('1.2.1', 'planear', 'Capacitación', 'Programa de capacitación', 'Programa anual de capacitación en promoción y prevención sobre los peligros prioritarios, extendido a contratistas.', 2, true, true, 9),
  ('1.2.2', 'planear', 'Capacitación', 'Inducción y reinducción', 'Todo el personal recibe inducción y reinducción en SST.', 2, false, false, 10),
  ('1.2.3', 'planear', 'Capacitación', 'Curso virtual de 50 horas', 'Los responsables del SG-SST aprobaron el curso virtual de 50 horas.', 2, false, false, 11),
  ('2.1.1', 'planear', 'Gestión integral', 'Política de SST', 'Política firmada, fechada y comunicada al COPASST o vigía.', 1, false, true, 12),
  ('2.2.1', 'planear', 'Gestión integral', 'Objetivos del SG-SST', 'Objetivos claros, medibles y con metas, coherentes con la política.', 1, false, false, 13),
  ('2.3.1', 'planear', 'Gestión integral', 'Evaluación inicial', 'Se hizo la evaluación inicial del SG-SST y se usa para priorizar.', 1, false, false, 14),
  ('2.4.1', 'planear', 'Gestión integral', 'Plan anual de trabajo', 'Plan con objetivos, metas, responsables, recursos y cronograma, firmado.', 2, true, true, 15),
  ('2.5.1', 'planear', 'Gestión integral', 'Archivo y retención documental', 'Los registros del SG-SST se conservan en forma segura el tiempo exigido.', 2, false, true, 16),
  ('2.6.1', 'planear', 'Gestión integral', 'Rendición de cuentas', 'Quienes tienen responsabilidades en SST rinden cuentas al menos una vez al año.', 1, false, false, 17),
  ('2.7.1', 'planear', 'Gestión integral', 'Matriz legal', 'Matriz de requisitos legales en SST actualizada.', 2, false, false, 18),
  ('2.8.1', 'planear', 'Gestión integral', 'Comunicación', 'Hay canales para recibir y responder comunicaciones y autorreportes en SST.', 1, false, false, 19),
  ('2.9.1', 'planear', 'Gestión integral', 'Adquisiciones', 'Al comprar productos y servicios se consideran los aspectos de SST.', 1, false, false, 20),
  ('2.10.1', 'planear', 'Gestión integral', 'Proveedores y contratistas', 'Se evalúa y selecciona a proveedores y contratistas con criterios de SST.', 2, false, false, 21),
  ('2.11.1', 'planear', 'Gestión integral', 'Gestión del cambio', 'Se evalúa el impacto en SST de los cambios internos y externos.', 1, false, false, 22),
  ('3.1.1', 'hacer', 'Condiciones de salud', 'Perfil sociodemográfico y diagnóstico de salud', 'Descripción del personal y diagnóstico de sus condiciones de salud.', 1, false, true, 23),
  ('3.1.2', 'hacer', 'Condiciones de salud', 'Promoción y prevención en salud', 'Actividades de medicina del trabajo y de promoción y prevención según el diagnóstico.', 1, false, true, 24),
  ('3.1.3', 'hacer', 'Condiciones de salud', 'Perfiles de cargo al médico', 'El médico que hace las evaluaciones conoce los perfiles de cargo y sus peligros.', 1, false, false, 25),
  ('3.1.4', 'hacer', 'Condiciones de salud', 'Evaluaciones médicas ocupacionales', 'Se hacen las evaluaciones médicas según los peligros y la periodicidad definida.', 1, true, true, 26),
  ('3.1.5', 'hacer', 'Condiciones de salud', 'Custodia de historias clínicas', 'Las historias clínicas ocupacionales están bajo la custodia de quien las elabora.', 1, false, false, 27),
  ('3.1.6', 'hacer', 'Condiciones de salud', 'Restricciones y recomendaciones', 'Se acatan las restricciones y recomendaciones médico-laborales.', 1, false, true, 28),
  ('3.1.7', 'hacer', 'Condiciones de salud', 'Estilos de vida saludables', 'Programas de estilos de vida y entornos saludables.', 1, false, false, 29),
  ('3.1.8', 'hacer', 'Condiciones de salud', 'Agua potable y servicios sanitarios', 'Hay agua potable, servicios sanitarios y disposición de basuras.', 1, false, false, 30),
  ('3.1.9', 'hacer', 'Condiciones de salud', 'Eliminación de residuos', 'Los residuos sólidos, líquidos o gaseosos se eliminan adecuadamente.', 1, false, false, 31),
  ('3.2.1', 'hacer', 'Registro, reporte e investigación', 'Reporte de AT y EL', 'Los accidentes y enfermedades laborales se reportan a la ARL, la EPS y, si aplica, a MinTrabajo.', 2, false, true, 32),
  ('3.2.2', 'hacer', 'Registro, reporte e investigación', 'Investigación de incidentes, AT y EL', 'Se investigan los incidentes, accidentes y enfermedades laborales.', 2, false, true, 33),
  ('3.2.3', 'hacer', 'Registro, reporte e investigación', 'Estadística de eventos', 'Se registran y analizan estadísticamente los incidentes, AT y EL.', 1, false, false, 34),
  ('3.3.1', 'hacer', 'Indicadores de salud', 'Severidad de AT', 'Se mide la severidad de la accidentalidad.', 1, false, false, 35),
  ('3.3.2', 'hacer', 'Indicadores de salud', 'Frecuencia de AT', 'Se mide la frecuencia de la accidentalidad.', 1, false, false, 36),
  ('3.3.3', 'hacer', 'Indicadores de salud', 'Mortalidad de AT', 'Se mide la mortalidad por accidentes de trabajo.', 1, false, false, 37),
  ('3.3.4', 'hacer', 'Indicadores de salud', 'Prevalencia de EL', 'Se mide la prevalencia de enfermedad laboral.', 1, false, false, 38),
  ('3.3.5', 'hacer', 'Indicadores de salud', 'Incidencia de EL', 'Se mide la incidencia de enfermedad laboral.', 1, false, false, 39),
  ('3.3.6', 'hacer', 'Indicadores de salud', 'Ausentismo', 'Se mide el ausentismo por causa médica.', 1, false, false, 40),
  ('4.1.1', 'hacer', 'Peligros y riesgos', 'Metodología de identificación', 'Hay una metodología documentada para identificar peligros y valorar riesgos.', 4, false, false, 41),
  ('4.1.2', 'hacer', 'Peligros y riesgos', 'Identificación de peligros con participación', 'Los peligros se identifican con participación del personal y se actualiza al menos anualmente.', 4, true, true, 42),
  ('4.1.3', 'hacer', 'Peligros y riesgos', 'Sustancias carcinógenas o tóxicas', 'Se identifican las sustancias carcinógenas o de toxicidad aguda que se usan.', 3, false, false, 43),
  ('4.1.4', 'hacer', 'Peligros y riesgos', 'Mediciones ambientales', 'Se hacen las mediciones ambientales de los peligros que lo requieren.', 4, false, false, 44),
  ('4.2.1', 'hacer', 'Medidas de control', 'Medidas de prevención y control', 'Se implementan las medidas de prevención y control frente a los peligros identificados.', 2.5, true, true, 45),
  ('4.2.2', 'hacer', 'Medidas de control', 'Verificación de las medidas', 'Se verifica que el personal aplique las medidas de prevención y control.', 2.5, false, false, 46),
  ('4.2.3', 'hacer', 'Medidas de control', 'Procedimientos e instructivos', 'Hay procedimientos, instructivos, fichas y protocolos para los peligros prioritarios.', 2.5, false, false, 47),
  ('4.2.4', 'hacer', 'Medidas de control', 'Inspecciones', 'Se hacen inspecciones con el COPASST o el vigía.', 2.5, false, false, 48),
  ('4.2.5', 'hacer', 'Medidas de control', 'Mantenimiento', 'Mantenimiento periódico de instalaciones, equipos y herramientas.', 2.5, false, true, 49),
  ('4.2.6', 'hacer', 'Medidas de control', 'Elementos de protección personal', 'Se entregan los EPP, se capacita en su uso y se verifica también con contratistas.', 2.5, false, true, 50),
  ('5.1.1', 'hacer', 'Amenazas', 'Plan de emergencias', 'Plan de prevención, preparación y respuesta ante emergencias.', 5, false, true, 51),
  ('5.1.2', 'hacer', 'Amenazas', 'Brigada de emergencias', 'Brigada conformada, capacitada y dotada.', 5, false, true, 52),
  ('6.1.1', 'verificar', 'Verificación', 'Indicadores del SG-SST', 'Se definen y miden indicadores de estructura, proceso y resultado.', 1.25, false, false, 53),
  ('6.1.2', 'verificar', 'Verificación', 'Auditoría anual', 'Se hace auditoría del SG-SST al menos una vez al año.', 1.25, false, false, 54),
  ('6.1.3', 'verificar', 'Verificación', 'Revisión por la dirección', 'La alta dirección revisa el SG-SST al menos una vez al año.', 1.25, false, false, 55),
  ('6.1.4', 'verificar', 'Verificación', 'Auditoría planificada con el COPASST', 'La auditoría se planifica con el COPASST.', 1.25, false, false, 56),
  ('7.1.1', 'actuar', 'Mejoramiento', 'Acciones según resultados', 'Se definen acciones de promoción y prevención con base en los resultados del SG-SST.', 2.5, false, false, 57),
  ('7.1.2', 'actuar', 'Mejoramiento', 'Acciones correctivas, preventivas y de mejora', 'Se toman medidas correctivas, preventivas y de mejora.', 2.5, false, false, 58),
  ('7.1.3', 'actuar', 'Mejoramiento', 'Acciones de las investigaciones', 'Se ejecutan las acciones que salen de las investigaciones de incidentes, AT y EL.', 2.5, false, false, 59),
  ('7.1.4', 'actuar', 'Mejoramiento', 'Acciones de autoridades y ARL', 'Se implementan las medidas que piden las autoridades y la ARL.', 2.5, false, false, 60);

do $$
begin
  if (select count(*) from sst_estandares) <> 60
     or (select sum(peso) from sst_estandares) <> 100
     or (select count(*) from sst_estandares where en_7) <> 7
     or (select count(*) from sst_estandares where en_21) <> 21 then
    raise exception 'Catálogo de estándares inconsistente (60 ítems, 100 puntos, 7 y 21).';
  end if;
end $$;

-- ============================================================
-- Autoevaluación anual
-- ============================================================
create table sst_autoevaluaciones (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  anio int not null check (anio between 2019 and 2100),
  grupo text not null check (grupo in ('7', '21', '60')),
  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  puntaje numeric(5, 2),
  nivel text check (nivel in ('critico', 'moderado', 'aceptable')),
  fecha_cierre timestamptz,
  cerrada_por uuid references usuarios(id) on delete set null,
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (clinica_id, anio)
);

create table sst_autoevaluacion_items (
  id uuid primary key default gen_random_uuid(),
  autoevaluacion_id uuid not null references sst_autoevaluaciones(id) on delete cascade,
  clinica_id uuid not null references clinicas(id) on delete cascade,
  estandar_codigo text not null references sst_estandares(codigo),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'cumple', 'no_cumple', 'no_aplica')),
  justificacion text check (length(justificacion) <= 2000),
  observacion text check (length(observacion) <= 2000),
  updated_by uuid references usuarios(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (autoevaluacion_id, estandar_codigo),
  constraint sst_item_no_aplica_justificado check (estado <> 'no_aplica' or length(btrim(coalesce(justificacion, ''))) >= 10)
);

create index idx_sst_items_autoevaluacion on sst_autoevaluacion_items(autoevaluacion_id);

-- Ítems: solo se editan mientras la autoevaluación está abierta, y solo el
-- estado y sus textos.
create or replace function fn_sst_item_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.autoevaluacion_id <> old.autoevaluacion_id or new.estandar_codigo <> old.estandar_codigo or new.clinica_id <> old.clinica_id then
    raise exception 'El ítem no cambia de estándar ni de autoevaluación.';
  end if;
  if (select estado from sst_autoevaluaciones where id = new.autoevaluacion_id) <> 'abierta' then
    raise exception 'La autoevaluación está cerrada: no se modifica.';
  end if;
  return new;
end;
$$;

-- Cabecera: al cerrarla la BD calcula puntaje y nivel (lo que mande el
-- cliente se ignora); cerrada, no cambia.
create or replace function fn_sst_autoevaluacion_cierre()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_pendientes int;
  v_total numeric;
  v_logrado numeric;
begin
  if old.estado = 'cerrada' then
    raise exception 'La autoevaluación está cerrada: no se modifica.';
  end if;
  if new.clinica_id <> old.clinica_id or new.anio <> old.anio or new.grupo <> old.grupo then
    raise exception 'El año y el grupo de la autoevaluación no cambian.';
  end if;
  if new.estado = 'abierta' then
    new.puntaje := null;
    new.nivel := null;
    new.fecha_cierre := null;
    new.cerrada_por := null;
    return new;
  end if;
  if current_user in ('authenticated', 'anon') and not has_permission('sst', 'APPROVE') then
    raise exception 'No tienes permiso para cerrar la autoevaluación.';
  end if;
  select count(*) filter (where i.estado = 'pendiente'),
         sum(e.peso),
         coalesce(sum(e.peso) filter (where i.estado in ('cumple', 'no_aplica')), 0)
    into v_pendientes, v_total, v_logrado
  from sst_autoevaluacion_items i
  join sst_estandares e on e.codigo = i.estandar_codigo
  where i.autoevaluacion_id = new.id;
  if v_pendientes > 0 then
    raise exception 'Quedan % ítems sin calificar.', v_pendientes;
  end if;
  new.puntaje := round(v_logrado / v_total * 100, 2);
  new.nivel := case when new.puntaje < 60 then 'critico' when new.puntaje <= 85 then 'moderado' else 'aceptable' end;
  new.fecha_cierre := now();
  new.cerrada_por := auth.uid();
  return new;
end;
$$;

create trigger sst_autoevaluaciones_cierre before update on sst_autoevaluaciones
  for each row execute function fn_sst_autoevaluacion_cierre();
create trigger sst_autoevaluaciones_no_borrar before delete on sst_autoevaluaciones
  for each row execute function fn_hab_inmutable('La autoevaluación no se borra.');
create trigger sst_autoevaluaciones_auditoria after insert or update on sst_autoevaluaciones
  for each row execute function fn_auditoria();
create trigger sst_items_00_autor before update on sst_autoevaluacion_items
  for each row execute function fn_hab_forzar_autor();
create trigger sst_items_proteger before update on sst_autoevaluacion_items
  for each row execute function fn_sst_item_proteger();
create trigger sst_items_set_updated_at before update on sst_autoevaluacion_items
  for each row execute function set_updated_at();
create trigger sst_items_no_borrar before delete on sst_autoevaluacion_items
  for each row execute function fn_hab_inmutable('Los ítems de la autoevaluación no se borran.');

alter table sst_autoevaluaciones enable row level security;
alter table sst_autoevaluacion_items enable row level security;
-- Sin políticas de insert: se crean por fn_sst_iniciar_autoevaluacion.
create policy "sst_autoevaluaciones_select" on sst_autoevaluaciones
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('sst', 'VIEW'));
create policy "sst_autoevaluaciones_update" on sst_autoevaluaciones
  for update to authenticated using (
    clinica_id = clinica_actual() and has_permission('sst', 'APPROVE') and has_entitlement('sst', 'gestion')
  ) with check (clinica_id = clinica_actual());
create policy "sst_items_select" on sst_autoevaluacion_items
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('sst', 'VIEW'));
create policy "sst_items_update" on sst_autoevaluacion_items
  for update to authenticated using (
    clinica_id = clinica_actual() and has_permission('sst', 'EDIT') and has_entitlement('sst', 'gestion')
  ) with check (clinica_id = clinica_actual());

create or replace function fn_sst_iniciar_autoevaluacion(p_anio int, p_grupo text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica uuid := clinica_actual();
  v_id uuid;
begin
  if v_clinica is null or not has_permission('sst', 'CREATE') then
    raise exception 'No tienes permiso para iniciar la autoevaluación.';
  end if;
  if not has_entitlement('sst', 'gestion') then
    raise exception 'La autoevaluación de estándares está disponible en el plan Pro.';
  end if;
  if p_grupo not in ('7', '21', '60') then
    raise exception 'Grupo de estándares inválido.';
  end if;
  if p_anio is null or p_anio not between 2019 and extract(year from (now() at time zone 'America/Bogota'))::int then
    raise exception 'Año inválido.';
  end if;
  insert into sst_autoevaluaciones (clinica_id, anio, grupo, created_by)
  values (v_clinica, p_anio, p_grupo, auth.uid())
  returning id into v_id;
  insert into sst_autoevaluacion_items (autoevaluacion_id, clinica_id, estandar_codigo)
  select v_id, v_clinica, e.codigo
  from sst_estandares e
  where p_grupo = '60' or (p_grupo = '21' and e.en_21) or (p_grupo = '7' and e.en_7);
  return v_id;
exception when unique_violation then
  raise exception 'Ya existe la autoevaluación de %.', p_anio;
end;
$$;

revoke execute on function fn_sst_iniciar_autoevaluacion(int, text) from public, anon;
grant execute on function fn_sst_iniciar_autoevaluacion(int, text) to authenticated;

-- ============================================================
-- Plan de mejoramiento: acciones con origen en un ítem
-- ============================================================
create or replace function fn_sst_accion_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.estado = 'cerrada' then
      raise exception 'La acción está cerrada: no se modifica (si hace falta, crea otra).';
    end if;
    if new.origen <> old.origen or new.origen_id is distinct from old.origen_id or new.clinica_id <> old.clinica_id then
      raise exception 'La acción no cambia de origen.';
    end if;
  end if;
  if new.origen = 'investigacion' and not exists (
    select 1 from sst_investigaciones i where i.id = new.origen_id and i.clinica_id = new.clinica_id
  ) then
    raise exception 'La investigación no pertenece a esta clínica.';
  end if;
  if new.origen = 'matriz' and not exists (
    select 1 from sst_peligros p where p.id = new.origen_id and p.clinica_id = new.clinica_id
  ) then
    raise exception 'El peligro no pertenece a esta clínica.';
  end if;
  if new.origen = 'autoevaluacion' and not exists (
    select 1 from sst_autoevaluacion_items i where i.id = new.origen_id and i.clinica_id = new.clinica_id
  ) then
    raise exception 'El ítem de la autoevaluación no pertenece a esta clínica.';
  end if;
  if new.estado = 'cerrada' and new.fecha_cierre > (now() at time zone 'America/Bogota')::date then
    raise exception 'La fecha de cierre no puede ser futura.';
  end if;
  return new;
end;
$$;

revoke execute on function fn_sst_item_proteger() from public, anon, authenticated;
revoke execute on function fn_sst_autoevaluacion_cierre() from public, anon, authenticated;
