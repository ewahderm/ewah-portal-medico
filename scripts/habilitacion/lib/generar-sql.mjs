// Emite el SQL de 0063 (norma) y 0064 (catálogos). Determinista: sin fechas
// de ejecución, mismo orden siempre; idempotente: `on conflict do nothing`
// y aserciones de conteo al final (si una fila preexistente tiene otro id,
// el conteo no cuadra y la migración aborta en vez de quedar a medias).
import { insertarPorLotes, crudo, lit } from "./sql.mjs";

const NOMBRE_0063 = "0063_habilitacion_seed_norma.sql";
const NOMBRE_0064 = "0064_habilitacion_seed_catalogos.sql";
export const NOMBRES_SALIDA = [NOMBRE_0063, NOMBRE_0064];

function encabezado(titulo, hashes, conteos) {
  const lineas = [
    `-- ${titulo}`,
    "--",
    "-- GENERADO por scripts/habilitacion/generar-seed.mjs — NO EDITAR A MANO.",
    "-- Regenerar: node scripts/habilitacion/generar-seed.mjs (valida §2.3 antes de escribir).",
    "-- Una corrección posterior del catálogo entra como migración NUEVA y explícita",
    "-- (update … where id = … -- errata, fuente …), nunca regenerando este archivo",
    "-- después de aplicado.",
    "--",
    "-- Requiere: 0061 (prácticas D2 de practicas_medicas) y 0062 (esquema global §1.2).",
    "-- Idempotente: insert … on conflict do nothing + aserciones de conteo.",
    "--",
    "-- Fuentes y curaduría (SHA-256 del contenido con saltos de línea LF):",
    ...Object.entries(hashes)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `--   ${v}  ${k}`),
    "--",
    "-- Filas:",
    ...Object.entries(conteos).map(([k, v]) => `--   ${k}: ${v}`),
    "",
  ];
  return lineas.join("\n");
}

function asercionConteo(tabla, condicion, esperado) {
  return `  select count(*) into v from ${tabla}${condicion ? ` where ${condicion}` : ""};
  if v <> ${esperado} then
    raise exception 'Seed de habilitación: ${tabla} tiene % filas y se esperaban ${esperado}', v;
  end if;`;
}

function bloqueAserciones(lineas) {
  return `do $$\ndeclare\n  v int;\nbegin\n${lineas.join("\n")}\nend;\n$$;`;
}

export function generar0063(modelo, hashes) {
  const m = modelo;
  const normaId = m.norma.id;
  const enNorma = `norma_id = '${normaId}'`;
  const servDeNorma = `servicio_norma_id in (select id from hab_servicios_norma where ${enNorma})`;
  const practicas = [...new Set(m.mapeo.map((f) => f.practica_medica_id))];
  const criteriosOrdenados = [...m.criterios].sort(
    (a, b) =>
      a.nivel - b.nivel ||
      m.servicios.findIndex((s) => s.id === a.servicio_norma_id) - m.servicios.findIndex((s) => s.id === b.servicio_norma_id) ||
      a.orden - b.orden ||
      (a.vigente_desde ?? "").localeCompare(b.vigente_desde ?? ""),
  );
  const conteos = {
    hab_normas: 1,
    hab_estandares: m.estandares.length,
    hab_grupos_servicio: m.grupos.length,
    hab_servicios_norma: m.servicios.length,
    hab_bloques: m.bloques.length,
    hab_criterios: m.criterios.length,
    "hab_criterios (remite_a_11_1 = autorresueltos)": m.criterios.filter((c) => c.remite_a_11_1).length,
    "hab_criterios (vigente_hasta 2027-01-03)": m.criterios.filter((c) => c.vigente_hasta).length,
    hab_criterio_remisiones: m.remisiones.length,
    hab_mapeo_practica_servicio: m.mapeo.length,
  };

  const partes = [
    encabezado("0063 · Habilitación: siembra de la norma (Res. 3100/2019 compilada)", hashes, conteos),
    `-- Aserción previa: todas las prácticas del mapeo existen (incluidas las 4
-- creadas por la división D2 en 0061). Si falta alguna, se aborta todo.
do $$
declare
  v_faltan int;
begin
  select count(*) into v_faltan
  from unnest(array[
${practicas.map((p) => `    '${p}'`).join(",\n")}
  ]::uuid[]) as p(id)
  where not exists (select 1 from practicas_medicas pm where pm.id = p.id);
  if v_faltan > 0 then
    raise exception 'Seed de habilitación: faltan % práctica(s) de practicas_medicas (¿se aplicó 0061?)', v_faltan;
  end if;
end;
$$;`,
    "-- Versión de norma",
    insertarPorLotes({
      tabla: "hab_normas",
      columnas: ["id", "codigo", "nombre", "url_fuente", "url_compilada", "fecha_consulta", "vigente_desde", "vigente_hasta", "notas"],
      filas: [[normaId, m.norma.codigo, m.norma.nombre, m.norma.url_fuente, m.norma.url_compilada, m.norma.fecha_consulta, m.norma.vigente_desde, m.norma.vigente_hasta, m.norma.notas]],
      conflicto: "(id)",
    }),
    "-- Estándares (orden de la norma: TH, IN, DO, MD, PP, HC, IT)",
    insertarPorLotes({
      tabla: "hab_estandares",
      columnas: ["codigo", "sigla", "nombre", "numeral_manual", "definicion_literal", "pagina", "orden"],
      filas: m.estandares.map((e) => [e.codigo, e.sigla, e.nombre, e.numeral_manual, e.definicion_literal, e.pagina, e.orden]),
      conflicto: "(codigo)",
    }),
    "-- Grupos de servicios",
    insertarPorLotes({
      tabla: "hab_grupos_servicio",
      columnas: ["numeral", "nombre", "descripcion_literal", "orden"],
      filas: m.grupos.map((g) => [g.numeral, g.nombre, g.descripcion_literal, g.orden]),
      conflicto: "(numeral)",
    }),
    "-- Servicios de la norma (42 entradas; 11.3.7 en dos versiones, D3)",
    insertarPorLotes({
      tabla: "hab_servicios_norma",
      columnas: [
        "id", "norma_id", "clave", "numeral", "grupo_numeral", "padre_clave", "nombre", "nombre_en_pdf", "descripcion_literal",
        "estructura_literal", "pagina_inicio", "complejidades", "modalidades", "telemedicina_categorias", "es_transversal",
        "solo_por_remision", "seleccionable", "orden",
      ],
      filas: m.servicios.map((s) => [
        s.id, normaId, s.clave, s.numeral, s.grupo_numeral, s.padre_clave, s.nombre, s.nombre_en_pdf, s.descripcion_literal,
        s.estructura_literal, s.pagina_inicio, s.complejidades, s.modalidades, s.telemedicina_categorias, s.es_transversal,
        s.solo_por_remision, s.seleccionable, s.orden,
      ]),
      conflicto: "(id)",
    }),
    "-- Bloques de aplicabilidad (aplica_modalidad EXPANDIDO: 'extramural' incluye sus 3 sub-modalidades)",
    insertarPorLotes({
      tabla: "hab_bloques",
      columnas: [
        "id", "servicio_norma_id", "estandar_codigo", "orden", "encabezado_literal", "subtitulo", "aplica_complejidad", "aplica_modalidad",
        "aplica_telemedicina_categoria", "aplica_telemedicina_rol", "aplica_tipo_edificacion", "correccion_curada",
      ],
      filas: m.bloques.map((b) => [
        b.id, b.servicio_norma_id, b.estandar_codigo, b.orden, b.encabezado_literal, b.subtitulo, b.aplica_complejidad, b.aplica_modalidad,
        b.aplica_telemedicina_categoria, b.aplica_telemedicina_rol, b.aplica_tipo_edificacion, b.correccion_curada,
      ]),
      conflicto: "(id)",
    }),
    "-- Criterios (padres antes que hijos: ordenados por nivel)",
    insertarPorLotes({
      tabla: "hab_criterios",
      columnas: [
        "id", "norma_id", "codigo", "bloque_id", "servicio_norma_id", "estandar_codigo", "numero", "padre_id", "nivel", "orden",
        "texto_literal", "pagina", "confianza", "motivo_confianza_baja", "fuente_texto", "nota_vigencia", "vigente_desde", "vigente_hasta",
        "es_encabezado", "remite_a_11_1", "tiene_remision",
      ],
      filas: criteriosOrdenados.map((c) => [
        c.id, normaId, c.codigo, c.bloque_id, c.servicio_norma_id, c.estandar_codigo, c.numero, c.padre_id, c.nivel, c.orden,
        c.texto_literal, c.pagina, c.confianza, c.motivo_confianza_baja, c.fuente_texto, c.nota_vigencia, c.vigente_desde, c.vigente_hasta,
        c.es_encabezado, c.remite_a_11_1, c.tiene_remision,
      ]),
      conflicto: "(id)",
    }),
    "-- Remisiones curadas (a otro servicio, complejidad, modalidad o versión; la remisión a 11.1 es remite_a_11_1)",
    insertarPorLotes({
      tabla: "hab_criterio_remisiones",
      columnas: [
        "id", "criterio_id", "tipo", "servicio_destino_id", "complejidades_destino", "modalidades_destino", "estandar_destino",
        "criterios_destino", "nota_curaduria",
      ],
      filas: m.remisiones.map((r) => [
        r.id, r.criterio_id, r.tipo, r.servicio_destino_id, r.complejidades_destino, r.modalidades_destino, r.estandar_destino,
        r.criterios_destino, r.nota_curaduria,
      ]),
      conflicto: "(id)",
    }),
    "-- Mapeo práctica del catálogo → servicio de la norma (D2)",
    insertarPorLotes({
      tabla: "hab_mapeo_practica_servicio",
      columnas: ["practica_medica_id", "servicio_norma_id", "requiere_eleccion", "nota", "confianza"],
      filas: m.mapeo.map((f) => [f.practica_medica_id, f.servicio_norma_id, f.requiere_eleccion, f.nota, f.confianza]),
      conflicto: "(practica_medica_id, servicio_norma_id)",
    }),
    "-- Aserciones finales de conteo",
    bloqueAserciones([
      asercionConteo("hab_normas", `id = '${normaId}'`, 1),
      asercionConteo("hab_servicios_norma", enNorma, m.servicios.length),
      asercionConteo("hab_bloques", servDeNorma, m.bloques.length),
      asercionConteo("hab_criterios", enNorma, m.criterios.length),
      asercionConteo("hab_criterios", `${enNorma} and remite_a_11_1`, m.criterios.filter((c) => c.remite_a_11_1).length),
      asercionConteo("hab_criterios", `${enNorma} and vigente_hasta is not null`, m.criterios.filter((c) => c.vigente_hasta).length),
      asercionConteo(
        "hab_criterio_remisiones",
        `criterio_id in (select id from hab_criterios where ${enNorma})`,
        m.remisiones.length,
      ),
      asercionConteo("hab_mapeo_practica_servicio", servDeNorma, m.mapeo.length),
    ]),
    `-- Backfill del numeral en filas de clinica_servicios_habilitados creadas
-- antes de este mapeo (0055/0061, p. ej. desde Datos básicos): si la
-- práctica tiene UNA sola opción seleccionable, se asigna. El trigger
-- fn_servicio_habilitado_validar (0062) completa la complejidad si el
-- servicio admite una sola. Las de varias opciones quedan "falta elegir
-- numeral". Idempotente (solo toca filas con numeral null).
update clinica_servicios_habilitados c
set servicio_norma_id = u.servicio_norma_id
from (
  select m.practica_medica_id, min(m.servicio_norma_id::text)::uuid as servicio_norma_id
  from hab_mapeo_practica_servicio m
  join hab_servicios_norma s on s.id = m.servicio_norma_id
  where s.${enNorma} and s.seleccionable
  group by m.practica_medica_id
  having count(*) = 1
) u
where c.servicio_norma_id is null
  and c.practica_medica_id = u.practica_medica_id;`,
    "",
  ];
  return { nombre: NOMBRE_0063, sql: partes.join("\n\n") };
}

export function generar0064(modelo, hashes) {
  const m = modelo;
  const normaId = m.norma.id;
  const enNorma = `norma_id = '${normaId}'`;
  const conteos = {
    hab_tipos_prestador: m.tiposPrestador.length,
    hab_documentos_catalogo: m.documentos.length,
    hab_obligaciones_catalogo: m.obligaciones.length,
    hab_obligacion_vencimientos: m.vencimientos.length,
    hab_novedades_catalogo: m.novedades.length,
    "festivos (CO 2026–2028)": m.festivos.length,
  };
  const paisCo = crudo("(select id from paises where codigo = 'CO')");
  const partes = [
    encabezado("0064 · Habilitación: siembra de catálogos (documentos, obligaciones, novedades, festivos)", hashes, conteos),
    `-- Requiere la norma de 0063 (norma_id).
do $$
begin
  if not exists (select 1 from hab_normas where id = '${normaId}') then
    raise exception 'Seed de habilitación: falta la norma de 0063';
  end if;
  if not exists (select 1 from paises where codigo = 'CO') then
    raise exception 'Seed de habilitación: falta el país CO en paises';
  end if;
end;
$$;`,
    "-- Tipos de prestador",
    insertarPorLotes({
      tabla: "hab_tipos_prestador",
      columnas: ["codigo", "nombre", "definicion", "condiciones", "fuente_norma", "fuente_articulo", "fuente_pagina", "fuente_url", "orden"],
      filas: m.tiposPrestador.map((t) => [t.codigo, t.nombre, t.definicion, t.condiciones, t.fuente_norma, t.fuente_articulo, t.fuente_pagina, t.fuente_url, t.orden]),
      conflicto: "(codigo)",
    }),
    "-- Documentos de inscripción (los 2 no verificados quedan con aplica_a = '{}': nunca se exigen)",
    insertarPorLotes({
      tabla: "hab_documentos_catalogo",
      columnas: [
        "id", "norma_id", "codigo", "nombre_corto", "descripcion_literal", "explicacion_sencilla", "aplica_a", "obligatorio", "condicion_texto",
        "condiciones", "seccion", "por_sede", "tiene_vencimiento", "regla_vigencia", "uno_por_servicio", "fuente_norma", "fuente_articulo",
        "fuente_pagina", "fuente_url", "verificado", "orden",
      ],
      filas: m.documentos.map((d) => [
        d.id, normaId, d.codigo, d.nombre_corto, d.descripcion_literal, d.explicacion_sencilla, d.aplica_a, d.obligatorio, d.condicion_texto,
        d.condiciones, d.seccion, d.por_sede, d.tiene_vencimiento, d.regla_vigencia, d.uno_por_servicio, d.fuente_norma, d.fuente_articulo,
        d.fuente_pagina, d.fuente_url, d.verificado, d.orden,
      ]),
      conflicto: "(id)",
    }),
    "-- Obligaciones de reporte (17 de reportes.json + propias del prestador)",
    insertarPorLotes({
      tabla: "hab_obligaciones_catalogo",
      columnas: [
        "id", "norma_id", "codigo", "nombre", "descripcion_corta", "entidad", "plataforma_nombre", "plataforma_url", "norma_nombre",
        "norma_numero", "norma_articulo", "norma_url", "url_instructivo", "enlace_verificado_el", "url_responde", "periodicidad",
        "aplica_a_tipos", "aplica_a_grupos", "condiciones", "activacion_default", "requiere_confirmacion_asesor", "dias_aviso_default",
        "verificado", "notas",
      ],
      filas: m.obligaciones.map((o) => [
        o.id, normaId, o.codigo, o.nombre, o.descripcion_corta, o.entidad, o.plataforma_nombre, o.plataforma_url, o.norma_nombre,
        o.norma_numero, o.norma_articulo, o.norma_url, o.url_instructivo, o.enlace_verificado_el, o.url_responde, o.periodicidad,
        o.aplica_a_tipos, o.aplica_a_grupos, o.condiciones, o.activacion_default, o.requiere_confirmacion_asesor,
        crudo(`array[${o.dias_aviso_default.join(", ")}]::int[]`), o.verificado, o.notas,
      ]),
      conflicto: "(id)",
    }),
    "-- Reglas de fecha (una fila = una ocurrencia por año; fecha límite LITERAL, D5)",
    insertarPorLotes({
      tabla: "hab_obligacion_vencimientos",
      columnas: ["id", "obligacion_id", "aplica_a_grupos", "aplica_a_tipos", "mes_corte", "dia_corte", "meses_despues", "dia_limite", "etiqueta_periodo"],
      filas: m.vencimientos.map((v) => [v.id, v.obligacion_id, v.aplica_a_grupos, v.aplica_a_tipos, v.mes_corte, v.dia_corte, v.meses_despues, v.dia_limite, v.etiqueta_periodo]),
      conflicto: "(id)",
    }),
    "-- Novedades REPS",
    insertarPorLotes({
      tabla: "hab_novedades_catalogo",
      columnas: ["id", "norma_id", "codigo", "categoria", "nombre", "definicion_literal", "fuente_norma", "fuente_articulo", "fuente_pagina", "fuente_url", "efecto", "orden"],
      filas: m.novedades.map((n) => [n.id, normaId, n.codigo, n.categoria, n.nombre, n.definicion_literal, n.fuente_norma, n.fuente_articulo, n.fuente_pagina, n.fuente_url, n.efecto, n.orden]),
      conflicto: "(id)",
    }),
    "-- Festivos de Colombia 2026–2028 (tabla global reutilizable)",
    insertarPorLotes({
      tabla: "festivos",
      columnas: ["id", "pais_id", "fecha", "nombre", "fuente"],
      filas: m.festivos.map((f) => [f.id, paisCo, f.fecha, f.nombre, f.fuente]),
      conflicto: "(id)",
    }),
    "-- Aserciones finales de conteo",
    bloqueAserciones([
      asercionConteo("hab_tipos_prestador", null, m.tiposPrestador.length),
      asercionConteo("hab_documentos_catalogo", enNorma, m.documentos.length),
      asercionConteo("hab_obligaciones_catalogo", enNorma, m.obligaciones.length),
      asercionConteo(
        "hab_obligacion_vencimientos",
        `obligacion_id in (select id from hab_obligaciones_catalogo where ${enNorma})`,
        m.vencimientos.length,
      ),
      asercionConteo("hab_novedades_catalogo", enNorma, m.novedades.length),
      asercionConteo(
        "festivos",
        `pais_id = (select id from paises where codigo = 'CO') and fecha between ${lit(m.festivos[0].fecha)} and ${lit(m.festivos.at(-1).fecha)}`,
        m.festivos.length,
      ),
    ]),
    "",
  ];
  return { nombre: NOMBRE_0064, sql: partes.join("\n\n") };
}
