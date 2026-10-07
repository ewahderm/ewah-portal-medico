-- EWAH Tech Platform — Habilitación (Res. 3100/2019), fase F2: esquema
-- del catálogo GLOBAL de la norma.
-- Aplicar con: npx supabase db push --linked
--
-- Diseño técnico aprobado: diseno-tecnico-habilitacion.md §1.2, §1.3 (lo
-- que toca a clinica_servicios_habilitados), §1.7 y fila F2 de §7.
-- Los datos llegan en 0063/0064, GENERADOS por scripts/habilitacion/
-- generar-seed.mjs. Este esquema calza columna por columna con ese SQL.
--
-- Ajustes al §1.2 que pidió la siembra (scripts/habilitacion/NOTAS.md):
--   - hab_criterio_remisiones: complejidades_destino text[] (una remisión
--     puede ir a "baja y mediana" a la vez), modalidades_destino text[]
--     (25 remisiones "cumple con lo de la modalidad intramural") y el tipo
--     'a_otra_modalidad'.
--   - pagina_inicio / pagina admiten null: el texto 2022 de 11.3.7 (Res.
--     1410/2022) no está en el PDF de 2019; inventar una página sería una
--     cita falsa.
--   - Códigos de condición nuevos: documentos tep_solo_persona_juridica /
--     tep_solo_persona_natural; obligaciones privada_o_mixta /
--     internacion_o_urgencias.
--   - Periodicidad 'manual' (SIVIGILA semanal, verificación anual sin fecha
--     fija) y categoría de novedad 'capacidad'.
--   - unique (servicio_norma_id, estandar_codigo, orden) en hab_bloques.
-- Otros cambios respecto a §1.2 (decisión de backend, por escrito):
--   - codigo de documentos, obligaciones y novedades es único POR NORMA
--     (no global): una versión nueva de la norma reutilizará los códigos.
--   - hab_criterio_fuentes_sugeridas NO se crea aquí: su lista cerrada de
--     fuentes (§6.2) y su siembra son de F6 (0069).
--
-- Política común de los catálogos globales (mismo patrón que
-- valores_legales_pais, 0048): lectura para cualquier usuario autenticado;
-- escritura solo es_super_admin() (en la práctica, solo por migración).
-- Sin fn_auditoria (exige clinica_id): la trazabilidad de un catálogo
-- global es la propia migración versionada. Sin ON DELETE CASCADE: un
-- criterio con evaluaciones (F5) nunca debe poder desaparecer por debajo.

-- ============================================================
-- 1. Norma, estándares, grupos y servicios
-- ============================================================
create table hab_normas (
  id uuid primary key,                -- uuid v5 determinista sobre codigo
  codigo text not null unique,
  nombre text not null,
  url_fuente text,
  url_compilada text,
  fecha_consulta date not null,
  vigente_desde date not null,
  vigente_hasta date,                 -- null = vigente
  notas text,
  constraint hab_normas_vigencia_valida check (vigente_hasta is null or vigente_hasta > vigente_desde)
);

-- Solo una norma vigente a la vez: la clínica siempre evalúa contra ella.
create unique index hab_normas_una_vigente on hab_normas ((true)) where vigente_hasta is null;

create table hab_estandares (
  codigo text primary key,            -- talento_humano, infraestructura, ...
  sigla text not null unique,         -- TH, IN, DO, MD, PP, HC, IT
  nombre text not null,
  numeral_manual text,
  definicion_literal text,
  pagina int,
  orden int not null
);

create table hab_grupos_servicio (
  numeral text primary key,           -- 11.2 … 11.6
  nombre text not null,
  descripcion_literal text,
  orden int not null
);

create table hab_servicios_norma (
  id uuid primary key,
  norma_id uuid not null references hab_normas(id),
  clave text not null,                -- 11.1, 11.2.2, 11.3.7, 11.3.7-2019
  numeral text not null,              -- 11.3.7 para ambas versiones de quimioterapia
  grupo_numeral text references hab_grupos_servicio(numeral),  -- null en 11.1
  padre_clave text,                   -- 11.3.4 para 11.3.4.1 / 11.3.4.2
  nombre text not null,
  nombre_en_pdf text not null,
  descripcion_literal text,
  estructura_literal text,
  pagina_inicio int,                  -- null solo en 11.3.7 (texto 2022, sin PDF)
  complejidades text[] not null
    check (complejidades <@ array['baja', 'mediana', 'alta', 'no_aplica']::text[]),
  modalidades text[] not null
    check (modalidades <@ array['intramural', 'extramural', 'extramural_unidad_movil',
      'extramural_jornada_salud', 'extramural_domiciliaria', 'telemedicina']::text[]),
  telemedicina_categorias text[] not null default '{}'
    check (telemedicina_categorias <@ array['interactiva', 'no_interactiva', 'telexperticia', 'telemonitoreo']::text[]),
  es_transversal boolean not null,    -- true solo en 11.1
  solo_por_remision boolean not null, -- 11.3.7-2019 (D3): no se declara
  seleccionable boolean not null,     -- false en 11.1, 11.3.4 y 11.3.7-2019
  orden int not null,
  unique (norma_id, clave),
  -- El contenedor (11.3.4) se siembra antes que sus hijos, pero se difiere
  -- por si una versión futura los ordena distinto.
  constraint hab_servicios_norma_padre_fk foreign key (norma_id, padre_clave)
    references hab_servicios_norma(norma_id, clave) deferrable initially deferred
);

-- ============================================================
-- 2. Bloques y criterios
-- ============================================================
-- aplica_modalidad se guarda EXPANDIDO ('extramural' → sus 3 sub-
-- modalidades) para que el motor filtre con un simple && (§1.2).
create table hab_bloques (
  id uuid primary key,
  servicio_norma_id uuid not null references hab_servicios_norma(id),
  estandar_codigo text not null references hab_estandares(codigo),
  orden int not null,
  encabezado_literal text,
  subtitulo text,
  aplica_complejidad text[]
    check (aplica_complejidad <@ array['baja', 'mediana', 'alta', 'no_aplica']::text[]),
  aplica_modalidad text[]
    check (aplica_modalidad <@ array['intramural', 'extramural', 'extramural_unidad_movil',
      'extramural_jornada_salud', 'extramural_domiciliaria', 'telemedicina']::text[]),
  aplica_telemedicina_categoria text[]
    check (aplica_telemedicina_categoria <@ array['interactiva', 'no_interactiva', 'telexperticia', 'telemonitoreo']::text[]),
  aplica_telemedicina_rol text[]
    check (aplica_telemedicina_rol <@ array['prestador_remisor', 'prestador_referencia']::text[]),
  aplica_tipo_edificacion text check (aplica_tipo_edificacion in ('exclusivo_salud', 'mixto')),
  correccion_curada text,             -- por qué la siembra corrigió el bloque (solo super admin)
  -- Cubre también el índice (servicio_norma_id, estandar_codigo) de §1.2.
  unique (servicio_norma_id, estandar_codigo, orden)
);

create table hab_criterios (
  id uuid primary key,                -- v5 sobre norma + codigo + vigente_desde
  norma_id uuid not null references hab_normas(id),
  codigo text not null,               -- 11.1.TH.4.1, 11.3.7-2019.DO.10.1.4
  bloque_id uuid not null references hab_bloques(id),
  -- Denormalizados desde el bloque (los valida el script de siembra).
  servicio_norma_id uuid not null references hab_servicios_norma(id),
  estandar_codigo text not null references hab_estandares(codigo),
  numero text not null,
  padre_id uuid references hab_criterios(id),
  nivel smallint not null check (nivel >= 0),
  orden int not null,
  texto_literal text not null,
  pagina int,                         -- null solo en los 16 criterios de 11.3.7 (2022)
  confianza text not null check (confianza in ('alta', 'baja')),
  motivo_confianza_baja text,
  fuente_texto text not null check (fuente_texto in ('compilacion_supersalud', 'pdf_ocr', 'imagen')),
  nota_vigencia text,
  vigente_desde date,                 -- null = desde la norma
  vigente_hasta date,                 -- 2027-01-03 para los derogados por la Res. 914/2025
  es_encabezado boolean not null,
  remite_a_11_1 boolean not null,     -- autorresuelto por remisión a 11.1
  tiene_remision boolean not null,    -- existe fila en hab_criterio_remisiones
  constraint hab_criterios_vigencia_valida
    check (vigente_desde is null or vigente_hasta is null or vigente_hasta > vigente_desde),
  -- Permite dos filas de 11.2.1.DO.23.6: la actual y la de la Res. 914/2025.
  constraint hab_criterios_codigo_vigencia_key unique nulls not distinct (norma_id, codigo, vigente_desde)
);

create index idx_hab_criterios_servicio_estandar on hab_criterios(servicio_norma_id, estandar_codigo, orden);
create index idx_hab_criterios_bloque on hab_criterios(bloque_id);
create index idx_hab_criterios_padre on hab_criterios(padre_id);

-- Solo remisiones a otro servicio, complejidad, modalidad o versión; la
-- remisión a 11.1 es el booleano remite_a_11_1 (destino implícito).
create table hab_criterio_remisiones (
  id uuid primary key,
  criterio_id uuid not null references hab_criterios(id),
  tipo text not null
    check (tipo in ('a_otro_servicio', 'a_otra_complejidad', 'a_otra_modalidad', 'a_version_anterior')),
  servicio_destino_id uuid not null references hab_servicios_norma(id),
  -- null = la del destino si tiene una sola; si tiene varias, la del origen.
  complejidades_destino text[]
    check (complejidades_destino <@ array['baja', 'mediana', 'alta', 'no_aplica']::text[]),
  -- null = las modalidades del origen.
  modalidades_destino text[]
    check (modalidades_destino <@ array['intramural', 'extramural', 'extramural_unidad_movil',
      'extramural_jornada_salud', 'extramural_domiciliaria', 'telemedicina']::text[]),
  -- null = mismo estándar del origen.
  estandar_destino text references hab_estandares(codigo),
  -- Puntero directo: esos códigos entran con sus hijos y sin filtro de
  -- bloque. null = todo el bloque del destino que coincida.
  criterios_destino text[],
  nota_curaduria text not null
);

create unique index hab_criterio_remisiones_unica
  on hab_criterio_remisiones (criterio_id, servicio_destino_id, coalesce(estandar_destino, ''));
create index idx_hab_criterio_remisiones_destino on hab_criterio_remisiones(servicio_destino_id);

-- Práctica del catálogo (practicas_medicas, global) → servicio de la norma.
-- Una sola fila: el numeral se asigna solo. Varias: requiere_eleccion en
-- todas (lo valida el script) y la clínica elige.
create table hab_mapeo_practica_servicio (
  practica_medica_id uuid not null references practicas_medicas(id),
  servicio_norma_id uuid not null references hab_servicios_norma(id),
  requiere_eleccion boolean not null,
  nota text,
  confianza text not null check (confianza in ('alta', 'inferida')),
  primary key (practica_medica_id, servicio_norma_id)
);

create index idx_hab_mapeo_servicio on hab_mapeo_practica_servicio(servicio_norma_id);

-- ============================================================
-- 3. Tipos de prestador, documentos, obligaciones, novedades, festivos
-- ============================================================
-- Separado de roles_actor_reps (0052): ese es el rol RIPS (3/4/5) y no
-- distingue transporte especial ni objeto social diferente.
create table hab_tipos_prestador (
  codigo text primary key,            -- ips, profesional_independiente, transporte_especial, objeto_social_diferente
  nombre text not null,
  definicion text,
  condiciones text[] not null default '{}',  -- condiciones de habilitación que la norma le exige (texto)
  fuente_norma text,
  fuente_articulo text,
  fuente_pagina text,
  fuente_url text,
  orden int not null
);

-- Códigos de condición: lista CERRADA (cada uno tiene un evaluador probado
-- en TS, §3.3). Se prefirió esto a un mini-lenguaje en jsonb.
create table hab_documentos_catalogo (
  id uuid primary key,
  norma_id uuid not null references hab_normas(id),
  codigo text not null,
  nombre_corto text not null,
  descripcion_literal text not null,
  explicacion_sencilla text,
  -- {} = no verificado → nunca aparece como requisito.
  aplica_a text[] not null
    check (aplica_a <@ array['ips', 'profesional_independiente', 'transporte_especial', 'objeto_social_diferente']::text[]),
  obligatorio boolean not null,
  condicion_texto text,
  condiciones text[] not null default '{}'
    check (condiciones <@ array[
      'persona_juridica', 'persona_natural', 'tep_solo_persona_juridica', 'tep_solo_persona_natural',
      'entidad_publica', 'esal', 'cooperacion_internacional', 'sedes_otros_departamentos',
      'edificacion_pre_1996_12_02', 'edificacion_pre_2005_05', 'edificacion_post_1996_mixta',
      'edificacion_pre_2010_con_urgencias_cirugia_uci', 'telemedicina', 'telemedicina_remisor',
      'radiaciones_ionizantes', 'vehiculos', 'ips_nueva'
    ]::text[]),
  seccion text not null check (seccion in ('radicar', 'evidencia_visita')),
  por_sede boolean not null,
  tiene_vencimiento boolean not null,
  regla_vigencia text check (regla_vigencia in ('max_30_dias_radicacion')),
  uno_por_servicio boolean not null,
  fuente_norma text,
  fuente_articulo text,
  fuente_pagina text,
  fuente_url text,
  verificado boolean not null,
  orden int not null,
  unique (norma_id, codigo)
);

create table hab_obligaciones_catalogo (
  id uuid primary key,
  norma_id uuid not null references hab_normas(id),
  codigo text not null,               -- FT001, reps-autoevaluacion, telemedicina-mensual, ...
  nombre text not null,
  descripcion_corta text not null,
  entidad text not null check (entidad in ('secretaria_salud', 'supersalud', 'minsalud', 'ins', 'propia')),
  plataforma_nombre text,
  plataforma_url text,
  norma_nombre text,
  norma_numero text,
  norma_articulo text,
  norma_url text,
  url_instructivo text,
  enlace_verificado_el date,
  url_responde boolean,
  periodicidad text not null
    check (periodicidad in ('mensual', 'trimestral', 'semestral', 'anual', 'eventual', 'vencimiento_reps', 'manual')),
  aplica_a_tipos text[] not null
    check (aplica_a_tipos <@ array['ips', 'profesional_independiente', 'transporte_especial', 'objeto_social_diferente']::text[]),
  aplica_a_grupos text[]              -- null = todos los grupos (o no aplica grupo)
    check (aplica_a_grupos <@ array['B', 'C1', 'C2', 'D1', 'D2', 'D3']::text[]),
  condiciones text[] not null default '{}'
    check (condiciones <@ array[
      'persona_juridica', 'persona_natural', 'tep_solo_persona_juridica', 'tep_solo_persona_natural',
      'entidad_publica', 'esal', 'cooperacion_internacional', 'sedes_otros_departamentos',
      'edificacion_pre_1996_12_02', 'edificacion_pre_2005_05', 'edificacion_post_1996_mixta',
      'edificacion_pre_2010_con_urgencias_cirugia_uci', 'telemedicina', 'telemedicina_remisor',
      'radiaciones_ionizantes', 'vehiculos', 'ips_nueva',
      'upgd', 'revisor_fiscal', 'pedt', 'factura_servicios_salud', 'privada_o_mixta', 'internacion_o_urgencias'
    ]::text[]),
  -- por_confirmar: no genera alerta roja hasta que el usuario la active
  -- (ST002, SIVIGILA). informativa: capacidad instalada diaria.
  activacion_default text not null check (activacion_default in ('auto', 'por_confirmar', 'informativa')),
  requiere_confirmacion_asesor boolean not null,  -- D6: RIPS
  dias_aviso_default int[] not null,
  verificado boolean not null,
  notas text,
  unique (norma_id, codigo)
);

-- Una fila = una ocurrencia por año ("corte del mes X → vence el día D,
-- M meses después"). vencimiento_reps, eventual y manual no tienen filas.
create table hab_obligacion_vencimientos (
  id uuid primary key,
  obligacion_id uuid not null references hab_obligaciones_catalogo(id),
  aplica_a_grupos text[]
    check (aplica_a_grupos <@ array['B', 'C1', 'C2', 'D1', 'D2', 'D3']::text[]),
  aplica_a_tipos text[]
    check (aplica_a_tipos <@ array['ips', 'profesional_independiente', 'transporte_especial', 'objeto_social_diferente']::text[]),
  mes_corte smallint not null check (mes_corte between 1 and 12),
  dia_corte smallint check (dia_corte between 1 and 31),  -- null = último día del mes
  meses_despues smallint not null check (meses_despues >= 0),
  dia_limite smallint not null check (dia_limite between 1 and 31),
  etiqueta_periodo text
);

create index idx_hab_obligacion_vencimientos_obligacion on hab_obligacion_vencimientos(obligacion_id);

create table hab_novedades_catalogo (
  id uuid primary key,
  norma_id uuid not null references hab_normas(id),
  codigo text not null,
  categoria text not null check (categoria in ('prestador', 'sede', 'servicio', 'capacidad')),
  nombre text not null,
  definicion_literal text,
  fuente_norma text,
  fuente_articulo text,
  fuente_pagina text,
  fuente_url text,
  efecto text check (efecto in ('sugerir_alta_servicio', 'alerta_cierre_temporal')),
  orden int not null,
  unique (norma_id, codigo)
);

-- Global y país-agnóstica (no exclusiva de habilitación: RRHH podrá
-- reutilizarla para días hábiles).
create table festivos (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  fecha date not null,
  nombre text not null,
  fuente text,
  unique (pais_id, fecha)
);

-- ============================================================
-- 4. RLS de los catálogos globales
-- ============================================================
do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'hab_normas', 'hab_estandares', 'hab_grupos_servicio', 'hab_servicios_norma',
    'hab_bloques', 'hab_criterios', 'hab_criterio_remisiones', 'hab_mapeo_practica_servicio',
    'hab_tipos_prestador', 'hab_documentos_catalogo', 'hab_obligaciones_catalogo',
    'hab_obligacion_vencimientos', 'hab_novedades_catalogo', 'festivos'
  ] loop
    execute format('alter table %I enable row level security', v_tabla);
    execute format('create policy %I on %I for select to authenticated using (true)',
      v_tabla || '_select_all', v_tabla);
    execute format('create policy %I on %I for all to authenticated using (es_super_admin()) with check (es_super_admin())',
      v_tabla || '_write_super_admin', v_tabla);
  end loop;
end;
$$;

-- ============================================================
-- 5. hab_perfil_prestador.tipo_prestador → FK (pendiente de 0061)
-- ============================================================
-- 0061 lo dejó como check de 4 valores porque hab_tipos_prestador no
-- existía. Las 4 filas llegan en 0064; por eso se exige que ningún perfil
-- tenga tipo todavía (si lo tuviera, la FK fallaría entre 0062 y 0064). Con
-- la columna toda en null la FK se valida sin costo.
do $$
begin
  if exists (select 1 from hab_perfil_prestador where tipo_prestador is not null) then
    raise exception 'F2: hay perfiles con tipo_prestador; sembrar hab_tipos_prestador antes de crear la FK.';
  end if;
end;
$$;

alter table hab_perfil_prestador drop constraint hab_perfil_prestador_tipo_prestador_check;
alter table hab_perfil_prestador
  add constraint hab_perfil_prestador_tipo_prestador_fkey
  foreign key (tipo_prestador) references hab_tipos_prestador(codigo);

-- ============================================================
-- 6. clinica_servicios_habilitados: numeral de la norma (D1, §1.3)
-- ============================================================
-- on delete restrict: un servicio de la norma con clínicas declaradas no
-- se puede borrar del catálogo.
alter table clinica_servicios_habilitados
  add column servicio_norma_id uuid references hab_servicios_norma(id) on delete restrict;

create index idx_clinica_servicios_habilitados_servicio_norma on clinica_servicios_habilitados(servicio_norma_id);

-- Obstetricia, SPA, Quemados y Trasplantes pueden declararse con dos
-- numerales en la misma sede: 1 fila = práctica × sede × numeral.
-- nulls not distinct: dos filas de la misma práctica y sede "sin numeral
-- elegido" siguen siendo duplicado.
alter table clinica_servicios_habilitados
  drop constraint clinica_servicios_habilitados_clinica_sede_practica_key;
alter table clinica_servicios_habilitados
  add constraint clinica_servicios_habilitados_clinica_sede_practica_numeral_key
  unique nulls not distinct (clinica_id, sede_id, practica_medica_id, servicio_norma_id);

-- La legalidad de la combinación vive en Postgres, no en el formulario:
-- dos pantallas (Datos básicos y Habilitación > Sedes y servicios) escriben
-- la misma fila. La regla "la sede es de esta clínica" ya la cubre el
-- trigger fn_hab_misma_clinica de 0061; la coherencia telemedicina ↔
-- categorías/roles, el check de 0061.
--   1. Numeral: si viene null y la práctica tiene UNA opción seleccionable
--      en la norma vigente, se asigna sola; si tiene varias, queda null
--      ("falta elegir numeral"). Si viene, debe estar en el mapeo de la
--      práctica y ser seleccionable.
--   2. Sin numeral no hay detalle: complejidad, modalidades y telemedicina
--      solo se pueden validar contra un servicio de la norma.
--   3. Complejidad ∈ complejidades del servicio (se asigna si hay una sola).
--   4. Modalidades y categorías de telemedicina ⊆ las del servicio.
-- security definer: lee el catálogo con independencia del RLS de quien
-- escribe (hoy es legible por todo authenticated; así no depende de eso).
-- No eleva nada más: solo lee hab_* y modifica NEW.
create or replace function fn_servicio_habilitado_validar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opciones int;
  v_unica uuid;
  v_servicio hab_servicios_norma%rowtype;
begin
  if new.servicio_norma_id is null then
    select count(*), min(m.servicio_norma_id::text)::uuid
      into v_opciones, v_unica
    from hab_mapeo_practica_servicio m
    join hab_servicios_norma s on s.id = m.servicio_norma_id
    join hab_normas n on n.id = s.norma_id
    where m.practica_medica_id = new.practica_medica_id
      and s.seleccionable
      and n.vigente_hasta is null;
    if v_opciones = 1 then
      new.servicio_norma_id := v_unica;
    end if;
  elsif not exists (
    select 1
    from hab_mapeo_practica_servicio m
    join hab_servicios_norma s on s.id = m.servicio_norma_id
    where m.practica_medica_id = new.practica_medica_id
      and m.servicio_norma_id = new.servicio_norma_id
      and s.seleccionable
  ) then
    raise exception 'El numeral de la norma elegido no corresponde a este servicio.';
  end if;

  if new.servicio_norma_id is null then
    if new.complejidad is not null
       or cardinality(new.modalidades) > 0
       or cardinality(new.telemedicina_categorias) > 0
       or cardinality(new.telemedicina_roles) > 0 then
      raise exception 'Elige primero el numeral de la norma de este servicio: sin él no se pueden validar la complejidad ni las modalidades.';
    end if;
    return new;
  end if;

  select * into v_servicio from hab_servicios_norma where id = new.servicio_norma_id;

  if new.complejidad is null then
    if cardinality(v_servicio.complejidades) = 1 then
      new.complejidad := v_servicio.complejidades[1];
    end if;
  elsif not (new.complejidad = any(v_servicio.complejidades)) then
    raise exception 'La complejidad "%" no es válida para el servicio % (%); admite: %.',
      new.complejidad, v_servicio.clave, v_servicio.nombre, array_to_string(v_servicio.complejidades, ', ');
  end if;

  if not (new.modalidades <@ v_servicio.modalidades) then
    raise exception 'El servicio % (%) no admite la(s) modalidad(es) %; admite: %.',
      v_servicio.clave, v_servicio.nombre,
      array_to_string(array(select unnest(new.modalidades) except select unnest(v_servicio.modalidades)), ', '),
      array_to_string(v_servicio.modalidades, ', ');
  end if;

  if not (new.telemedicina_categorias <@ v_servicio.telemedicina_categorias) then
    raise exception 'El servicio % (%) no admite la(s) categoría(s) de telemedicina %; admite: %.',
      v_servicio.clave, v_servicio.nombre,
      array_to_string(array(select unnest(new.telemedicina_categorias) except select unnest(v_servicio.telemedicina_categorias)), ', '),
      coalesce(nullif(array_to_string(v_servicio.telemedicina_categorias, ', '), ''), 'ninguna');
  end if;

  return new;
end;
$$;

create trigger clinica_servicios_habilitados_validar
  before insert or update on clinica_servicios_habilitados
  for each row execute function fn_servicio_habilitado_validar();

-- El backfill del numeral en filas ya existentes (p. ej. IPS ACME,
-- Medicina General) va al final de 0063, cuando el mapeo ya está sembrado.
