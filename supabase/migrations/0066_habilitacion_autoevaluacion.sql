-- EWAH Tech Platform — Habilitación (Res. 3100/2019), fase F5:
-- autoevaluación por estándar.
-- Aplicar con: npx supabase db push --linked
--
-- Diseño técnico aprobado: diseno-tecnico-habilitacion.md §1.4
-- (hab_evaluaciones, hab_evidencias, hab_criterio_asignaciones,
-- hab_planes_mejora, hab_autoevaluaciones + detalle), §1.5, §1.6, §1.7,
-- §5.5 y fila F5 de §7. Historias HU-4.1 a HU-4.5 del requerimiento.
--
-- Clave de evaluación = (clinica_id, sede_id, criterio_id): el criterio ya
-- identifica el servicio de la norma, así 11.1 se evalúa una vez por sede
-- (HU-4.3) y un criterio que entra por remisión es el MISMO que si se
-- declarara el servicio destino directamente.
--
-- Contenido:
--   1. Funciones genéricas: fn_hab_inmutable (append-only real, también
--      contra el service role) y fn_hab_fijar_autor.
--   2. hab_evidencias (archivo / nota / enlace; se "retiran", no se borran).
--   3. hab_evaluaciones (append-only puro; la vigente es la última) + vista
--      hab_evaluaciones_vigentes + validación en BD + RPC fn_hab_evaluar.
--   4. hab_criterio_asignaciones (responsable y fecha objetivo, mutable).
--   5. hab_planes_mejora (desde un "No cumple"; cerrada = inmutable).
--   6. hab_autoevaluaciones + hab_autoevaluacion_detalle: SOLO tablas,
--      inmutabilidad y RLS. La RPC de cierre (fn_hab_cerrar_autoevaluacion)
--      llega en F10: depende de las proveedoras de evidencia (F6, 0069) y
--      de las ocurrencias de obligaciones (F8, 0068) para marcar presentada
--      la "Autoevaluación REPS" del año.
--   7. clinica_servicios_habilitados: no se borra un servicio de una sede
--      que ya tiene autoevaluación (fn_servicio_habilitado_no_borrar_evaluado).
--   8. fn_hab_tablero_criterios v2 (columnas de evaluación llenas + filtro
--      por estándar en el servidor) y fn_hab_progreso_autoevaluacion
--      (contadores agregados, sin textos).
--
-- Rendimiento (medido en F5): el tablero completo de EWAH son 465 filas ≈
-- 591 KB de JSON (40 columnas con nombre repetido por fila + textos). La
-- pantalla pide UN estándar a la vez (p_estandar) y solo las columnas que
-- pinta; los contadores de las 7 pestañas salen de la función agregada.
--
-- Notación de políticas (§1.4): V = clinica_id = clinica_actual() and
-- has_permission('habilitacion','VIEW'); G(X) = clinica_id =
-- clinica_actual() and has_permission('habilitacion', X) and
-- has_entitlement('habilitacion','gestion'). has_permission solo no basta:
-- deja pasar a cualquier admin sin mirar el plan.

-- ============================================================
-- 1. Funciones genéricas
-- ============================================================
-- Append-only real: before update or delete → excepción. Sin políticas de
-- update/delete el RLS ya lo impide a los usuarios; el trigger es la
-- segunda barrera, también contra el service role y el SQL directo.
-- Única excepción: el borrado en cascada de una clínica eliminada (si no,
-- ninguna clínica con historial podría eliminarse jamás). En la cascada la
-- fila de `clinicas` ya no es visible cuando llega el delete del hijo.
-- security definer: debe ver `clinicas` sin el RLS de quien borra (con RLS
-- una clínica ajena "no existiría" y abriría el borrado).
-- tg_argv[0] = mensaje opcional para el usuario.
create or replace function fn_hab_inmutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from clinicas where id = old.clinica_id) then
    return old;
  end if;
  raise exception '%', coalesce(tg_argv[0],
    'Este registro es parte del historial de habilitación: no se modifica ni se borra.');
end;
$$;

comment on function fn_hab_inmutable() is
  'Append-only de habilitación: bloquea update/delete (también al service role) salvo la cascada de una clínica eliminada. security definer solo para leer clinicas sin RLS.';

-- ============================================================
-- 2. Evidencias (§1.4) — cuelgan de (sede, criterio), no de una
--    evaluación: sobreviven a las reevaluaciones.
-- ============================================================
-- Tipos en esta fase: archivo, nota, enlace. F6 (0069) agrega
-- documento_normativo / documento_habilitacion / registro_modulo con sus
-- columnas (tipo_documento_normativo_id, documento_clinica_id → tabla de
-- F7, fuente_codigo, fuente_parametros) y amplía el check: aquí no se
-- crean columnas que apunten a tablas que todavía no existen.
create table hab_evidencias (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  sede_id uuid not null references sedes(id),
  criterio_id uuid not null references hab_criterios(id),
  tipo text not null check (tipo in ('archivo', 'nota', 'enlace')),
  descripcion text not null check (length(btrim(descripcion)) between 3 and 4000),
  storage_path text,
  nombre_archivo text check (length(nombre_archivo) <= 255),
  mime text,
  tamano_bytes int check (tamano_bytes > 0 and tamano_bytes <= 10485760),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  url text check (url ~* '^https://' and length(url) <= 2000),
  sugerida_por_sistema boolean not null default false,
  created_by uuid not null references usuarios(id),
  created_at timestamptz not null default now(),
  retirada_en timestamptz,
  retirada_por uuid references usuarios(id),
  retiro_motivo text,
  constraint hab_evidencias_forma check (
    (tipo = 'archivo' and storage_path is not null and nombre_archivo is not null
      and mime is not null and tamano_bytes is not null and url is null)
    or (tipo = 'enlace' and url is not null and storage_path is null)
    or (tipo = 'nota' and url is null and storage_path is null)
  ),
  constraint hab_evidencias_retiro_completo check (
    (retirada_en is null and retirada_por is null and retiro_motivo is null)
    or (retirada_en is not null and retirada_por is not null and length(btrim(retiro_motivo)) >= 10)
  )
);

create index idx_hab_evidencias_clinica on hab_evidencias(clinica_id);
create index idx_hab_evidencias_sede_criterio on hab_evidencias(sede_id, criterio_id) where retirada_en is null;

-- Insert: autor = sesión (no lo decide la app), nace sin retiro, el
-- archivo vive en la carpeta de la clínica, y el criterio aplica a la sede
-- (no se cuelga evidencia de un criterio ajeno a lo declarado).
-- security invoker: el motor corre con el RLS de quien inserta.
create or replace function fn_hab_evidencia_validar_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  new.retirada_en := null;
  new.retirada_por := null;
  new.retiro_motivo := null;
  if new.tipo = 'archivo' and new.storage_path not like new.clinica_id::text || '/evidencias/%' then
    raise exception 'Ruta de archivo inválida para esta clínica.';
  end if;
  if not fn_hab_criterio_aplica(new.sede_id, new.criterio_id) then
    raise exception 'El criterio no aplica a esta sede con los servicios declarados.';
  end if;
  return new;
end;
$$;

-- Update: lo único permitido es retirarla UNA vez (quién y cuándo los pone
-- la BD). Lo demás no cambia.
create or replace function fn_hab_evidencia_solo_retiro()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.retirada_en is not null then
    raise exception 'Esta evidencia ya fue retirada.';
  end if;
  if new.retirada_en is null then
    raise exception 'La evidencia solo se puede retirar; no se edita.';
  end if;
  if (to_jsonb(new) - array['retirada_en', 'retirada_por', 'retiro_motivo'])
     is distinct from (to_jsonb(old) - array['retirada_en', 'retirada_por', 'retiro_motivo']) then
    raise exception 'La evidencia solo se puede retirar; no se edita.';
  end if;
  new.retirada_en := now();
  new.retirada_por := auth.uid();
  return new;
end;
$$;

create trigger hab_evidencias_validar_insert
  before insert on hab_evidencias
  for each row execute function fn_hab_evidencia_validar_insert();

create trigger hab_evidencias_solo_retiro
  before update on hab_evidencias
  for each row execute function fn_hab_evidencia_solo_retiro();

create trigger hab_evidencias_no_borrar
  before delete on hab_evidencias
  for each row execute function fn_hab_inmutable('Las evidencias no se borran: se retiran con un motivo.');

create trigger hab_evidencias_sede_misma_clinica
  before insert on hab_evidencias
  for each row execute function fn_hab_misma_clinica('sede_id', 'sedes', 'La sede no pertenece a esta clínica.');

-- Sin auditoría en delete (no hay delete; y en la cascada de una clínica
-- eliminada insertaría filas de auditoría huérfanas).
create trigger hab_evidencias_auditoria
  after insert or update on hab_evidencias
  for each row execute function fn_auditoria();

alter table hab_evidencias enable row level security;

create policy "hab_evidencias_select" on hab_evidencias
  for select to authenticated using (
    clinica_id = clinica_actual() and has_permission('habilitacion', 'VIEW')
  );

create policy "hab_evidencias_insert" on hab_evidencias
  for insert to authenticated with check (
    clinica_id = clinica_actual()
    and has_permission('habilitacion', 'CREATE')
    and has_entitlement('habilitacion', 'gestion')
  );

create policy "hab_evidencias_update" on hab_evidencias
  for update to authenticated using (
    clinica_id = clinica_actual()
    and has_permission('habilitacion', 'EDIT')
    and has_entitlement('habilitacion', 'gestion')
  )
  with check (clinica_id = clinica_actual());

-- ============================================================
-- 3. Evaluaciones (§1.4) — append-only puro (HU-4.2 AC4)
-- ============================================================
-- Cada cambio de estado es una fila nueva: la historia (quién, cuándo,
-- anterior → nuevo) es la tabla misma. 'pendiente' permite "deshacer" sin
-- borrar. fecha_verificacion en hora de Colombia (no UTC): después de las
-- 7 p. m. current_date ya es "mañana".
create table hab_evaluaciones (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  sede_id uuid not null references sedes(id),
  criterio_id uuid not null references hab_criterios(id),
  norma_id uuid not null references hab_normas(id),
  estado text not null check (estado in ('pendiente', 'cumple', 'no_cumple', 'no_aplica')),
  justificacion text check (length(justificacion) <= 2000),
  observacion text check (length(observacion) <= 4000),
  fecha_verificacion date not null default ((now() at time zone 'America/Bogota')::date),
  evaluado_por uuid not null references usuarios(id),
  created_at timestamptz not null default now(),
  -- HU-4.2 AC1: "No aplica" exige justificación escrita (≥ 10 caracteres).
  constraint hab_evaluaciones_no_aplica_justificada
    check (estado <> 'no_aplica' or length(btrim(coalesce(justificacion, ''))) >= 10)
);

create index idx_hab_evaluaciones_clinica on hab_evaluaciones(clinica_id);
-- La vigente de (sede, criterio) = la última: este índice la resuelve con
-- un solo salto (la sede ya implica la clínica).
create index idx_hab_evaluaciones_vigente on hab_evaluaciones(sede_id, criterio_id, created_at desc);

-- Validación (§1.4): el criterio aplica a la sede, no es encabezado ni
-- autorresuelto por remisión a 11.1, y "Cumple" exige ≥ 1 evidencia
-- activa si la clínica lo exige (hab_perfil_prestador.exigir_evidencia_cumple,
-- sí por defecto — también si no hay perfil). norma y autor los pone la BD.
-- security invoker: el motor y la lectura de evidencias corren con el RLS
-- de quien evalúa (un usuario sin VIEW no "ve" evidencias → no puede
-- marcar Cumple; el lado seguro).
create or replace function fn_hab_evaluacion_validar()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_criterio record;
  v_exigir boolean;
begin
  select c.norma_id, c.codigo, c.es_encabezado, c.remite_a_11_1
  into v_criterio
  from hab_criterios c
  where c.id = new.criterio_id;
  if not found then
    raise exception 'El criterio no existe.';
  end if;
  if v_criterio.es_encabezado then
    raise exception 'El criterio % es un encabezado ("Cuenta con:"): no se evalúa, su estado sale de sus criterios hijos.', v_criterio.codigo;
  end if;
  if v_criterio.remite_a_11_1 then
    raise exception 'El criterio % se cumple con los criterios de 11.1 de la sede: no se evalúa a mano.', v_criterio.codigo;
  end if;
  if not fn_hab_criterio_aplica(new.sede_id, new.criterio_id) then
    raise exception 'El criterio % no aplica a esta sede con los servicios declarados.', v_criterio.codigo;
  end if;

  new.norma_id := v_criterio.norma_id;
  new.evaluado_por := auth.uid();
  new.created_at := now();
  new.fecha_verificacion := (now() at time zone 'America/Bogota')::date;

  if new.estado = 'cumple' then
    select coalesce(
      (select p.exigir_evidencia_cumple from hab_perfil_prestador p where p.clinica_id = new.clinica_id),
      true
    ) into v_exigir;
    if v_exigir and not exists (
      select 1 from hab_evidencias e
      where e.clinica_id = new.clinica_id
        and e.sede_id = new.sede_id
        and e.criterio_id = new.criterio_id
        and e.retirada_en is null
    ) then
      raise exception 'Para marcar "Cumple" agrega al menos una evidencia (archivo, nota o enlace).';
    end if;
  end if;
  return new;
end;
$$;

create trigger hab_evaluaciones_validar
  before insert on hab_evaluaciones
  for each row execute function fn_hab_evaluacion_validar();

create trigger hab_evaluaciones_sede_misma_clinica
  before insert on hab_evaluaciones
  for each row execute function fn_hab_misma_clinica('sede_id', 'sedes', 'La sede no pertenece a esta clínica.');

create trigger hab_evaluaciones_inmutable
  before update or delete on hab_evaluaciones
  for each row execute function fn_hab_inmutable('Las evaluaciones no se modifican ni se borran: registra una nueva (la vigente es la última).');

-- AC4: quién, cuándo y el estado nuevo quedan también en auditoría.
create trigger hab_evaluaciones_auditoria
  after insert on hab_evaluaciones
  for each row execute function fn_auditoria();

alter table hab_evaluaciones enable row level security;

create policy "hab_evaluaciones_select" on hab_evaluaciones
  for select to authenticated using (
    clinica_id = clinica_actual() and has_permission('habilitacion', 'VIEW')
  );

create policy "hab_evaluaciones_insert" on hab_evaluaciones
  for insert to authenticated with check (
    clinica_id = clinica_actual()
    and has_permission('habilitacion', 'EDIT')
    and has_entitlement('habilitacion', 'gestion')
  );
-- Sin políticas de update ni delete.

-- security_invoker obligatorio: sin él la vista corre con los permisos de
-- su dueño y se salta el RLS de hab_evaluaciones.
create view hab_evaluaciones_vigentes
with (security_invoker = true) as
select distinct on (e.clinica_id, e.sede_id, e.criterio_id) e.*
from hab_evaluaciones e
order by e.clinica_id, e.sede_id, e.criterio_id, e.created_at desc, e.id desc;

-- RPC de evaluación (§1.4): evidencias nuevas + evaluación en UNA
-- transacción (si la evaluación falla, las evidencias no quedan). security
-- invoker: RLS y triggers aplican igual que un insert directo.
-- p_evidencias: [{ "tipo": "archivo"|"nota"|"enlace", "descripcion",
--   "url"?, "storage_path"?, "nombre_archivo"?, "mime"?, "tamano_bytes"?,
--   "sha256"? }]
-- Idempotente ante doble clic: si el estado, la justificación y la
-- observación son iguales a la vigente y no llegan evidencias nuevas,
-- devuelve la vigente sin insertar otra fila.
create or replace function fn_hab_evaluar(
  p_sede_id uuid,
  p_criterio_id uuid,
  p_estado text,
  p_justificacion text default null,
  p_observacion text default null,
  p_evidencias jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_clinica_id uuid := clinica_actual();
  v_vigente record;
  v_ev jsonb;
  v_id uuid;
begin
  if v_clinica_id is null then
    raise exception 'Sesión inválida.';
  end if;
  if jsonb_typeof(coalesce(p_evidencias, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_evidencias, '[]'::jsonb)) > 10 then
    raise exception 'Evidencias inválidas.';
  end if;

  select e.id, e.estado, e.justificacion, e.observacion into v_vigente
  from hab_evaluaciones e
  where e.sede_id = p_sede_id and e.criterio_id = p_criterio_id and e.clinica_id = v_clinica_id
  order by e.created_at desc, e.id desc
  limit 1;

  if found
     and v_vigente.estado = p_estado
     and v_vigente.justificacion is not distinct from nullif(btrim(p_justificacion), '')
     and v_vigente.observacion is not distinct from nullif(btrim(p_observacion), '')
     and jsonb_array_length(coalesce(p_evidencias, '[]'::jsonb)) = 0 then
    return v_vigente.id;
  end if;

  for v_ev in select * from jsonb_array_elements(coalesce(p_evidencias, '[]'::jsonb)) loop
    insert into hab_evidencias (clinica_id, sede_id, criterio_id, tipo, descripcion, url, storage_path,
      nombre_archivo, mime, tamano_bytes, sha256, created_by)
    values (v_clinica_id, p_sede_id, p_criterio_id, v_ev->>'tipo', v_ev->>'descripcion', v_ev->>'url',
      v_ev->>'storage_path', v_ev->>'nombre_archivo', v_ev->>'mime', (v_ev->>'tamano_bytes')::int,
      v_ev->>'sha256', auth.uid());
  end loop;

  insert into hab_evaluaciones (clinica_id, sede_id, criterio_id, norma_id, estado, justificacion, observacion, evaluado_por)
  values (v_clinica_id, p_sede_id, p_criterio_id,
    (select norma_id from hab_criterios where id = p_criterio_id),
    p_estado, nullif(btrim(p_justificacion), ''), nullif(btrim(p_observacion), ''), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function fn_hab_evaluar(uuid, uuid, text, text, text, jsonb) is
  'Registra una evaluación de habilitación (append-only) con sus evidencias nuevas en una transacción. security invoker: aplican RLS y triggers.';

-- ============================================================
-- 4. Asignaciones (HU-4.4) — gestión, no declaración: mutable y auditada
-- ============================================================
-- `id` propio además de la PK compuesta porque fn_auditoria() usa new.id.
create table hab_criterio_asignaciones (
  id uuid not null default gen_random_uuid() unique,
  clinica_id uuid not null references clinicas(id) on delete cascade,
  sede_id uuid not null references sedes(id),
  criterio_id uuid not null references hab_criterios(id),
  responsable_id uuid references usuarios(id) on delete set null,
  fecha_objetivo date,
  updated_by uuid references usuarios(id),
  updated_at timestamptz not null default now(),
  primary key (clinica_id, sede_id, criterio_id)
);

create index idx_hab_asignaciones_responsable on hab_criterio_asignaciones(responsable_id);

create trigger hab_criterio_asignaciones_set_updated_at
  before update on hab_criterio_asignaciones
  for each row execute function set_updated_at();

create trigger hab_criterio_asignaciones_sede_misma_clinica
  before insert or update of sede_id, clinica_id on hab_criterio_asignaciones
  for each row execute function fn_hab_misma_clinica('sede_id', 'sedes', 'La sede no pertenece a esta clínica.');

create trigger hab_criterio_asignaciones_responsable_misma_clinica
  before insert or update of responsable_id, clinica_id on hab_criterio_asignaciones
  for each row execute function fn_hab_misma_clinica('responsable_id', 'usuarios', 'El responsable no pertenece a esta clínica.');

create trigger hab_criterio_asignaciones_auditoria
  after insert or update or delete on hab_criterio_asignaciones
  for each row execute function fn_auditoria();

alter table hab_criterio_asignaciones enable row level security;

create policy "hab_criterio_asignaciones_select" on hab_criterio_asignaciones
  for select to authenticated using (
    clinica_id = clinica_actual() and has_permission('habilitacion', 'VIEW')
  );

create policy "hab_criterio_asignaciones_insert" on hab_criterio_asignaciones
  for insert to authenticated with check (
    clinica_id = clinica_actual()
    and has_permission('habilitacion', 'EDIT')
    and has_entitlement('habilitacion', 'gestion')
  );

create policy "hab_criterio_asignaciones_update" on hab_criterio_asignaciones
  for update to authenticated using (
    clinica_id = clinica_actual()
    and has_permission('habilitacion', 'EDIT')
    and has_entitlement('habilitacion', 'gestion')
  )
  with check (clinica_id = clinica_actual());

create policy "hab_criterio_asignaciones_delete" on hab_criterio_asignaciones
  for delete to authenticated using (
    clinica_id = clinica_actual()
    and has_permission('habilitacion', 'EDIT')
    and has_entitlement('habilitacion', 'gestion')
  );

-- ============================================================
-- 5. Planes de mejora (HU-4.5)
-- ============================================================
-- Nacen de un "No cumple" (evaluacion_id). Estados abierta → en_curso →
-- cerrada; una vez cerrada es inmutable (si hay que reabrir, se crea otro
-- plan). Cerrar NO cambia el criterio a Cumple (AC3): la UI sugiere
-- re-evaluar. Sin delete.
create table hab_planes_mejora (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  sede_id uuid not null references sedes(id),
  criterio_id uuid not null references hab_criterios(id),
  evaluacion_id uuid not null references hab_evaluaciones(id),
  accion text not null check (length(btrim(accion)) between 10 and 2000),
  responsable_id uuid not null references usuarios(id),
  fecha_compromiso date not null,
  estado text not null default 'abierta' check (estado in ('abierta', 'en_curso', 'cerrada')),
  cierre_storage_path text,
  cierre_nombre_archivo text check (length(cierre_nombre_archivo) <= 255),
  cierre_mime text,
  cierre_tamano_bytes int check (cierre_tamano_bytes > 0 and cierre_tamano_bytes <= 10485760),
  cierre_observacion text check (length(cierre_observacion) <= 4000),
  fecha_cierre date,
  created_by uuid not null references usuarios(id),
  created_at timestamptz not null default now(),
  updated_by uuid references usuarios(id),
  updated_at timestamptz not null default now(),
  -- AC1: el cierre lleva su soporte (observación o archivo) y su fecha.
  constraint hab_planes_mejora_cierre_con_soporte check (
    estado <> 'cerrada'
    or (fecha_cierre is not null
      and (length(btrim(coalesce(cierre_observacion, ''))) >= 10 or cierre_storage_path is not null))
  ),
  constraint hab_planes_mejora_archivo_completo check (
    (cierre_storage_path is null and cierre_nombre_archivo is null and cierre_mime is null and cierre_tamano_bytes is null)
    or (cierre_storage_path is not null and cierre_nombre_archivo is not null and cierre_mime is not null and cierre_tamano_bytes is not null)
  )
);

create index idx_hab_planes_mejora_clinica on hab_planes_mejora(clinica_id);
create index idx_hab_planes_mejora_sede_criterio on hab_planes_mejora(sede_id, criterio_id);
create index idx_hab_planes_mejora_compromiso on hab_planes_mejora(clinica_id, fecha_compromiso) where estado <> 'cerrada';

-- Insert: el plan cuelga de un "No cumple" de la MISMA clínica, sede y
-- criterio (no de cualquier evaluación que el cliente mande); nace
-- abierto y sin cierre; autor = sesión.
create or replace function fn_hab_plan_mejora_validar_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from hab_evaluaciones e
    where e.id = new.evaluacion_id
      and e.clinica_id = new.clinica_id
      and e.sede_id = new.sede_id
      and e.criterio_id = new.criterio_id
      and e.estado = 'no_cumple'
  ) then
    raise exception 'El plan de mejora debe nacer de un "No cumple" de este criterio en esta sede.';
  end if;
  new.estado := 'abierta';
  new.cierre_storage_path := null;
  new.cierre_nombre_archivo := null;
  new.cierre_mime := null;
  new.cierre_tamano_bytes := null;
  new.cierre_observacion := null;
  new.fecha_cierre := null;
  new.created_by := auth.uid();
  new.created_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- Update: cerrada = inmutable; el origen (clínica, sede, criterio,
-- evaluación, autor) nunca cambia; no se vuelve atrás de en_curso a
-- abierta... sí se permite (el trabajo se pausa), pero nunca desde
-- cerrada. El cierre solo se escribe al cerrar.
create or replace function fn_hab_plan_mejora_validar_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.estado = 'cerrada' then
    raise exception 'El plan de mejora ya está cerrado: no se modifica. Si hace falta, crea un plan nuevo.';
  end if;
  if new.clinica_id <> old.clinica_id or new.sede_id <> old.sede_id or new.criterio_id <> old.criterio_id
     or new.evaluacion_id <> old.evaluacion_id or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception 'El origen del plan de mejora no se modifica.';
  end if;
  if new.estado <> 'cerrada' and (new.cierre_storage_path is not null or new.cierre_observacion is not null or new.fecha_cierre is not null) then
    raise exception 'Los datos de cierre solo se registran al cerrar el plan.';
  end if;
  if new.cierre_storage_path is not null and new.cierre_storage_path not like new.clinica_id::text || '/planes/%' then
    raise exception 'Ruta de archivo inválida para esta clínica.';
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger hab_planes_mejora_validar_insert
  before insert on hab_planes_mejora
  for each row execute function fn_hab_plan_mejora_validar_insert();

create trigger hab_planes_mejora_validar_update
  before update on hab_planes_mejora
  for each row execute function fn_hab_plan_mejora_validar_update();

create trigger hab_planes_mejora_set_updated_at
  before update on hab_planes_mejora
  for each row execute function set_updated_at();

create trigger hab_planes_mejora_no_borrar
  before delete on hab_planes_mejora
  for each row execute function fn_hab_inmutable('Los planes de mejora no se borran.');

create trigger hab_planes_mejora_responsable_misma_clinica
  before insert or update of responsable_id, clinica_id on hab_planes_mejora
  for each row execute function fn_hab_misma_clinica('responsable_id', 'usuarios', 'El responsable no pertenece a esta clínica.');

create trigger hab_planes_mejora_auditoria
  after insert or update on hab_planes_mejora
  for each row execute function fn_auditoria();

alter table hab_planes_mejora enable row level security;

create policy "hab_planes_mejora_select" on hab_planes_mejora
  for select to authenticated using (
    clinica_id = clinica_actual() and has_permission('habilitacion', 'VIEW')
  );

create policy "hab_planes_mejora_insert" on hab_planes_mejora
  for insert to authenticated with check (
    clinica_id = clinica_actual()
    and has_permission('habilitacion', 'CREATE')
    and has_entitlement('habilitacion', 'gestion')
  );

create policy "hab_planes_mejora_update" on hab_planes_mejora
  for update to authenticated using (
    clinica_id = clinica_actual()
    and has_permission('habilitacion', 'EDIT')
    and has_entitlement('habilitacion', 'gestion')
  )
  with check (clinica_id = clinica_actual());

-- ============================================================
-- 6. Instantánea de autoevaluación (HU-4.6) — tablas para F10
-- ============================================================
-- La inserción será SOLO por la RPC fn_hab_cerrar_autoevaluacion (F10),
-- que calcula el conjunto con el mismo motor y los resúmenes de evidencia
-- dentro de la BD. ocurrencia_id sin FK todavía: hab_obligacion_ocurrencias
-- llega en F8 (0068); F10 agrega la FK.
create table hab_autoevaluaciones (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 3 and 200),
  motivo text not null
    check (motivo in ('inscripcion', 'cuarto_anio', 'renovacion_anual', 'novedad', 'levantamiento_medida')),
  norma_id uuid not null references hab_normas(id),
  fecha_cierre timestamptz not null default now(),
  cerrado_por uuid not null references usuarios(id),
  fecha_declaracion_reps date,
  confirmo_servicios_no_aptos boolean not null,
  servicios_no_aptos jsonb not null default '[]'::jsonb,
  resumen jsonb not null,
  ocurrencia_id uuid,
  anulado boolean not null default false,
  anulado_motivo text,
  anulado_por uuid references usuarios(id),
  anulado_en timestamptz,
  constraint hab_autoevaluaciones_anulacion_completa check (
    (not anulado and anulado_motivo is null and anulado_por is null and anulado_en is null)
    or (anulado and length(btrim(coalesce(anulado_motivo, ''))) >= 10 and anulado_por is not null and anulado_en is not null)
  )
);

create index idx_hab_autoevaluaciones_clinica on hab_autoevaluaciones(clinica_id, fecha_cierre desc);

-- Inmutable salvo (a) fecha_declaracion_reps de null → valor UNA vez
-- (AC4: se digita después de declarar en el REPS) y (b) anulación.
create or replace function fn_hab_autoevaluacion_solo_declarar_o_anular()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_permitidas text[] := array['fecha_declaracion_reps', 'anulado', 'anulado_motivo', 'anulado_por', 'anulado_en'];
begin
  if (to_jsonb(new) - v_permitidas) is distinct from (to_jsonb(old) - v_permitidas) then
    raise exception 'La autoevaluación cerrada es una foto inmutable.';
  end if;
  if old.anulado then
    raise exception 'La autoevaluación ya está anulada.';
  end if;
  if new.fecha_declaracion_reps is distinct from old.fecha_declaracion_reps then
    if old.fecha_declaracion_reps is not null then
      raise exception 'La fecha de declaración en el REPS ya fue registrada.';
    end if;
    if not has_permission('habilitacion', 'APPROVE') then
      raise exception 'No tienes permiso para registrar la declaración.';
    end if;
  end if;
  if new.anulado and not old.anulado then
    if not has_permission('habilitacion', 'VOID') then
      raise exception 'No tienes permiso para anular la autoevaluación.';
    end if;
    new.anulado_por := auth.uid();
    new.anulado_en := now();
  elsif new.anulado is distinct from old.anulado then
    raise exception 'La anulación no se revierte.';
  end if;
  return new;
end;
$$;

create trigger hab_autoevaluaciones_solo_declarar_o_anular
  before update on hab_autoevaluaciones
  for each row execute function fn_hab_autoevaluacion_solo_declarar_o_anular();

create trigger hab_autoevaluaciones_no_borrar
  before delete on hab_autoevaluaciones
  for each row execute function fn_hab_inmutable('La autoevaluación cerrada no se borra: se anula con un motivo.');

create trigger hab_autoevaluaciones_auditoria
  after insert or update on hab_autoevaluaciones
  for each row execute function fn_auditoria();

alter table hab_autoevaluaciones enable row level security;

create policy "hab_autoevaluaciones_select" on hab_autoevaluaciones
  for select to authenticated using (
    clinica_id = clinica_actual() and has_permission('habilitacion', 'VIEW')
  );

create policy "hab_autoevaluaciones_insert" on hab_autoevaluaciones
  for insert to authenticated with check (
    clinica_id = clinica_actual()
    and has_permission('habilitacion', 'APPROVE')
    and has_entitlement('habilitacion', 'gestion')
  );

create policy "hab_autoevaluaciones_update" on hab_autoevaluaciones
  for update to authenticated using (
    clinica_id = clinica_actual()
    and (has_permission('habilitacion', 'APPROVE') or has_permission('habilitacion', 'VOID'))
    and has_entitlement('habilitacion', 'gestion')
  )
  with check (clinica_id = clinica_actual());

-- Detalle (~450 filas por cierre). texto_literal y evidencias son
-- SNAPSHOT: si EWAH corrige luego una errata del catálogo, lo declarado no
-- cambia. Sin fn_auditoria (450 filas de auditoría por cierre no aportan;
-- la cabecera sí se audita).
create table hab_autoevaluacion_detalle (
  autoevaluacion_id uuid not null references hab_autoevaluaciones(id) on delete cascade,
  clinica_id uuid not null references clinicas(id) on delete cascade,
  sede_id uuid not null references sedes(id),
  criterio_id uuid not null references hab_criterios(id),
  sede_nombre text not null,
  servicio_clave text not null,
  estandar_codigo text not null,
  criterio_codigo text not null,
  texto_literal text not null,
  estado text not null check (estado in ('pendiente', 'cumple', 'no_cumple', 'no_aplica')),
  origen text not null check (origen in ('directo', 'transversal', 'remision', 'autorresuelto', 'encabezado')),
  remitido_desde_codigo text,
  justificacion text,
  evaluacion_id uuid references hab_evaluaciones(id),
  evaluado_por uuid references usuarios(id),
  fecha_verificacion date,
  evidencias jsonb not null default '[]'::jsonb,
  primary key (autoevaluacion_id, sede_id, criterio_id)
);

create index idx_hab_autoevaluacion_detalle_clinica on hab_autoevaluacion_detalle(clinica_id);

create trigger hab_autoevaluacion_detalle_inmutable
  before update or delete on hab_autoevaluacion_detalle
  for each row execute function fn_hab_inmutable('El detalle de una autoevaluación cerrada no se modifica ni se borra.');

alter table hab_autoevaluacion_detalle enable row level security;

create policy "hab_autoevaluacion_detalle_select" on hab_autoevaluacion_detalle
  for select to authenticated using (
    clinica_id = clinica_actual() and has_permission('habilitacion', 'VIEW')
  );

create policy "hab_autoevaluacion_detalle_insert" on hab_autoevaluacion_detalle
  for insert to authenticated with check (
    clinica_id = clinica_actual()
    and has_permission('habilitacion', 'APPROVE')
    and has_entitlement('habilitacion', 'gestion')
  );

-- ============================================================
-- 7. No borrar un servicio de una sede con autoevaluación (§1.7)
-- ============================================================
-- Conservador a propósito: si la sede ya tiene CUALQUIER evaluación y el
-- servicio participaba del motor (tiene numeral), no se borra — quitarlo
-- cambiaría qué criterios aplican (incluidos los que entran por remisión
-- y los de 11.1 si era el único servicio) y dejaría evaluaciones
-- huérfanas de su contexto. La salida es cambiarlo a "Cerrado" (sale del
-- motor y conserva el historial). security definer: quien borra desde
-- Datos básicos (admin) debe ver las evaluaciones aunque no tenga
-- habilitacion/VIEW. La cascada de una clínica eliminada sí pasa.
create or replace function fn_servicio_habilitado_no_borrar_evaluado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.sede_id is null or old.servicio_norma_id is null then
    return old;
  end if;
  if not exists (select 1 from clinicas where id = old.clinica_id) then
    return old;
  end if;
  if exists (
    select 1 from hab_evaluaciones e
    where e.clinica_id = old.clinica_id and e.sede_id = old.sede_id
  ) then
    raise exception 'Este servicio ya tiene autoevaluación registrada en esa sede y no se puede eliminar. Si dejaste de prestarlo, cámbialo a "Cerrado" en Habilitación > Sedes y servicios: el historial se conserva.';
  end if;
  return old;
end;
$$;

create trigger clinica_servicios_habilitados_no_borrar_evaluado
  before delete on clinica_servicios_habilitados
  for each row execute function fn_servicio_habilitado_no_borrar_evaluado();

-- ============================================================
-- 8. Lecturas para la pantalla (§1.6, §5.5)
-- ============================================================
-- Tablero v2: misma forma de 0065 + 2 columnas (reverificar,
-- planes_abiertos) y un filtro por estándar resuelto en el servidor. Como
-- cambia la firma, Postgres exige drop + create (nadie la consumía aún
-- fuera de scripts/habilitacion/probar-motor.mjs). Llamarla solo con
-- p_sede_id sigue funcionando (p_estandar tiene default).
drop function if exists fn_hab_tablero_criterios(uuid);

create function fn_hab_tablero_criterios(p_sede_id uuid, p_estandar text default null)
returns table (
  sede_id uuid,
  criterio_id uuid,
  codigo text,
  numero text,
  nivel smallint,
  padre_id uuid,
  orden int,
  texto_literal text,
  pagina int,
  confianza text,
  motivo_confianza_baja text,
  nota_vigencia text,
  vigente_hasta date,
  es_encabezado boolean,
  autorresuelto boolean,
  origen text,
  remitido_desde_criterio_id uuid,
  remitido_desde_codigo text,
  en_cierre_temporal boolean,
  servicio_norma_id uuid,
  servicio_clave text,
  servicio_nombre text,
  servicio_orden int,
  estandar_codigo text,
  estandar_sigla text,
  estandar_nombre text,
  estandar_orden int,
  bloque_id uuid,
  bloque_encabezado text,
  bloque_subtitulo text,
  evaluacion_id uuid,
  estado text,
  justificacion text,
  observacion text,
  fecha_verificacion date,
  evaluado_por uuid,
  evaluado_en timestamptz,
  responsable_id uuid,
  fecha_objetivo date,
  evidencias_activas int,
  reverificar boolean,
  planes_abiertos int
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    a.sede_id, c.id, c.codigo, c.numero, c.nivel, c.padre_id, c.orden, c.texto_literal, c.pagina,
    c.confianza, c.motivo_confianza_baja, c.nota_vigencia, c.vigente_hasta,
    a.es_encabezado, a.autorresuelto, a.origen, a.remitido_desde_criterio_id, rd.codigo,
    a.en_cierre_temporal,
    sn.id, sn.clave, sn.nombre, sn.orden,
    e.codigo, e.sigla, e.nombre, e.orden,
    b.id, b.encabezado_literal, b.subtitulo,
    v.id, v.estado, v.justificacion, v.observacion, v.fecha_verificacion, v.evaluado_por, v.created_at,
    asg.responsable_id, asg.fecha_objetivo,
    coalesce(ev.n, 0),
    -- HU-4.4 AC2: > 12 meses desde la última verificación (la
    -- autoevaluación es anual, art. 10). Se calcula, no se guarda.
    coalesce(v.estado in ('cumple', 'no_cumple', 'no_aplica')
      and v.fecha_verificacion <= ((now() at time zone 'America/Bogota')::date - interval '12 months')::date, false),
    coalesce(pm.n, 0)
  from fn_hab_criterios_aplicables(p_sede_id, current_date) a
  join hab_criterios c on c.id = a.criterio_id
  join hab_servicios_norma sn on sn.id = c.servicio_norma_id
  join hab_estandares e on e.codigo = c.estandar_codigo
  join hab_bloques b on b.id = c.bloque_id
  left join hab_criterios rd on rd.id = a.remitido_desde_criterio_id
  left join lateral (
    select x.id, x.estado, x.justificacion, x.observacion, x.fecha_verificacion, x.evaluado_por, x.created_at
    from hab_evaluaciones x
    where x.sede_id = a.sede_id and x.criterio_id = a.criterio_id
    order by x.created_at desc, x.id desc
    limit 1
  ) v on true
  left join hab_criterio_asignaciones asg
    on asg.sede_id = a.sede_id and asg.criterio_id = a.criterio_id and asg.clinica_id = clinica_actual()
  left join lateral (
    select count(*)::int as n
    from hab_evidencias x
    where x.sede_id = a.sede_id and x.criterio_id = a.criterio_id and x.retirada_en is null
  ) ev on true
  left join lateral (
    select count(*)::int as n
    from hab_planes_mejora x
    where x.sede_id = a.sede_id and x.criterio_id = a.criterio_id and x.estado <> 'cerrada'
  ) pm on true
  where p_sede_id is not null
    and (p_estandar is null or c.estandar_codigo = p_estandar)
  order by sn.orden, e.orden, c.orden;
$$;

comment on function fn_hab_tablero_criterios(uuid, text) is
  'Criterios aplicables de una sede (opcionalmente de un estándar) con textos, evaluación vigente, asignación, evidencias activas, re-verificar y planes abiertos. Una ida a la BD por pestaña.';

-- Progreso agregado por (sede, servicio de la norma, estándar), SIN
-- textos: alimenta las 7 pestañas ("Talento humano 12/31"), la cabecera
-- (N criterios, M autorresueltos, E encabezados), el selector de sede, el
-- paso 4 de la ruta y, en F10, el estado de declaración por servicio. Los
-- porcentajes los calcula lib/habilitacion/estado-criterio.ts sobre estas
-- filas (aquí solo se cuenta). p_sede_id null = todas las sedes activas.
create or replace function fn_hab_progreso_autoevaluacion(p_sede_id uuid default null)
returns table (
  sede_id uuid,
  servicio_norma_id uuid,
  servicio_clave text,
  estandar_codigo text,
  total int,
  encabezados int,
  autorresueltos int,
  evaluables int,
  cumple int,
  no_cumple int,
  no_aplica int,
  sin_evaluar int,
  reverificar int,
  asignados_a_mi int,
  planes_abiertos int
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select
      a.sede_id, a.servicio_norma_id, a.estandar_codigo,
      a.es_encabezado,
      a.autorresuelto and not a.es_encabezado as auto,
      not a.es_encabezado and not a.autorresuelto as evaluable,
      v.estado, v.fecha_verificacion,
      asg.responsable_id,
      exists (
        select 1 from hab_planes_mejora pm
        where pm.sede_id = a.sede_id and pm.criterio_id = a.criterio_id and pm.estado <> 'cerrada'
      ) as con_plan
    from fn_hab_criterios_aplicables(p_sede_id, current_date) a
    left join lateral (
      select x.estado, x.fecha_verificacion
      from hab_evaluaciones x
      where x.sede_id = a.sede_id and x.criterio_id = a.criterio_id
      order by x.created_at desc, x.id desc
      limit 1
    ) v on true
    left join hab_criterio_asignaciones asg
      on asg.sede_id = a.sede_id and asg.criterio_id = a.criterio_id and asg.clinica_id = clinica_actual()
  )
  select
    b.sede_id, b.servicio_norma_id, sn.clave, b.estandar_codigo,
    count(*)::int,
    count(*) filter (where b.es_encabezado)::int,
    count(*) filter (where b.auto)::int,
    count(*) filter (where b.evaluable)::int,
    count(*) filter (where b.evaluable and b.estado = 'cumple')::int,
    count(*) filter (where b.evaluable and b.estado = 'no_cumple')::int,
    count(*) filter (where b.evaluable and b.estado = 'no_aplica')::int,
    count(*) filter (where b.evaluable and coalesce(b.estado, 'pendiente') = 'pendiente')::int,
    count(*) filter (where b.evaluable and b.estado in ('cumple', 'no_cumple', 'no_aplica')
      and b.fecha_verificacion <= ((now() at time zone 'America/Bogota')::date - interval '12 months')::date)::int,
    count(*) filter (where b.evaluable and b.responsable_id = auth.uid())::int,
    count(*) filter (where b.con_plan)::int
  from base b
  join hab_servicios_norma sn on sn.id = b.servicio_norma_id
  group by b.sede_id, b.servicio_norma_id, sn.clave, sn.orden, b.estandar_codigo
  order by b.sede_id, sn.orden, b.estandar_codigo;
$$;

comment on function fn_hab_progreso_autoevaluacion(uuid) is
  'Contadores de autoevaluación por sede × servicio de la norma × estándar (sin textos). Los porcentajes se calculan en lib/habilitacion/estado-criterio.ts.';

-- ============================================================
-- 9. Privilegios
-- ============================================================
revoke execute on function fn_hab_tablero_criterios(uuid, text) from public, anon;
revoke execute on function fn_hab_progreso_autoevaluacion(uuid) from public, anon;
revoke execute on function fn_hab_evaluar(uuid, uuid, text, text, text, jsonb) from public, anon;
grant execute on function fn_hab_tablero_criterios(uuid, text) to authenticated;
grant execute on function fn_hab_progreso_autoevaluacion(uuid) to authenticated;
grant execute on function fn_hab_evaluar(uuid, uuid, text, text, text, jsonb) to authenticated;
