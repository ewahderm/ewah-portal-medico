-- EWAH Tech Platform — Habilitación (Res. 3100/2019), fase F8: obligaciones
-- de reporte, fechas límite (ocurrencias), novedades del REPS.
-- Aplicar con: npx supabase db push --linked
--
-- Diseño técnico aprobado: diseno-tecnico-habilitacion.md §1.4
-- (hab_obligaciones_clinica, hab_obligacion_ocurrencias,
-- hab_novedades_reportadas, hab_alertas_enviadas), §4 completa y fila F8
-- de §7. Requerimiento: HU-5.1 a HU-5.5.
--
-- Decisiones del usuario que esta migración implementa (no se reabren):
--   D5  Fecha límite LITERAL de la norma: nunca se corre al día hábil
--       siguiente. Si cae en sábado, domingo o festivo se marca
--       `dia_no_habil` y la UI / el correo avisan "preséntalo antes".
--   D6  RIPS "Aplica — confirma con tu asesor": aplica por defecto y la
--       clínica puede desactivarla con justificación escrita.
--   EWAH no radica nada ante el Estado: prepara, avisa y guarda la evidencia
--   (fecha, radicado/acuse y archivo) que el usuario digita.
--
-- Una sola implementación del cálculo de fechas, en SQL (§4.1): la usan los
-- triggers de recálculo, el botón "Recalcular" y el cron de F9 — el cálculo
-- nunca depende de fechas enviadas por el cliente. El script de siembra
-- (scripts/habilitacion/lib/fechas.mjs, fechaLimiteRegla) es el oráculo
-- con el que se probó (perfil D2 = fechas_2026_2027 de reportes.json).
--
-- Quién escribe qué:
--   - hab_obligaciones_clinica: SOLO el sincronizador inserta (una fila por
--     obligación del catálogo, aplique o no, para que la clínica pueda
--     activar una que el sistema no propuso). El usuario solo actualiza
--     (activar/desactivar con justificación, confirmar, avisos).
--   - hab_obligacion_ocurrencias: el generador (definer) inserta y borra
--     SOLO pendientes generadas por el sistema; el usuario presenta / marca
--     "no aplica en este periodo" por RLS (trigger de transiciones) y anula
--     por RPC. Las presentadas nunca se editan (HU-5.3 AC3).
--
-- Nota de discriminador: los triggers distinguen "usuario" de "sistema" con
-- current_user. Una inserción/actualización directa por PostgREST corre
-- como `authenticated`; dentro de una función security definer corre como
-- el dueño de la función. auth.uid() NO sirve para esto: dentro de un
-- trigger disparado por el usuario sigue devolviendo su id.

-- ============================================================
-- 1. Día no hábil (país-agnóstico, sobre `festivos` de 0062)
-- ============================================================
-- Sábado, domingo o festivo del país. Si el año no tiene festivos
-- sembrados, solo cuenta el fin de semana (la UI avisa "festivos de AAAA no
-- cargados" — nunca falla en silencio, §4.3). Genérica a propósito: RRHH
-- podrá reutilizarla (no es exclusiva de habilitación).
create or replace function fn_es_dia_no_habil(p_fecha date, p_pais_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select extract(isodow from p_fecha) in (6, 7)
    or exists (select 1 from festivos f where f.pais_id = p_pais_id and f.fecha = p_fecha);
$$;

-- País de una clínica para calcular festivos: el de operación, o Colombia
-- (único país sembrado hoy) si no lo tiene.
create or replace function fn_hab_pais_clinica(p_clinica_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select pais_operacion_id from clinicas where id = p_clinica_id),
    (select id from paises where codigo = 'CO')
  );
$$;
-- security definer: solo para leer pais_operacion_id de la clínica dentro de
-- los triggers sin depender del RLS de `clinicas`. Devuelve un uuid de
-- catálogo, nada sensible.
revoke all on function fn_hab_pais_clinica(uuid) from public, anon;
grant execute on function fn_hab_pais_clinica(uuid) to authenticated, service_role;

-- ============================================================
-- 2. hab_obligaciones_clinica — configuración por clínica (HU-5.1 AC3)
-- ============================================================
create table hab_obligaciones_clinica (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  obligacion_id uuid not null references hab_obligaciones_catalogo(id),
  -- Lo escribe SIEMPRE el sincronizador (tipo, grupo, naturaleza,
  -- características del perfil y servicios declarados).
  aplica_segun_perfil boolean not null,
  -- Mientras el usuario no decida (justificacion null), sigue a
  -- aplica_segun_perfil; una decisión justificada nunca se pisa.
  activa boolean not null,
  origen text not null default 'automatica' check (origen in ('automatica', 'manual')),
  -- "Por confirmar con tu asesor" (ST002, SIVIGILA: activacion_default
  -- por_confirmar) y RIPS (requiere_confirmacion_asesor): el usuario confirma
  -- que aplica. Hasta entonces se ven en gris punteado y F9 no alerta.
  confirmada boolean not null default false,
  justificacion text check (justificacion is null or length(btrim(justificacion)) between 10 and 2000),
  fecha_consulta_asesor date,
  dias_aviso int[] check (dias_aviso is null or (cardinality(dias_aviso) between 1 and 10 and 0 <= all(dias_aviso) and 365 >= all(dias_aviso))),
  responsable_id uuid references usuarios(id) on delete set null,
  -- Contador externo: SOLO recibe las alertas de esta obligación (F9).
  correo_adicional text check (correo_adicional is null or (length(correo_adicional) <= 254 and correo_adicional ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  updated_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinica_id, obligacion_id),
  -- Rastro de D6 / AC3: apartarse de lo que dice el perfil exige justificar.
  constraint hab_obligacion_clinica_decision_justificada
    check (activa = aplica_segun_perfil or justificacion is not null)
);

create index idx_hab_obligaciones_clinica_clinica on hab_obligaciones_clinica(clinica_id);

create trigger hab_obligaciones_clinica_set_updated_at
  before update on hab_obligaciones_clinica
  for each row execute function set_updated_at();

create trigger hab_obligaciones_clinica_auditoria
  after insert or update or delete on hab_obligaciones_clinica
  for each row execute function fn_auditoria();

create trigger hab_obligaciones_clinica_responsable_misma_clinica
  before insert or update of responsable_id, clinica_id on hab_obligaciones_clinica
  for each row execute function fn_hab_misma_clinica('responsable_id', 'usuarios', 'El responsable no pertenece a esta clínica.');

-- El usuario no puede tocar lo que calcula el sincronizador ni la identidad.
create or replace function fn_hab_obligacion_clinica_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.clinica_id <> old.clinica_id or new.obligacion_id <> old.obligacion_id
       or new.aplica_segun_perfil <> old.aplica_segun_perfil or new.origen <> old.origen then
      raise exception 'Esos datos los calcula el sistema según tu perfil.';
    end if;
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger hab_obligaciones_clinica_proteger
  before update on hab_obligaciones_clinica
  for each row execute function fn_hab_obligacion_clinica_proteger();

alter table hab_obligaciones_clinica enable row level security;

create policy "hab_obligaciones_clinica_select" on hab_obligaciones_clinica
  for select to authenticated using (
    clinica_id = clinica_actual() and has_permission('habilitacion', 'VIEW')
  );

-- Configurar es gestión (Pro). Sin insert ni delete para usuarios: las
-- filas las crea el sincronizador y "ya no aplica" es aplica_segun_perfil.
create policy "hab_obligaciones_clinica_update" on hab_obligaciones_clinica
  for update to authenticated using (
    clinica_id = clinica_actual()
    and has_permission('habilitacion', 'EDIT')
    and has_entitlement('habilitacion', 'gestion')
  )
  with check (clinica_id = clinica_actual());

-- ============================================================
-- 3. hab_novedades_reportadas (HU-5.5) — append-only con anulación
-- ============================================================
-- Va antes que ocurrencias porque una ocurrencia de cierre temporal apunta
-- a la novedad que la originó.
create table hab_novedades_reportadas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  novedad_id uuid not null references hab_novedades_catalogo(id),
  -- set null: la novedad es historia; si la sede o el servicio se borran
  -- después (cierre definitivo), el registro de que se reportó se conserva.
  sede_id uuid references sedes(id) on delete set null,
  servicio_habilitado_id uuid references clinica_servicios_habilitados(id) on delete set null,
  fecha_reporte date not null,
  radicado text check (radicado is null or length(radicado) <= 100),
  storage_path text,
  nombre_archivo text check (nombre_archivo is null or length(nombre_archivo) <= 255),
  mime text,
  tamano_bytes bigint check (tamano_bytes is null or tamano_bytes > 0),
  observacion text check (observacion is null or length(observacion) <= 4000),
  anulado boolean not null default false,
  motivo_anulacion text,
  anulado_por uuid references usuarios(id) on delete set null,
  anulado_en timestamptz,
  created_by uuid references usuarios(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hab_novedad_archivo_de_la_clinica
    check (storage_path is null or split_part(storage_path, '/', 1) = clinica_id::text),
  constraint hab_novedad_anulacion_justificada
    check (not anulado or length(btrim(coalesce(motivo_anulacion, ''))) >= 10)
);

create index idx_hab_novedades_reportadas_clinica on hab_novedades_reportadas(clinica_id, fecha_reporte desc);

create trigger hab_novedades_reportadas_auditoria
  after insert or update or delete on hab_novedades_reportadas
  for each row execute function fn_auditoria();

create trigger hab_novedades_reportadas_sede_misma_clinica
  before insert or update of sede_id, clinica_id on hab_novedades_reportadas
  for each row execute function fn_hab_misma_clinica('sede_id', 'sedes', 'La sede no pertenece a esta clínica.');

create trigger hab_novedades_reportadas_servicio_misma_clinica
  before insert or update of servicio_habilitado_id, clinica_id on hab_novedades_reportadas
  for each row execute function fn_hab_misma_clinica('servicio_habilitado_id', 'clinica_servicios_habilitados', 'El servicio no pertenece a esta clínica.');

-- Solo se permite: anular (una vez, con motivo) o que una FK pase a null
-- por el `on delete set null`. Nada más cambia nunca.
create or replace function fn_hab_novedad_solo_anular()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.anulado then
    raise exception 'Esta novedad está anulada y no se puede modificar.';
  end if;
  if new.clinica_id <> old.clinica_id or new.novedad_id <> old.novedad_id
     or new.fecha_reporte <> old.fecha_reporte
     or new.radicado is distinct from old.radicado
     or new.storage_path is distinct from old.storage_path
     or new.nombre_archivo is distinct from old.nombre_archivo
     or new.mime is distinct from old.mime
     or new.tamano_bytes is distinct from old.tamano_bytes
     or new.observacion is distinct from old.observacion
     or new.created_by is distinct from old.created_by
     or new.created_at <> old.created_at
     or (new.sede_id is distinct from old.sede_id and new.sede_id is not null)
     or (new.servicio_habilitado_id is distinct from old.servicio_habilitado_id and new.servicio_habilitado_id is not null) then
    raise exception 'Una novedad reportada no se edita: anúlala y regístrala de nuevo.';
  end if;
  if new.anulado then
    new.anulado_por := auth.uid();
    new.anulado_en := now();
  elsif new.motivo_anulacion is distinct from old.motivo_anulacion then
    raise exception 'Una novedad reportada no se edita: anúlala y regístrala de nuevo.';
  end if;
  return new;
end;
$$;

create trigger hab_novedades_reportadas_solo_anular
  before update on hab_novedades_reportadas
  for each row execute function fn_hab_novedad_solo_anular();

alter table hab_novedades_reportadas enable row level security;

create policy "hab_novedades_reportadas_select" on hab_novedades_reportadas
  for select to authenticated using (
    clinica_id = clinica_actual() and has_permission('habilitacion', 'VIEW')
  );

create policy "hab_novedades_reportadas_insert" on hab_novedades_reportadas
  for insert to authenticated with check (
    clinica_id = clinica_actual()
    and has_permission('habilitacion', 'CREATE')
    and has_entitlement('habilitacion', 'gestion')
    and not anulado
  );
-- Sin update ni delete para usuarios: anular va por fn_hab_anular_novedad
-- (atómico con la ocurrencia de cierre temporal que haya creado).

-- ============================================================
-- 4. hab_obligacion_ocurrencias (HU-5.2 / HU-5.3)
-- ============================================================
create table hab_obligacion_ocurrencias (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  obligacion_id uuid not null references hab_obligaciones_catalogo(id),
  origen text not null
    check (origen in ('calendario', 'vencimiento_reps', 'subsanacion_visita', 'cierre_temporal', 'grupo_supersalud', 'manual')),
  -- Identifica el periodo dentro de la obligación ("corte-2026-12-31",
  -- "reps-2027-03-15", "grupo-2027"). Con el índice único parcial hace la
  -- generación idempotente.
  clave_periodo text not null check (length(clave_periodo) between 1 and 120),
  periodo_corte date,
  etiqueta_periodo text,
  -- LITERAL de la norma (D5). Nunca se corre.
  fecha_limite date not null,
  -- Calculado por trigger al insertar (no lo decide quien inserta).
  dia_no_habil boolean not null default false,
  -- vencido y extemporáneo se CALCULAN (pendiente con fecha pasada;
  -- presentado con fecha_presentacion > fecha_limite): no se guardan.
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'presentado', 'no_aplica_periodo', 'anulado')),
  fecha_presentacion date,
  radicado text check (radicado is null or length(radicado) <= 100),
  storage_path text,
  nombre_archivo text check (nombre_archivo is null or length(nombre_archivo) <= 255),
  mime text,
  tamano_bytes bigint check (tamano_bytes is null or tamano_bytes > 0),
  observacion text check (observacion is null or length(observacion) <= 4000),
  presentado_por uuid references usuarios(id) on delete set null,
  presentado_en timestamptz,
  -- "No aplica en este periodo" (≥ 10) — separado del motivo de anulación
  -- para que anular una "no aplica" no borre la razón original.
  justificacion text check (justificacion is null or length(justificacion) <= 2000),
  motivo_anulacion text check (motivo_anulacion is null or length(motivo_anulacion) <= 2000),
  anulado_por uuid references usuarios(id) on delete set null,
  anulado_en timestamptz,
  -- La corrección (anular + registrar de nuevo) apunta a la anulada.
  reemplaza_id uuid references hab_obligacion_ocurrencias(id),
  novedad_id uuid references hab_novedades_reportadas(id),
  generada_por text not null check (generada_por in ('sistema', 'usuario')),
  created_by uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint hab_ocurrencia_archivo_de_la_clinica
    check (storage_path is null or split_part(storage_path, '/', 1) = clinica_id::text),
  -- Presentado = fecha + prueba (radicado o acuse). Sin prueba no hay
  -- "presentado" (riesgo R16: el usuario no debe creer que basta un clic).
  constraint hab_ocurrencia_presentada_con_prueba
    check (estado <> 'presentado' or (fecha_presentacion is not null and (radicado is not null or storage_path is not null))),
  constraint hab_ocurrencia_no_aplica_justificada
    check (estado <> 'no_aplica_periodo' or length(btrim(coalesce(justificacion, ''))) >= 10),
  constraint hab_ocurrencia_anulada_justificada
    check (estado <> 'anulado' or length(btrim(coalesce(motivo_anulacion, ''))) >= 10)
);

create unique index uq_hab_ocurrencias_periodo
  on hab_obligacion_ocurrencias(clinica_id, obligacion_id, clave_periodo)
  where estado <> 'anulado';

-- Calendario por rango, "lo urgente" y el cron de F9.
create index idx_hab_ocurrencias_clinica_estado_fecha
  on hab_obligacion_ocurrencias(clinica_id, estado, fecha_limite);

create trigger hab_obligacion_ocurrencias_auditoria
  after insert or update or delete on hab_obligacion_ocurrencias
  for each row execute function fn_auditoria();

create trigger hab_obligacion_ocurrencias_novedad_misma_clinica
  before insert on hab_obligacion_ocurrencias
  for each row execute function fn_hab_misma_clinica('novedad_id', 'hab_novedades_reportadas', 'La novedad no pertenece a esta clínica.');

-- Insert: día no hábil calculado aquí (una sola vez, para todos los
-- caminos) y reglas para las filas que crea el USUARIO.
create or replace function fn_hab_ocurrencia_validar_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_hoy date := (now() at time zone 'America/Bogota')::date;
begin
  new.dia_no_habil := fn_es_dia_no_habil(new.fecha_limite, fn_hab_pais_clinica(new.clinica_id));

  if new.reemplaza_id is not null and not exists (
    select 1 from hab_obligacion_ocurrencias o
    where o.id = new.reemplaza_id and o.clinica_id = new.clinica_id
      and o.obligacion_id = new.obligacion_id and o.clave_periodo = new.clave_periodo
      and o.estado = 'anulado'
  ) then
    raise exception 'Solo se puede reemplazar una ocurrencia anulada del mismo periodo.';
  end if;

  if current_user in ('authenticated', 'anon') then
    -- El usuario solo registra envíos de obligaciones sin calendario
    -- (manual), subsanaciones (F7) y cierres temporales (vía novedad); las
    -- fechas de calendario las genera el sistema.
    if new.generada_por <> 'usuario' or new.origen not in ('manual', 'subsanacion_visita', 'cierre_temporal') then
      raise exception 'Las fechas del calendario las genera el sistema.';
    end if;
    if new.estado not in ('pendiente', 'presentado') then
      raise exception 'Estado inicial no permitido.';
    end if;
    new.created_by := auth.uid();
    new.motivo_anulacion := null;
    new.anulado_por := null;
    new.anulado_en := null;
  end if;

  if new.estado = 'presentado' then
    if new.fecha_presentacion > v_hoy then
      raise exception 'La fecha de presentación no puede ser futura.';
    end if;
    new.presentado_por := coalesce(new.presentado_por, auth.uid());
    new.presentado_en := coalesce(new.presentado_en, now());
  end if;
  return new;
end;
$$;

create trigger hab_obligacion_ocurrencias_validar_insert
  before insert on hab_obligacion_ocurrencias
  for each row execute function fn_hab_ocurrencia_validar_insert();

-- Máquina de estados (§1.4, AC3 HU-5.3, mismo criterio que Tratamientos):
--   pendiente → presentado | no_aplica_periodo | anulado
--   presentado | no_aplica_periodo → anulado
-- Una vez fuera de `pendiente`, ningún dato cambia; la identidad del
-- periodo (obligación, clave, fecha límite) no cambia nunca.
create or replace function fn_hab_ocurrencia_transicion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_usuario boolean := current_user in ('authenticated', 'anon');
  v_hoy date := (now() at time zone 'America/Bogota')::date;
begin
  if new.clinica_id <> old.clinica_id or new.obligacion_id <> old.obligacion_id
     or new.origen <> old.origen or new.clave_periodo <> old.clave_periodo
     or new.periodo_corte is distinct from old.periodo_corte
     or new.etiqueta_periodo is distinct from old.etiqueta_periodo
     or new.fecha_limite <> old.fecha_limite or new.dia_no_habil <> old.dia_no_habil
     or new.generada_por <> old.generada_por
     or new.reemplaza_id is distinct from old.reemplaza_id
     or new.novedad_id is distinct from old.novedad_id
     or new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
    raise exception 'El periodo y la fecha límite de una obligación no se modifican.';
  end if;

  if old.estado = 'anulado' then
    raise exception 'Esta ocurrencia está anulada y no se puede modificar.';
  end if;
  if new.estado = old.estado then
    raise exception 'Una obligación presentada no se edita: anúlala y regístrala de nuevo.';
  end if;

  if old.estado = 'pendiente' and new.estado in ('presentado', 'no_aplica_periodo') then
    if v_usuario and not (has_permission('habilitacion', 'EDIT') and has_entitlement('habilitacion', 'gestion')) then
      raise exception 'No tienes permiso para registrar la presentación.';
    end if;
    new.motivo_anulacion := null;
    new.anulado_por := null;
    new.anulado_en := null;
    if new.estado = 'presentado' then
      if new.fecha_presentacion > v_hoy then
        raise exception 'La fecha de presentación no puede ser futura.';
      end if;
      new.justificacion := null;
      new.presentado_por := auth.uid();
      new.presentado_en := now();
    else
      new.fecha_presentacion := null;
      new.radicado := null;
      new.storage_path := null;
      new.nombre_archivo := null;
      new.mime := null;
      new.tamano_bytes := null;
      new.presentado_por := null;
      new.presentado_en := null;
    end if;
    return new;
  end if;

  if new.estado = 'anulado' then
    -- Los usuarios anulan por fn_hab_anular_ocurrencia (reabre el periodo
    -- en la misma transacción); nunca por un UPDATE suelto.
    if v_usuario then
      raise exception 'Para anular usa la opción "Anular" de la obligación.';
    end if;
    if new.fecha_presentacion is distinct from old.fecha_presentacion
       or new.radicado is distinct from old.radicado
       or new.storage_path is distinct from old.storage_path
       or new.nombre_archivo is distinct from old.nombre_archivo
       or new.mime is distinct from old.mime
       or new.tamano_bytes is distinct from old.tamano_bytes
       or new.observacion is distinct from old.observacion
       or new.presentado_por is distinct from old.presentado_por
       or new.presentado_en is distinct from old.presentado_en
       or new.justificacion is distinct from old.justificacion then
      raise exception 'Al anular no se cambian los datos registrados.';
    end if;
    new.anulado_en := now();
    return new;
  end if;

  raise exception 'Cambio de estado no permitido.';
end;
$$;

create trigger hab_obligacion_ocurrencias_transicion
  before update on hab_obligacion_ocurrencias
  for each row execute function fn_hab_ocurrencia_transicion();

alter table hab_obligacion_ocurrencias enable row level security;

-- Lectura en todos los planes (calendario de solo lectura en Gratis).
create policy "hab_obligacion_ocurrencias_select" on hab_obligacion_ocurrencias
  for select to authenticated using (
    clinica_id = clinica_actual() and has_permission('habilitacion', 'VIEW')
  );

create policy "hab_obligacion_ocurrencias_insert" on hab_obligacion_ocurrencias
  for insert to authenticated with check (
    clinica_id = clinica_actual()
    and has_permission('habilitacion', 'CREATE')
    and has_entitlement('habilitacion', 'gestion')
    and generada_por = 'usuario'
    and origen in ('manual', 'subsanacion_visita', 'cierre_temporal')
  );

create policy "hab_obligacion_ocurrencias_update" on hab_obligacion_ocurrencias
  for update to authenticated using (
    clinica_id = clinica_actual()
    and has_permission('habilitacion', 'EDIT')
    and has_entitlement('habilitacion', 'gestion')
  )
  with check (clinica_id = clinica_actual());

-- Sin delete para usuarios. Solo el generador (definer) borra, y solo
-- pendientes generadas por el sistema.

-- ============================================================
-- 5. hab_alertas_enviadas — idempotencia de avisos (lo usa F9)
-- ============================================================
-- Se crea aquí (0068 es la migración reservada para "obligaciones +
-- alertas", §7) para que F9 no necesite migración. Solo el service role
-- escribe; sin fn_auditoria (es un log).
create table hab_alertas_enviadas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references clinicas(id) on delete cascade,
  objeto_tipo text not null check (objeto_tipo in ('ocurrencia', 'documento_version', 'plan_mejora', 'extintor', 'grupo')),
  objeto_id uuid not null,
  umbral_dias int not null,
  enviado_en timestamptz not null default now(),
  destinatarios text[] not null default '{}',
  proveedor_id text,
  unique (objeto_tipo, objeto_id, umbral_dias)
);

create index idx_hab_alertas_enviadas_clinica on hab_alertas_enviadas(clinica_id, enviado_en desc);

alter table hab_alertas_enviadas enable row level security;

create policy "hab_alertas_enviadas_select" on hab_alertas_enviadas
  for select to authenticated using (clinica_id = clinica_actual() and es_admin());

-- ============================================================
-- 6. Generación de ocurrencias (§4.1)
-- ============================================================
-- Conjunto DESEADO de ocurrencias de sistema para una clínica, en la
-- ventana [hoy − 400 días, hoy + 18 meses]:
--   calendario       reglas de hab_obligacion_vencimientos que coinciden con
--                    el tipo y el grupo del perfil. corte = (año, mes_corte,
--                    dia_corte o último día); límite = día `dia_limite` del
--                    mes (corte + meses_despues), o el último día de ese mes
--                    si no existe. Mismo cálculo que fechaLimiteRegla (F0).
--   vencimiento_reps una ocurrencia con la fecha de vencimiento del REPS
--                    del perfil (sin tope superior: es la más importante).
--   grupo_supersalud "Verifica tu grupo" con límite el 31-ene de cada año
--                    (cifras al 31-dic anterior), solo IPS (HU-1.2 AC2).
-- Solo obligaciones con configuración ACTIVA (las "por confirmar" están
-- activas: se ven en gris y F9 no las alerta hasta que se confirmen).
create or replace function fn_hab_ocurrencias_deseadas(p_clinica_id uuid, p_hoy date)
returns table (
  obligacion_id uuid,
  origen text,
  clave_periodo text,
  periodo_corte date,
  etiqueta_periodo text,
  fecha_limite date
)
language sql
stable
security definer
set search_path = public
as $$
  with perfil as (
    select p.tipo_prestador, p.grupo_supersalud, p.fecha_vencimiento_reps
    from hab_perfil_prestador p
    where p.clinica_id = p_clinica_id and p.tipo_prestador is not null
  ),
  activas as (
    select oc.obligacion_id, c.codigo, c.periodicidad
    from hab_obligaciones_clinica oc
    join hab_obligaciones_catalogo c on c.id = oc.obligacion_id
    where oc.clinica_id = p_clinica_id and oc.activa
  ),
  ventana as (
    select p_hoy - 400 as desde, (p_hoy + interval '18 months')::date as hasta
  ),
  anios as (
    select generate_series(extract(year from p_hoy)::int - 2, extract(year from p_hoy)::int + 2) as anio
  ),
  reglas as (
    select a.obligacion_id, v.etiqueta_periodo, y.anio, v.mes_corte, v.dia_corte, v.meses_despues, v.dia_limite,
           make_date(y.anio, v.mes_corte, 1) as mes_corte_ini,
           (make_date(y.anio, v.mes_corte, 1) + make_interval(months => v.meses_despues))::date as mes_limite_ini
    from activas a
    join hab_obligacion_vencimientos v on v.obligacion_id = a.obligacion_id
    cross join anios y
    cross join perfil p
    where (v.aplica_a_grupos is null or p.grupo_supersalud = any (v.aplica_a_grupos))
      and (v.aplica_a_tipos is null or p.tipo_prestador = any (v.aplica_a_tipos))
  ),
  calendario as (
    select r.obligacion_id,
           'calendario'::text as origen,
           (r.mes_corte_ini + (least(coalesce(r.dia_corte, 31),
              extract(day from (r.mes_corte_ini + interval '1 month - 1 day'))::int) - 1))::date as periodo_corte,
           r.etiqueta_periodo,
           (r.mes_limite_ini + (least(r.dia_limite,
              extract(day from (r.mes_limite_ini + interval '1 month - 1 day'))::int) - 1))::date as fecha_limite
    from reglas r
  ),
  todas as (
    select c.obligacion_id, c.origen, 'corte-' || to_char(c.periodo_corte, 'YYYY-MM-DD') as clave_periodo,
           c.periodo_corte, c.etiqueta_periodo, c.fecha_limite
    from calendario c, ventana w
    where c.fecha_limite between w.desde and w.hasta
    union all
    select a.obligacion_id, 'vencimiento_reps', 'reps-' || to_char(p.fecha_vencimiento_reps, 'YYYY-MM-DD'),
           null::date, 'Vence la inscripción en el REPS', p.fecha_vencimiento_reps
    from activas a, perfil p, ventana w
    where a.periodicidad = 'vencimiento_reps'
      and p.fecha_vencimiento_reps is not null
      and p.fecha_vencimiento_reps >= w.desde
    union all
    select a.obligacion_id, 'grupo_supersalud', 'grupo-' || y.anio,
           make_date(y.anio - 1, 12, 31), 'cifras al 31-dic-' || (y.anio - 1), make_date(y.anio, 1, 31)
    from activas a, perfil p, anios y, ventana w
    where a.codigo = 'grupo-supersalud-anual'
      and p.tipo_prestador = 'ips'
      and make_date(y.anio, 1, 31) between w.desde and w.hasta
  )
  select distinct on (t.obligacion_id, t.clave_periodo)
         t.obligacion_id, t.origen, t.clave_periodo, t.periodo_corte, t.etiqueta_periodo, t.fecha_limite
  from todas t
  order by t.obligacion_id, t.clave_periodo, t.fecha_limite;
$$;

-- Diff idempotente (§4.1): borra las pendientes de sistema de la ventana
-- que ya no están en el conjunto deseado (p. ej. cambio de grupo D2 → C1:
-- salen las semestrales sin presentar y entran las mensuales, AC4 HU-5.2) e
-- inserta las que falten. Presentadas, "no aplica" y anuladas NUNCA se
-- tocan; tampoco las pendientes anteriores a la ventana (siguen vencidas).
create or replace function fn_hab_generar_ocurrencias(p_clinica_id uuid, p_hoy date default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy date := coalesce(p_hoy, (now() at time zone 'America/Bogota')::date);
begin
  if not exists (select 1 from clinicas where id = p_clinica_id) then
    return;  -- clínica borrándose (cascada): nada que generar
  end if;

  -- El conjunto deseado se evalúa dos veces (borrar / insertar): son
  -- decenas de filas y así no hace falta una tabla temporal.
  delete from hab_obligacion_ocurrencias o
  where o.clinica_id = p_clinica_id
    and o.estado = 'pendiente'
    and o.generada_por = 'sistema'
    and o.origen in ('calendario', 'vencimiento_reps', 'grupo_supersalud')
    and o.fecha_limite >= v_hoy - 400
    and not exists (
      select 1 from fn_hab_ocurrencias_deseadas(p_clinica_id, v_hoy) d
      where d.obligacion_id = o.obligacion_id
        and d.clave_periodo = o.clave_periodo
        and d.fecha_limite = o.fecha_limite
    );

  insert into hab_obligacion_ocurrencias
    (clinica_id, obligacion_id, origen, clave_periodo, periodo_corte, etiqueta_periodo, fecha_limite, generada_por)
  select p_clinica_id, d.obligacion_id, d.origen, d.clave_periodo, d.periodo_corte, d.etiqueta_periodo, d.fecha_limite, 'sistema'
  from fn_hab_ocurrencias_deseadas(p_clinica_id, v_hoy) d
  on conflict (clinica_id, obligacion_id, clave_periodo) where (estado <> 'anulado') do nothing;
end;
$$;

-- ============================================================
-- 7. Aplicabilidad por clínica (§4.1)
-- ============================================================
-- Upsert de una fila por obligación del catálogo. aplica_segun_perfil
-- siempre se recalcula; activa solo sigue al perfil mientras el usuario no
-- haya decidido con justificación (nunca se pisa una decisión).
-- Reglas:
--   tipo de prestador ∈ aplica_a_tipos; grupo ∈ aplica_a_grupos si la
--   obligación restringe grupo y el prestador es IPS (sin grupo definido no
--   aplica: la UI pide definirlo); todas las condiciones cerradas:
--     privada_o_mixta          naturaleza ≠ pública (sin dato = privada,
--                              regla conservadora R1: ante duda, incluir)
--     upgd / revisor_fiscal / pedt / factura_servicios_salud: dato del perfil
--     telemedicina             algún servicio no cerrado con esa modalidad
--     internacion_o_urgencias  algún servicio no cerrado de 11.4.x o 11.6.1
create or replace function fn_hab_sincronizar_obligaciones(p_clinica_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil hab_perfil_prestador%rowtype;
  v_telemedicina boolean;
  v_internacion boolean;
begin
  if not exists (select 1 from clinicas where id = p_clinica_id) then
    return;  -- clínica borrándose (cascada)
  end if;

  select * into v_perfil from hab_perfil_prestador where clinica_id = p_clinica_id;

  select coalesce(bool_or('telemedicina' = any (s.modalidades)), false),
         coalesce(bool_or(n.clave like '11.4.%' or n.clave = '11.6.1'), false)
    into v_telemedicina, v_internacion
  from clinica_servicios_habilitados s
  left join hab_servicios_norma n on n.id = s.servicio_norma_id
  where s.clinica_id = p_clinica_id and s.estado <> 'cerrado';

  insert into hab_obligaciones_clinica as oc (clinica_id, obligacion_id, aplica_segun_perfil, activa)
  select p_clinica_id, c.id, x.aplica, x.aplica
  from hab_obligaciones_catalogo c
  cross join lateral (
    select coalesce(
      v_perfil.tipo_prestador is not null
      and v_perfil.tipo_prestador = any (c.aplica_a_tipos)
      and (c.aplica_a_grupos is null or v_perfil.tipo_prestador <> 'ips' or v_perfil.grupo_supersalud = any (c.aplica_a_grupos))
      and not exists (
        select 1 from unnest(c.condiciones) k
        where not (case k
          when 'privada_o_mixta' then coalesce(v_perfil.naturaleza, 'privada') <> 'publica'
          when 'upgd' then coalesce(v_perfil.es_upgd, false)
          when 'revisor_fiscal' then coalesce(v_perfil.tiene_revisor_fiscal, false)
          when 'pedt' then coalesce(v_perfil.realiza_pedt, false)
          when 'factura_servicios_salud' then coalesce(v_perfil.factura_servicios_salud, false)
          when 'telemedicina' then v_telemedicina
          when 'internacion_o_urgencias' then v_internacion
          else true
        end)
      ),
      false) as aplica
  ) x
  on conflict (clinica_id, obligacion_id) do update
    set aplica_segun_perfil = excluded.aplica_segun_perfil,
        activa = case when oc.justificacion is null then excluded.aplica_segun_perfil else oc.activa end
    where oc.aplica_segun_perfil is distinct from excluded.aplica_segun_perfil
       or (oc.justificacion is null and oc.activa is distinct from excluded.aplica_segun_perfil);

  perform fn_hab_generar_ocurrencias(p_clinica_id);
end;
$$;

-- Lección de bootstrap_clinica (0020): funciones definer que reciben un
-- clinica_id NO se exponen a usuarios. Las llaman los triggers (como dueño),
-- el envoltorio de abajo y el cron de F9 (service role).
revoke all on function fn_hab_ocurrencias_deseadas(uuid, date) from public, anon, authenticated;
revoke all on function fn_hab_generar_ocurrencias(uuid, date) from public, anon, authenticated;
revoke all on function fn_hab_sincronizar_obligaciones(uuid) from public, anon, authenticated;
grant execute on function fn_hab_ocurrencias_deseadas(uuid, date) to service_role;
grant execute on function fn_hab_generar_ocurrencias(uuid, date) to service_role;
grant execute on function fn_hab_sincronizar_obligaciones(uuid) to service_role;

-- ============================================================
-- 8. Cuándo se recalcula (§4.2)
-- ============================================================
-- security definer: el trigger corre con los privilegios del dueño para
-- escribir configuración y ocurrencias aunque quien guarda el perfil (todos
-- los planes, decisión B) no tenga permiso directo sobre esas tablas. Solo
-- recalcula la clínica de la fila que cambió.
create or replace function fn_hab_tg_recalcular_obligaciones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform fn_hab_sincronizar_obligaciones(case when tg_op = 'DELETE' then old.clinica_id else new.clinica_id end);
  return null;
end;
$$;

revoke all on function fn_hab_tg_recalcular_obligaciones() from public, anon, authenticated;

create trigger hab_perfil_prestador_obligaciones
  after insert or update on hab_perfil_prestador
  for each row execute function fn_hab_tg_recalcular_obligaciones();

-- Telemedicina e internación/urgencias dependen de los servicios declarados.
create trigger clinica_servicios_habilitados_obligaciones
  after insert or delete or update of modalidades, estado, servicio_norma_id on clinica_servicios_habilitados
  for each row execute function fn_hab_tg_recalcular_obligaciones();

-- Botón "Recalcular" (transparencia) y recálculo tras configurar. EDIT sin
-- gestión: el perfil se edita en todos los planes y esto solo rehace lo que
-- el perfil ya determina.
create or replace function fn_hab_recalcular_mis_obligaciones()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica_id uuid := clinica_actual();
begin
  if v_clinica_id is null then
    raise exception 'Sesión inválida.';
  end if;
  if not has_permission('habilitacion', 'EDIT') then
    raise exception 'No tienes permiso para recalcular las obligaciones.';
  end if;
  perform fn_hab_sincronizar_obligaciones(v_clinica_id);
end;
$$;

revoke all on function fn_hab_recalcular_mis_obligaciones() from public, anon;
grant execute on function fn_hab_recalcular_mis_obligaciones() to authenticated;

-- ============================================================
-- 9. Anular y registrar de nuevo (HU-5.3 AC3)
-- ============================================================
-- Atómico: marca la ocurrencia como anulada y, si estaba presentada o "no
-- aplica", reabre el periodo con una pendiente nueva que apunta a la
-- anulada (reemplaza_id), lista para registrar la presentación correcta.
-- Una fecha de calendario pendiente no se anula (el generador la volvería a
-- crear): para eso está "No aplica en este periodo".
-- security definer: la política de update no admite el estado `anulado`
-- desde el usuario (lo bloquea el trigger) y el insert de la reapertura es
-- de origen sistema. Valida explícitamente clínica, VOID y plan.
create or replace function fn_hab_anular_ocurrencia(p_id uuid, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica_id uuid := clinica_actual();
  v_o hab_obligacion_ocurrencias%rowtype;
  v_nueva uuid;
begin
  if v_clinica_id is null then
    raise exception 'Sesión inválida.';
  end if;
  if not (has_permission('habilitacion', 'VOID') and has_entitlement('habilitacion', 'gestion')) then
    raise exception 'No tienes permiso para anular.';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 10 or length(p_motivo) > 2000 then
    raise exception 'Explica en al menos 10 caracteres por qué se anula.';
  end if;

  select * into v_o from hab_obligacion_ocurrencias
  where id = p_id and clinica_id = v_clinica_id
  for update;
  if not found then
    raise exception 'No encontramos esa obligación.';
  end if;
  if v_o.estado = 'anulado' then
    raise exception 'Esta ocurrencia ya estaba anulada.';
  end if;
  if v_o.estado = 'pendiente' and v_o.origen in ('calendario', 'vencimiento_reps', 'grupo_supersalud') then
    raise exception 'Una fecha del calendario no se anula: márcala como "No aplica en este periodo".';
  end if;

  update hab_obligacion_ocurrencias
  set estado = 'anulado', motivo_anulacion = btrim(p_motivo), anulado_por = auth.uid()
  where id = p_id;

  if v_o.estado in ('presentado', 'no_aplica_periodo') then
    insert into hab_obligacion_ocurrencias
      (clinica_id, obligacion_id, origen, clave_periodo, periodo_corte, etiqueta_periodo, fecha_limite,
       generada_por, reemplaza_id, novedad_id, created_by)
    values
      (v_o.clinica_id, v_o.obligacion_id, v_o.origen, v_o.clave_periodo, v_o.periodo_corte, v_o.etiqueta_periodo,
       v_o.fecha_limite, v_o.generada_por, v_o.id, v_o.novedad_id, auth.uid())
    returning id into v_nueva;
  end if;
  return v_nueva;
end;
$$;

revoke all on function fn_hab_anular_ocurrencia(uuid, text) from public, anon;
grant execute on function fn_hab_anular_ocurrencia(uuid, text) to authenticated;

-- ============================================================
-- 10. Novedades: registrar y anular (HU-5.5)
-- ============================================================
-- Registrar (invoker: el RLS de quien llama aplica en cada escritura).
-- Efectos atómicos:
--   cierre_temporal_servicio → el servicio pasa a `cierre_temporal` y nace
--     una ocurrencia con la fecha LITERAL en que el cierre vence (1 año
--     desde el reporte, Res. 544/2023 art. 6; D5): los avisos de 30/15/7…
--     días la anticipan (el "aviso a los 11 meses" de HU-5.5 AC3).
--   apertura_servicio → la UI sugiere agregar el servicio (devuelve el id;
--     el efecto lo lee la action del catálogo).
create or replace function fn_hab_registrar_novedad(
  p_novedad_id uuid,
  p_fecha_reporte date,
  p_sede_id uuid default null,
  p_servicio_id uuid default null,
  p_radicado text default null,
  p_observacion text default null,
  p_storage_path text default null,
  p_nombre_archivo text default null,
  p_mime text default null,
  p_tamano_bytes bigint default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_clinica_id uuid := clinica_actual();
  v_efecto text;
  v_id uuid;
  v_obligacion uuid;
begin
  if v_clinica_id is null then
    raise exception 'Sesión inválida.';
  end if;
  if p_fecha_reporte is null or p_fecha_reporte > (now() at time zone 'America/Bogota')::date then
    raise exception 'La fecha del reporte no puede ser futura.';
  end if;

  select efecto into v_efecto from hab_novedades_catalogo where id = p_novedad_id;
  if not found then
    raise exception 'Novedad inválida.';
  end if;
  if v_efecto = 'alerta_cierre_temporal' and p_servicio_id is null then
    raise exception 'Elige el servicio que cierras temporalmente.';
  end if;

  insert into hab_novedades_reportadas
    (clinica_id, novedad_id, sede_id, servicio_habilitado_id, fecha_reporte, radicado, observacion,
     storage_path, nombre_archivo, mime, tamano_bytes)
  values
    (v_clinica_id, p_novedad_id, p_sede_id, p_servicio_id, p_fecha_reporte, nullif(btrim(p_radicado), ''),
     nullif(btrim(p_observacion), ''), p_storage_path, p_nombre_archivo, p_mime, p_tamano_bytes)
  returning id into v_id;

  if v_efecto = 'alerta_cierre_temporal' then
    update clinica_servicios_habilitados
    set estado = 'cierre_temporal', fecha_cierre_temporal = p_fecha_reporte
    where id = p_servicio_id and clinica_id = v_clinica_id;
    if not found then
      raise exception 'No pudimos marcar el servicio en cierre temporal (revisa tus permisos en Sedes y servicios).';
    end if;

    select id into v_obligacion from hab_obligaciones_catalogo where codigo = 'novedad-cierre-temporal';
    insert into hab_obligacion_ocurrencias
      (clinica_id, obligacion_id, origen, clave_periodo, periodo_corte, etiqueta_periodo, fecha_limite, generada_por, novedad_id)
    values
      (v_clinica_id, v_obligacion, 'cierre_temporal', 'cierre-' || v_id::text, p_fecha_reporte,
       'cierre temporal reportado el ' || to_char(p_fecha_reporte, 'DD-MM-YYYY'),
       (p_fecha_reporte + interval '1 year')::date, 'usuario', v_id);
  end if;

  return v_id;
end;
$$;

revoke all on function fn_hab_registrar_novedad(uuid, date, uuid, uuid, text, text, text, text, text, bigint) from public, anon;
grant execute on function fn_hab_registrar_novedad(uuid, date, uuid, uuid, text, text, text, text, text, bigint) to authenticated;

-- Anular una novedad y, en la misma transacción, las ocurrencias pendientes
-- que creó (p. ej. el vencimiento del cierre temporal). El estado del
-- servicio NO se revierte solo: lo corrige el usuario en Sedes y servicios.
-- security definer: no hay política de update para usuarios en ninguna de
-- las dos tablas; valida clínica, VOID y plan.
create or replace function fn_hab_anular_novedad(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinica_id uuid := clinica_actual();
begin
  if v_clinica_id is null then
    raise exception 'Sesión inválida.';
  end if;
  if not (has_permission('habilitacion', 'VOID') and has_entitlement('habilitacion', 'gestion')) then
    raise exception 'No tienes permiso para anular.';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 10 or length(p_motivo) > 2000 then
    raise exception 'Explica en al menos 10 caracteres por qué se anula.';
  end if;

  update hab_novedades_reportadas
  set anulado = true, motivo_anulacion = btrim(p_motivo)
  where id = p_id and clinica_id = v_clinica_id and not anulado;
  if not found then
    raise exception 'No encontramos esa novedad o ya estaba anulada.';
  end if;

  update hab_obligacion_ocurrencias
  set estado = 'anulado',
      motivo_anulacion = 'Se anuló la novedad que la originó: ' || btrim(p_motivo),
      anulado_por = auth.uid()
  where novedad_id = p_id and clinica_id = v_clinica_id and estado = 'pendiente';
end;
$$;

revoke all on function fn_hab_anular_novedad(uuid, text) from public, anon;
grant execute on function fn_hab_anular_novedad(uuid, text) to authenticated;

-- ============================================================
-- 11. Backfill: perfiles que ya existan reciben su configuración y fechas
-- ============================================================
do $$
declare
  r record;
begin
  for r in select clinica_id from hab_perfil_prestador loop
    perform fn_hab_sincronizar_obligaciones(r.clinica_id);
  end loop;
end;
$$;
