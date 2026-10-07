-- ============================================================
-- 0073 · SG-SST F3 · Incidentes, accidentes y enfermedad laboral
-- ============================================================
-- Diseño: docs/sgsst/diseno-tecnico-sgsst.md, fila F3.
--   1. accidentes_trabajo (0048, sin prefijo a propósito) se amplía en vez
--      de duplicarse: tipo de evento, gravedad, lugar, lesión, riesgo
--      biológico, FURAT y reportes a ARL, EPS y MinTrabajo. Los plazos
--      (2 días hábiles para reportar y 15 días para investigar) los fija
--      la BD con los festivos sembrados, no el cliente. RRHH sigue con sus
--      políticas; SG-SST suma las suyas.
--   2. sst_investigaciones (1:1 con el evento): equipo, causas, metodología.
--   3. sst_acciones: plan de acción GENÉRICO (de investigaciones ahora; de
--      la matriz de peligros, la autoevaluación y las inspecciones en
--      fases siguientes). Una vez cerrada, inmutable.
--   4. Bucket privado `sst` (informes, actas, soportes).

-- ============================================================
-- 1. Eventos
-- ============================================================
alter table accidentes_trabajo
  add column tipo_evento text not null default 'accidente'
    check (tipo_evento in ('incidente', 'accidente', 'enfermedad_laboral')),
  add column hora time,
  add column sede_id uuid references sedes(id),
  add column lugar text check (length(lugar) <= 200),
  add column gravedad text check (gravedad in ('leve', 'grave', 'mortal')),
  add column tipo_lesion text check (length(tipo_lesion) <= 200),
  add column parte_cuerpo text check (length(parte_cuerpo) <= 200),
  add column agente text check (length(agente) <= 200),
  add column riesgo_biologico boolean not null default false,
  add column seguimiento_biologico text check (length(seguimiento_biologico) <= 2000),
  add column dias_incapacidad int not null default 0 check (dias_incapacidad between 0 and 3650),
  add column dias_cargados int not null default 0 check (dias_cargados between 0 and 6000),
  add column furat_numero text check (length(furat_numero) <= 100),
  add column reportado_eps boolean not null default false,
  add column fecha_reporte_eps date,
  add column reportado_mintrabajo boolean not null default false,
  add column fecha_reporte_mintrabajo date,
  add column radicado_mintrabajo text check (length(radicado_mintrabajo) <= 100),
  add column fecha_limite_reporte date,
  add column fecha_limite_investigacion date,
  add column updated_by uuid references usuarios(id) on delete set null;

-- Un reporte marcado lleva su fecha. NOT VALID: las filas viejas de RRHH
-- no se revalidan; toda escritura nueva sí.
alter table accidentes_trabajo add constraint accidentes_reportes_con_fecha check (
  (not reportado_arl or fecha_reporte_arl is not null)
  and (not reportado_eps or fecha_reporte_eps is not null)
  and (not reportado_mintrabajo or fecha_reporte_mintrabajo is not null)
) not valid;
-- El incidente no tiene lesión: no lleva gravedad ni días.
alter table accidentes_trabajo add constraint accidentes_incidente_sin_lesion check (
  tipo_evento <> 'incidente' or (gravedad is null and dias_incapacidad = 0 and dias_cargados = 0)
) not valid;

create or replace function fn_sst_evento_plazos()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Reporte a la ARL y la EPS: 2 días hábiles desde el evento (o el
  -- diagnóstico de la enfermedad laboral); el grave o mortal también a
  -- MinTrabajo en el mismo plazo. Investigación: 15 días.
  new.fecha_limite_reporte := fn_hab_sumar_dias_habiles(new.fecha, 2);
  new.fecha_limite_investigacion := new.fecha + 15;
  if new.fecha > (now() at time zone 'America/Bogota')::date then
    raise exception 'La fecha del evento no puede ser futura.';
  end if;
  if new.reportado_mintrabajo and coalesce(new.gravedad, 'leve') = 'leve' then
    raise exception 'El reporte a MinTrabajo es para accidentes graves o mortales.';
  end if;
  return new;
end;
$$;

create trigger accidentes_trabajo_plazos
  before insert or update of fecha, gravedad, reportado_mintrabajo on accidentes_trabajo
  for each row execute function fn_sst_evento_plazos();

create trigger accidentes_00_autor before insert or update on accidentes_trabajo
  for each row execute function fn_hab_forzar_autor();
create trigger accidentes_trabajo_empleado_misma_clinica
  before insert or update of empleado_id, clinica_id on accidentes_trabajo
  for each row execute function fn_hab_misma_clinica('empleado_id', 'empleados', 'La persona no pertenece a esta clínica.');
create trigger accidentes_trabajo_sede_misma_clinica
  before insert or update of sede_id, clinica_id on accidentes_trabajo
  for each row execute function fn_hab_misma_clinica('sede_id', 'sedes', 'La sede no pertenece a esta clínica.');

-- Plazos de las filas que ya existían.
update accidentes_trabajo
set fecha_limite_reporte = fn_hab_sumar_dias_habiles(fecha, 2),
    fecha_limite_investigacion = fecha + 15
where fecha_limite_reporte is null;

create policy "accidentes_trabajo_select_sst" on accidentes_trabajo
  for select using (clinica_id = clinica_actual() and has_permission('sst', 'VIEW'));
create policy "accidentes_trabajo_insert_sst" on accidentes_trabajo
  for insert with check (clinica_id = clinica_actual() and has_permission('sst', 'CREATE'));
create policy "accidentes_trabajo_update_sst" on accidentes_trabajo
  for update using (clinica_id = clinica_actual() and has_permission('sst', 'EDIT'))
  with check (clinica_id = clinica_actual());

-- ============================================================
-- 2. Investigación (Res. 1401 de 2007)
-- ============================================================
create table sst_investigaciones (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  accidente_id uuid not null unique references accidentes_trabajo(id) on delete cascade,
  fecha_inicio date not null,
  -- [{ "nombre": "...", "rol": "jefe_inmediato|copasst_vigia|responsable_sst|profesional_licencia|otro" }]
  equipo jsonb not null default '[]'::jsonb check (jsonb_typeof(equipo) = 'array' and jsonb_array_length(equipo) <= 20),
  descripcion text check (length(descripcion) <= 8000),
  metodologia text check (metodologia in ('arbol_causas', 'cinco_porques', 'espina_pescado', 'otra')),
  causas_inmediatas text check (length(causas_inmediatas) <= 4000),
  causas_basicas text check (length(causas_basicas) <= 4000),
  conclusiones text check (length(conclusiones) <= 4000),
  estado text not null default 'en_curso' check (estado in ('en_curso', 'cerrada')),
  fecha_cierre date,
  informe_storage_path text,
  informe_nombre_archivo text check (length(informe_nombre_archivo) <= 255),
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references usuarios(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint sst_investigacion_cierre check (
    estado <> 'cerrada' or (fecha_cierre is not null and length(btrim(coalesce(causas_inmediatas, ''))) >= 10
      and length(btrim(coalesce(causas_basicas, ''))) >= 10 and jsonb_array_length(equipo) >= 1)
  ),
  constraint sst_investigacion_archivo_propio check (
    informe_storage_path is null or split_part(informe_storage_path, '/', 1) = clinica_id::text
  )
);

create or replace function fn_sst_investigacion_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.estado = 'cerrada' then
      raise exception 'La investigación está cerrada: no se modifica.';
    end if;
    if new.accidente_id <> old.accidente_id or new.clinica_id <> old.clinica_id then
      raise exception 'La investigación no cambia de evento.';
    end if;
  end if;
  if new.fecha_cierre is not null and new.fecha_cierre < new.fecha_inicio then
    raise exception 'El cierre no puede ser anterior al inicio de la investigación.';
  end if;
  if new.fecha_inicio > (now() at time zone 'America/Bogota')::date
     or new.fecha_cierre > (now() at time zone 'America/Bogota')::date then
    raise exception 'Las fechas de la investigación no pueden ser futuras.';
  end if;
  return new;
end;
$$;

create trigger sst_investigaciones_00_autor before insert or update on sst_investigaciones
  for each row execute function fn_hab_forzar_autor();
create trigger sst_investigaciones_proteger before insert or update on sst_investigaciones
  for each row execute function fn_sst_investigacion_proteger();
create trigger sst_investigaciones_evento_misma_clinica
  before insert or update of accidente_id, clinica_id on sst_investigaciones
  for each row execute function fn_hab_misma_clinica('accidente_id', 'accidentes_trabajo', 'El evento no pertenece a esta clínica.');
create trigger sst_investigaciones_set_updated_at before update on sst_investigaciones
  for each row execute function set_updated_at();
create trigger sst_investigaciones_auditoria after insert or update on sst_investigaciones
  for each row execute function fn_auditoria();

alter table sst_investigaciones enable row level security;
create policy "sst_investigaciones_select" on sst_investigaciones
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('sst', 'VIEW'));
create policy "sst_investigaciones_insert" on sst_investigaciones
  for insert to authenticated with check (clinica_id = clinica_actual() and has_permission('sst', 'CREATE'));
create policy "sst_investigaciones_update" on sst_investigaciones
  for update to authenticated using (clinica_id = clinica_actual() and has_permission('sst', 'EDIT'))
  with check (clinica_id = clinica_actual());

-- ============================================================
-- 3. Plan de acción (genérico)
-- ============================================================
create table sst_acciones (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  origen text not null check (origen in ('investigacion', 'matriz', 'autoevaluacion', 'inspeccion', 'auditoria', 'otro')),
  origen_id uuid,
  tipo text not null default 'correctiva' check (tipo in ('correctiva', 'preventiva', 'mejora')),
  descripcion text not null check (length(btrim(descripcion)) between 10 and 2000),
  responsable_id uuid not null references usuarios(id),
  fecha_compromiso date not null,
  estado text not null default 'abierta' check (estado in ('abierta', 'en_curso', 'cerrada')),
  fecha_cierre date,
  cierre_observacion text check (length(cierre_observacion) <= 4000),
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references usuarios(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint sst_accion_cierre check (
    estado <> 'cerrada' or (fecha_cierre is not null and length(btrim(coalesce(cierre_observacion, ''))) >= 10)
  )
);

create index idx_sst_acciones_origen on sst_acciones(clinica_id, origen, origen_id);
create index idx_sst_acciones_pendientes on sst_acciones(clinica_id, fecha_compromiso) where estado <> 'cerrada';

-- El origen debe ser de la clínica (hoy: investigaciones; las demás
-- fuentes agregan su rama cuando existan).
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
  if new.estado = 'cerrada' and new.fecha_cierre > (now() at time zone 'America/Bogota')::date then
    raise exception 'La fecha de cierre no puede ser futura.';
  end if;
  return new;
end;
$$;

create trigger sst_acciones_00_autor before insert or update on sst_acciones
  for each row execute function fn_hab_forzar_autor();
create trigger sst_acciones_proteger before insert or update on sst_acciones
  for each row execute function fn_sst_accion_proteger();
create trigger sst_acciones_responsable_misma_clinica
  before insert or update of responsable_id, clinica_id on sst_acciones
  for each row execute function fn_hab_misma_clinica('responsable_id', 'usuarios', 'El responsable no pertenece a esta clínica.');
create trigger sst_acciones_set_updated_at before update on sst_acciones
  for each row execute function set_updated_at();
create trigger sst_acciones_auditoria after insert or update on sst_acciones
  for each row execute function fn_auditoria();

alter table sst_acciones enable row level security;
create policy "sst_acciones_select" on sst_acciones
  for select to authenticated using (clinica_id = clinica_actual() and has_permission('sst', 'VIEW'));
create policy "sst_acciones_insert" on sst_acciones
  for insert to authenticated with check (clinica_id = clinica_actual() and has_permission('sst', 'CREATE'));
create policy "sst_acciones_update" on sst_acciones
  for update to authenticated using (clinica_id = clinica_actual() and has_permission('sst', 'EDIT'))
  with check (clinica_id = clinica_actual());

-- ============================================================
-- 4. Bucket `sst`
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sst', 'sst', false, 10485760, array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
])
on conflict (id) do nothing;

create policy "sst_storage_select" on storage.objects
  for select using (
    bucket_id = 'sst' and (storage.foldername(name))[1] = clinica_actual()::text and has_permission('sst', 'VIEW')
  );
create policy "sst_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'sst' and (storage.foldername(name))[1] = clinica_actual()::text and has_permission('sst', 'CREATE')
  );

revoke execute on function fn_sst_evento_plazos() from public, anon, authenticated;
revoke execute on function fn_sst_investigacion_proteger() from public, anon, authenticated;
revoke execute on function fn_sst_accion_proteger() from public, anon, authenticated;
