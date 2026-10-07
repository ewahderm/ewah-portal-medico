// Las 9 validaciones de §2.3 del diseño. Si alguna falla, generar-seed.mjs
// no escribe el SQL. Cada validación devuelve { n, nombre, ok, detalle[] }.
import {
  COMPLEJIDADES,
  MODALIDADES,
  TELEMEDICINA_CATEGORIAS,
  TELEMEDICINA_ROLES,
  USOS_EDIFICACION,
  TIPOS_PRESTADOR,
  GRUPOS_SUPERSALUD,
  TIPOS_REMISION,
  CONDICIONES_DOCUMENTO,
  CONDICIONES_OBLIGACION,
  ENTIDADES,
  PERIODICIDADES,
  ACTIVACIONES,
  SECCIONES_DOCUMENTO,
  CATEGORIAS_NOVEDAD,
  FUENTES_TEXTO,
  FECHA_RES_914,
} from "./constantes.mjs";
import { esCandidato11_1, esCandidatoOtra, RX_REMISION_OTRA } from "./candidatos.mjs";
import { expandirModalidades } from "./modelo.mjs";
import { fechasLimite } from "./fechas.mjs";
import { festivosColombia } from "./festivos.mjs";
import { resolverCriterios } from "./motor.mjs";
import { idPracticaMedica } from "./uuid.mjs";

/** Valores esperados (los fija el diseño §0 y §2.3; cambiar uno es una decisión, no un ajuste). */
export const ESPERADO = {
  criterios_fuente: 3975,
  criterios_curados_extra: 1,
  bloques: 708,
  servicios: 42,
  estandares: 7,
  grupos: 5,
  documentos: 37,
  obligaciones_reportes: 17,
  novedades: 40,
  tipos_prestador: 4,
  practicas_catalogo: 52,
  practicas_nuevas_d2: 4,
  derogados_914: 44,
  modificados_914: 1,
  remite_11_1_director: 547,
  remisiones_director: 41,
  ewah_total: 465,
  ewah_encabezados: 70,
  ewah_autorresueltos: 6,
};

/** Contexto de EWAH para la prueba de humo (§0): 11.2.2 mediana, intramural, edificación exclusiva. */
export const SEDE_EWAH = {
  uso_edificacion: "exclusivo_salud",
  servicios: [{ clave: "11.2.2", complejidad: "mediana", modalidades: ["intramural"], telemedicina_categorias: [], telemedicina_roles: [] }],
};

const norm = (t) => (t ?? "").replace(/\s+/g, " ").trim();
const sinTildes = (t) =>
  (t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
const subconjunto = (a, b) => a.every((x) => b.includes(x));

function resultado(n, nombre, errores, info = []) {
  return { n, nombre, ok: errores.length === 0, detalle: [...errores.map((e) => `ERROR: ${e}`), ...info] };
}

function iterarFuente(c) {
  const out = [];
  for (const s of c.servicios) {
    const clave = s.id_prefijo || s.numeral;
    s.bloques.forEach((b, bi) => {
      for (const x of b.criterios) out.push({ x, clave, bloque: b, ordenBloque: bi + 1 });
    });
  }
  return out;
}

// 1. Conteos
function v1({ fuentes, curaduria }, m) {
  const e = [];
  const chk = (nombre, actual, esperado) => {
    if (actual !== esperado) e.push(`${nombre}: ${actual} (esperado ${esperado})`);
  };
  chk("criterios en la fuente", iterarFuente(fuentes.criterios).length, ESPERADO.criterios_fuente);
  chk("criterios curados extra", curaduria["criterios-adicionales"].criterios.length, ESPERADO.criterios_curados_extra);
  chk("filas hab_criterios", m.criterios.length, ESPERADO.criterios_fuente + ESPERADO.criterios_curados_extra);
  chk("bloques", m.bloques.length, ESPERADO.bloques);
  chk("servicios de la norma", m.servicios.length, ESPERADO.servicios);
  chk("estándares", m.estandares.length, ESPERADO.estandares);
  chk("grupos", m.grupos.length, ESPERADO.grupos);
  chk("documentos", m.documentos.length, ESPERADO.documentos);
  chk("obligaciones de reportes.json", m.obligaciones.filter((o) => !o._es_propia).length, ESPERADO.obligaciones_reportes);
  chk("novedades", m.novedades.length, ESPERADO.novedades);
  chk("tipos de prestador", m.tiposPrestador.length, ESPERADO.tipos_prestador);
  return resultado(1, "Conteos", e, [
    `criterios ${m.criterios.length}, bloques ${m.bloques.length}, servicios ${m.servicios.length}, documentos ${m.documentos.length}, obligaciones ${m.obligaciones.length} (${m.obligaciones.filter((o) => o._es_propia).length} propias), vencimientos ${m.vencimientos.length}, novedades ${m.novedades.length}, festivos ${m.festivos.length}, mapeo ${m.mapeo.length}`,
  ]);
}

// 2. Ids únicos, padres, encabezados
function v2(_e, m) {
  const e = [];
  const info = [];
  const todos = [
    m.norma.id,
    ...m.servicios.map((x) => x.id),
    ...m.bloques.map((x) => x.id),
    ...m.criterios.map((x) => x.id),
    ...m.remisiones.map((x) => x.id),
    ...m.documentos.map((x) => x.id),
    ...m.obligaciones.map((x) => x.id),
    ...m.vencimientos.map((x) => x.id),
    ...m.novedades.map((x) => x.id),
    ...m.festivos.map((x) => x.id),
  ];
  if (new Set(todos).size !== todos.length) e.push(`hay ${todos.length - new Set(todos).size} uuid repetidos`);
  const claves = m.criterios.map((x) => `${x.codigo}|${x.vigente_desde ?? ""}`);
  if (new Set(claves).size !== claves.length) e.push("(codigo, vigente_desde) repetido en criterios");
  const clavesServ = m.servicios.map((s) => s.clave);
  if (new Set(clavesServ).size !== clavesServ.length) e.push("clave de servicio repetida");

  const porId = new Map(m.criterios.map((x) => [x.id, x]));
  const bloquePorId = new Map(m.bloques.map((b) => [b.id, b]));
  const contiene = (padre, hijo) => {
    const dim = (p, h) => p == null || (h != null && subconjunto(h, p));
    return (
      dim(padre.aplica_complejidad, hijo.aplica_complejidad) &&
      dim(padre.aplica_modalidad, hijo.aplica_modalidad) &&
      dim(padre.aplica_telemedicina_categoria, hijo.aplica_telemedicina_categoria) &&
      dim(padre.aplica_telemedicina_rol, hijo.aplica_telemedicina_rol) &&
      (padre.aplica_tipo_edificacion == null || padre.aplica_tipo_edificacion === hijo.aplica_tipo_edificacion)
    );
  };
  let entreBloques = 0;
  const conHijos = new Set();
  for (const c of m.criterios) {
    if (!c.padre_id) {
      if (c.nivel !== 0) e.push(`${c.codigo}: nivel ${c.nivel} sin padre`);
      continue;
    }
    const p = porId.get(c.padre_id);
    conHijos.add(p.id);
    if (p.vigente_desde) e.push(`${c.codigo}: su padre es una fila con vigencia futura`);
    if (p.nivel !== c.nivel - 1) e.push(`${c.codigo}: nivel ${c.nivel} y padre nivel ${p.nivel}`);
    if (!c.numero.startsWith(`${p.numero}.`)) e.push(`${c.codigo}: número no cuelga de ${p.numero}`);
    if (p.servicio_norma_id !== c.servicio_norma_id || p.estandar_codigo !== c.estandar_codigo) e.push(`${c.codigo}: padre en otro servicio/estándar`);
    if (p.bloque_id !== c.bloque_id) {
      // El diseño pide "mismo bloque"; la fuente tiene hijos en un bloque más
      // específico que el del padre (p. ej. 11.1.HC.14 → 14.1…14.13). Es válido
      // si el bloque del padre CONTIENE al del hijo: el padre entra siempre que
      // entra el hijo y la regla de jerarquía del motor no pierde criterios.
      entreBloques += 1;
      if (!contiene(bloquePorId.get(p.bloque_id), bloquePorId.get(c.bloque_id))) {
        e.push(`${c.codigo}: padre ${p.codigo} en un bloque que no contiene al del hijo`);
      }
    }
  }
  for (const c of m.criterios) if (c.es_encabezado !== conHijos.has(c.id)) e.push(`${c.codigo}: es_encabezado incoherente`);
  info.push(`${conHijos.size} encabezados; ${entreBloques} hijos en un bloque contenido en el del padre (permitido, ver NOTAS.md)`);
  return resultado(2, "Ids únicos, padres y encabezados", e, info);
}

// 3. Vocabularios y dimensiones bloque ⊆ servicio
function v3(_e, m) {
  const e = [];
  const servPorId = new Map(m.servicios.map((s) => [s.id, s]));
  const voc = (nombre, lista, permitidos, donde) => {
    for (const v of lista ?? []) if (!permitidos.includes(v)) e.push(`${donde}: ${nombre} '${v}' fuera del vocabulario`);
  };
  for (const s of m.servicios) {
    voc("complejidad", s.complejidades, COMPLEJIDADES, s.clave);
    voc("modalidad", s.modalidades, MODALIDADES, s.clave);
    voc("categoría", s.telemedicina_categorias, TELEMEDICINA_CATEGORIAS, s.clave);
  }
  for (const b of m.bloques) {
    const s = servPorId.get(b.servicio_norma_id);
    const donde = `${s.clave} ${b.estandar_codigo} #${b.orden}`;
    voc("complejidad", b.aplica_complejidad, COMPLEJIDADES, donde);
    voc("modalidad", b.aplica_modalidad, MODALIDADES, donde);
    voc("categoría", b.aplica_telemedicina_categoria, TELEMEDICINA_CATEGORIAS, donde);
    voc("rol", b.aplica_telemedicina_rol, TELEMEDICINA_ROLES, donde);
    if (b.aplica_tipo_edificacion && !USOS_EDIFICACION.includes(b.aplica_tipo_edificacion)) e.push(`${donde}: edificación inválida`);
    if (b.aplica_tipo_edificacion && s.clave !== "11.1") e.push(`${donde}: edificación fuera de 11.1`);
    if (b.aplica_telemedicina_categoria && !(b.aplica_modalidad ?? []).includes("telemedicina")) e.push(`${donde}: categoría de telemedicina sin modalidad telemedicina`);
    if (s.clave === "11.1") continue;
    if (b.aplica_complejidad && !s.complejidades.includes("no_aplica") && !subconjunto(b.aplica_complejidad, s.complejidades)) e.push(`${donde}: complejidad ${b.aplica_complejidad} ⊄ ${s.complejidades}`);
    if (b.aplica_modalidad && !subconjunto(b.aplica_modalidad, expandirModalidades(s.modalidades))) e.push(`${donde}: modalidad ${b.aplica_modalidad} ⊄ ${s.modalidades}`);
    if (b.aplica_telemedicina_categoria && !subconjunto(b.aplica_telemedicina_categoria, s.telemedicina_categorias)) e.push(`${donde}: categoría ⊄ servicio`);
  }
  // Página null solo donde el texto no existe en el PDF de 2019 (11.3.7 según
  // la Res. 1410/2022, tomado de la compilación): ver NOTAS.md (ajuste de esquema).
  for (const s of m.servicios) if (s.pagina_inicio == null && s.clave !== "11.3.7") e.push(`${s.clave}: pagina_inicio null`);
  for (const c of m.criterios) {
    if (c.pagina == null && c.servicio_clave !== "11.3.7") e.push(`${c.codigo}: pagina null`);
    if (!FUENTES_TEXTO.includes(c.fuente_texto)) e.push(`${c.codigo}: fuente_texto ${c.fuente_texto}`);
    if (!["alta", "baja"].includes(c.confianza)) e.push(`${c.codigo}: confianza ${c.confianza}`);
    if (c.confianza === "baja" && !c.motivo_confianza_baja) e.push(`${c.codigo}: confianza baja sin motivo`);
  }
  return resultado(3, "Vocabularios cerrados y dimensiones bloque ⊆ servicio", e);
}

/** Auditoría encabezado literal vs arreglos aplica_* (hallazgo 1 del director). */
export function auditarBloque(b) {
  const enc = sinTildes(b.encabezado_literal);
  const mod = new Set();
  if (/intramural/.test(enc)) mod.add("intramural");
  if (/unidad movil/.test(enc)) mod.add("extramural_unidad_movil");
  if (/jornada/.test(enc)) mod.add("extramural_jornada_salud");
  if (/domiciliaria/.test(enc)) mod.add("extramural_domiciliaria");
  if (/telemedicina|telexperticia|telemonitoreo|interactiva/.test(enc)) mod.add("telemedicina");
  if (/extramural/.test(enc) && !/unidad movil|jornada|domiciliaria/.test(enc)) for (const x of expandirModalidades(["extramural"])) mod.add(x);
  const comp = new Set();
  if (/\bbaja\b/.test(enc)) comp.add("baja");
  if (/\bmediana\b|\bmedia\b/.test(enc)) comp.add("mediana");
  if (/\balta\b/.test(enc)) comp.add("alta");
  const tiene = new Set(b.aplica_modalidad ?? []);
  const tieneC = new Set(b.aplica_complejidad ?? []);
  const difs = [];
  for (const x of mod) if (!tiene.has(x)) difs.push(`falta modalidad ${x}`);
  for (const x of tiene) if (!mod.has(x)) difs.push(`sobra modalidad ${x}`);
  for (const x of comp) if (!tieneC.has(x)) difs.push(`falta complejidad ${x}`);
  for (const x of tieneC) if (!comp.has(x) && x !== "no_aplica") difs.push(`sobra complejidad ${x}`);
  return difs;
}

// 4. Auditoría encabezado vs aplica_*
function v4({ curaduria }, m) {
  const e = [];
  const { correcciones, edificacion, falsos_positivos_auditoria: blanca } = curaduria["correcciones-bloques"];
  const buscar = (x) => m.bloques.find((b) => b.servicio_clave === x.servicio && b.estandar_codigo === x.estandar && b.orden === x.orden);
  for (const x of [...correcciones, ...blanca]) {
    const b = buscar(x);
    if (!b) e.push(`curaduría apunta a un bloque inexistente: ${x.servicio} ${x.estandar} #${x.orden}`);
    else if (norm(b.encabezado_literal) !== norm(x.encabezado_esperado)) e.push(`${x.servicio} ${x.estandar} #${x.orden}: el encabezado no coincide con el esperado por la curaduría`);
  }
  for (const x of edificacion) {
    const b = buscar(x);
    if (!b || norm(b.subtitulo) !== norm(x.subtitulo_esperado)) e.push(`edificación: ${x.servicio} ${x.estandar} #${x.orden} no tiene el subtítulo esperado`);
  }
  // todo bloque de 11.1 IN con subtítulo de edificación debe estar normalizado
  for (const b of m.bloques.filter((b) => b.servicio_clave === "11.1" && /edificaciones de uso/i.test(b.subtitulo ?? ""))) {
    if (!edificacion.some((x) => buscar(x) === b)) e.push(`bloque de edificación sin normalizar: 11.1 IN #${b.orden}`);
  }
  const enBlanca = new Set(blanca.map((x) => buscar(x)));
  let dif = 0;
  for (const b of m.bloques) {
    const d = auditarBloque(b);
    if (d.length === 0) {
      if (enBlanca.has(b)) e.push(`lista blanca obsoleta: ${b.servicio_clave} ${b.estandar_codigo} #${b.orden} ya no difiere`);
      continue;
    }
    if (enBlanca.has(b)) continue;
    dif += 1;
    e.push(`${b.servicio_clave} ${b.estandar_codigo} #${b.orden}: ${d.join(", ")} — «${b.encabezado_literal}»`);
  }
  return resultado(4, "Auditoría encabezado literal vs aplica_*", e, [
    `${correcciones.length} corrección(es), ${edificacion.length} bloque(s) de edificación normalizados, ${blanca.length} falso(s) positivo(s) en lista blanca, ${dif} diferencia(s) sin explicar`,
  ]);
}

// 5. Remisiones: todo candidato clasificado
function v5({ fuentes, curaduria }, m) {
  const e = [];
  const r11 = curaduria["remite-11-1"];
  const auto = new Set(r11.autorresueltos);
  const noAuto = new Set(r11.no_autorresueltos.map((x) => x.id));
  const adicionales = new Set(r11.adicionales.map((x) => x.id));
  const remis = curaduria.remisiones.remisiones;
  const origenes = new Set(remis.map((r) => r.criterio));
  const noRem = new Set(curaduria["no-remision"].criterios.map((x) => x.id));
  const existentes = new Set(m.criterios.map((c) => c.codigo));
  const servPorClave = new Map(m.servicios.map((s) => [s.clave, s]));
  const codigoACriterio = new Map(m.criterios.filter((c) => !c.vigente_desde).map((c) => [c.codigo, c]));

  for (const id of [...auto, ...noAuto, ...origenes, ...noRem]) if (!existentes.has(id)) e.push(`curaduría menciona un criterio inexistente: ${id}`);
  for (const id of auto) if (noAuto.has(id)) e.push(`${id} está en autorresueltos y en no_autorresueltos`);
  for (const id of auto) if (origenes.has(id)) e.push(`${id} es autorresuelto pero tiene remisión a otro servicio (se ocultaría esa exigencia)`);
  for (const id of noRem) if (origenes.has(id)) e.push(`${id} está en remisiones y en no-remision`);
  if (new Set(r11.autorresueltos).size !== r11.autorresueltos.length) e.push("autorresueltos con ids repetidos");

  const resto = (t) => {
    const n = norm(t);
    const i = n.search(/todos los servicios/i);
    return i < 0 ? n : n.slice(i + "todos los servicios".length);
  };
  let cand11 = 0;
  let candOtra = 0;
  for (const { x } of iterarFuente(fuentes.criterios)) {
    if (esCandidato11_1(x.texto_literal)) {
      cand11 += 1;
      if (!auto.has(x.id) && !noAuto.has(x.id)) e.push(`candidato a remisión a 11.1 sin clasificar: ${x.id}`);
    }
    if (esCandidatoOtra(x.texto_literal) && (!esCandidato11_1(x.texto_literal) || RX_REMISION_OTRA.test(resto(x.texto_literal)))) {
      candOtra += 1;
      if (!origenes.has(x.id) && !noRem.has(x.id) && !adicionales.has(x.id)) e.push(`candidato a remisión a otro servicio sin clasificar: ${x.id}`);
    }
  }
  for (const id of adicionales) if (!auto.has(id)) e.push(`adicional ${id} no está en autorresueltos`);

  for (const r of remis) {
    const destino = servPorClave.get(r.servicio_destino);
    const origen = codigoACriterio.get(r.criterio);
    if (!TIPOS_REMISION.includes(r.tipo)) e.push(`${r.criterio}: tipo ${r.tipo}`);
    if (!destino) {
      e.push(`${r.criterio}: destino inexistente ${r.servicio_destino}`);
      continue;
    }
    if (r.tipo === "a_otro_servicio" && destino.clave === origen?.servicio_clave) e.push(`${r.criterio}: a_otro_servicio hacia sí mismo`);
    if (r.tipo !== "a_otro_servicio" && r.tipo !== "a_version_anterior" && destino.clave !== origen?.servicio_clave) e.push(`${r.criterio}: ${r.tipo} debe apuntar al mismo servicio`);
    for (const c of r.complejidades_destino ?? []) if (!destino.complejidades.includes(c)) e.push(`${r.criterio}: complejidad ${c} no existe en ${destino.clave}`);
    for (const mo of r.modalidades_destino ?? []) if (!destino.modalidades.includes(mo)) e.push(`${r.criterio}: modalidad ${mo} no existe en ${destino.clave}`);
    for (const cod of r.criterios_destino ?? []) {
      const c = codigoACriterio.get(cod);
      if (!c) e.push(`${r.criterio}: criterio destino inexistente ${cod}`);
      else if (c.servicio_clave !== destino.clave) e.push(`${r.criterio}: ${cod} no es de ${destino.clave}`);
    }
    if (!r.criterios_destino) {
      const est = r.estandar_destino ?? origen.estandar_codigo;
      if (!m.bloques.some((b) => b.servicio_clave === destino.clave && b.estandar_codigo === est)) e.push(`${r.criterio}: ${destino.clave} no tiene bloques de ${est}`);
    }
    if (!r.nota) e.push(`${r.criterio}: remisión sin nota de curaduría`);
  }
  const porTipo = {};
  for (const r of remis) porTipo[r.tipo] = (porTipo[r.tipo] ?? 0) + 1;
  const aOtroServOComp = (porTipo.a_otro_servicio ?? 0) + (porTipo.a_otra_complejidad ?? 0);
  return resultado(5, "Remisiones: todo candidato clasificado", e, [
    `remisión a 11.1: ${cand11} candidatos por regex; autorresueltos curados = ${auto.size} (director: ${ESPERADO.remite_11_1_director}), no autorresueltos = ${noAuto.size}`,
    `remisión a otro servicio/complejidad/modalidad/versión: ${candOtra} candidatos; remisiones curadas = ${remis.length} (${Object.entries(porTipo).map(([k, v]) => `${k} ${v}`).join(", ")}); a otro servicio u otra complejidad = ${aOtroServOComp} (director: ${ESPERADO.remisiones_director}); descartadas con motivo = ${noRem.size}`,
  ]);
}

// 6. Vigencias Res. 914/2025
function v6({ fuentes, curaduria }, m) {
  const e = [];
  const vig = curaduria.vigencias;
  if (vig.derogados.length !== ESPERADO.derogados_914) e.push(`derogados: ${vig.derogados.length} (esperado ${ESPERADO.derogados_914})`);
  if (vig.modificados.length !== ESPERADO.modificados_914) e.push(`modificados: ${vig.modificados.length} (esperado ${ESPERADO.modificados_914})`);
  const fuentePorId = new Map(iterarFuente(fuentes.criterios).map(({ x }) => [x.id, x]));
  for (const id of vig.derogados) {
    const nota = fuentePorId.get(id)?.nota_vigencia ?? "";
    if (!/Derogado/.test(nota) || !/914/.test(nota)) e.push(`${id}: su nota_vigencia no dice 'Derogado … Res. 914'`);
  }
  for (const mo of vig.modificados) {
    const nota = fuentePorId.get(mo.codigo)?.nota_vigencia ?? "";
    if (!/Modificado/.test(nota) || !/914/.test(nota)) e.push(`${mo.codigo}: su nota_vigencia no dice 'Modificado … Res. 914'`);
  }
  const listados = new Set([...vig.derogados, ...vig.modificados.map((x) => x.codigo)]);
  for (const [id, x] of fuentePorId) if (/914/.test(x.nota_vigencia ?? "") && !listados.has(id)) e.push(`${id} menciona la Res. 914 y no está curado en vigencias.json`);
  const conHasta = m.criterios.filter((c) => c.vigente_hasta === FECHA_RES_914);
  if (conHasta.length !== ESPERADO.derogados_914 + ESPERADO.modificados_914) e.push(`filas con vigente_hasta ${FECHA_RES_914}: ${conHasta.length}`);
  const otrasHasta = m.criterios.filter((c) => c.vigente_hasta && c.vigente_hasta !== FECHA_RES_914);
  if (otrasHasta.length) e.push(`hay vigente_hasta distintos de ${FECHA_RES_914}`);
  for (const mo of vig.modificados) {
    const nueva = m.criterios.find((c) => c.codigo === mo.codigo && c.vigente_desde === FECHA_RES_914);
    if (!nueva) e.push(`${mo.codigo}: falta la fila nueva con vigente_desde ${FECHA_RES_914}`);
  }
  return resultado(6, "Vigencias Res. 914/2025", e, [
    `${vig.derogados.length} derogados + ${vig.modificados.length} modificado con vigente_hasta ${FECHA_RES_914}; ${m.criterios.filter((c) => c.vigente_desde).length} criterio(s) nuevo(s) desde esa fecha`,
  ]);
}

// 7. Mapeo práctica → servicio de la norma
function v7({ fuentes, curaduria }, m) {
  const e = [];
  const aj = curaduria["mapeo-ajustes"];
  const servPorClave = new Map(m.servicios.map((s) => [s.clave, s]));
  const nuevas = aj.divisiones.flatMap((d) => d.nuevas);
  for (const n of nuevas) {
    const esperado = idPracticaMedica(n.nombre);
    if (esperado !== n.id) e.push(`uuid de '${n.nombre}' = ${n.id}, la fórmula de 0061 da ${esperado}`);
  }
  const practicas = [...fuentes["mapeo-servicios"].map((p) => p.practica_medica_id), ...nuevas.map((n) => n.id)];
  if (fuentes["mapeo-servicios"].length !== ESPERADO.practicas_catalogo) e.push(`prácticas en el mapeo fuente: ${fuentes["mapeo-servicios"].length}`);
  if (nuevas.length !== ESPERADO.practicas_nuevas_d2) e.push(`prácticas nuevas D2: ${nuevas.length}`);
  const filasPor = new Map();
  for (const f of m.mapeo) {
    if (!filasPor.has(f.practica_medica_id)) filasPor.set(f.practica_medica_id, []);
    filasPor.get(f.practica_medica_id).push(f);
  }
  for (const p of practicas) if (!filasPor.has(p)) e.push(`práctica ${p} sin numeral`);
  for (const [p, filas] of filasPor) {
    const varias = filas.length > 1;
    for (const f of filas) {
      if (f.requiere_eleccion !== varias) e.push(`${p} → ${f.servicio_clave}: requiere_eleccion debe ser ${varias}`);
      const s = servPorClave.get(f.servicio_clave);
      if (!s.seleccionable) e.push(`${p} → ${f.servicio_clave}: el servicio no es seleccionable`);
      if (!["alta", "inferida"].includes(f.confianza)) e.push(`${p}: confianza ${f.confianza}`);
    }
    if (new Set(filas.map((f) => f.servicio_clave)).size !== filas.length) e.push(`${p}: numeral repetido`);
  }
  if (filasPor.size !== practicas.length) e.push(`prácticas con mapeo: ${filasPor.size} de ${practicas.length}`);
  const conEleccion = [...filasPor.values()].filter((f) => f.length > 1).map((f) => `${f[0].practica_nombre} → {${f.map((x) => x.servicio_clave).join(", ")}}`);
  return resultado(7, "Mapeo práctica → servicio de la norma", e, [
    `${practicas.length} prácticas (${ESPERADO.practicas_catalogo} + ${nuevas.length} de D2), ${m.mapeo.length} filas; con elección: ${conEleccion.join("; ")}`,
  ]);
}

// 8. Reglas de fecha reproducen reportes.json + catálogos cerrados de obligaciones/documentos
function v8({ fuentes, curaduria }, m) {
  const e = [];
  const info = [];
  const hasta = "2027-12-31";
  const desde = fuentes.reportes.consultado;
  for (const o of m.obligaciones) {
    if (!PERIODICIDADES.includes(o.periodicidad)) e.push(`${o.codigo}: periodicidad ${o.periodicidad}`);
    if (!ENTIDADES.includes(o.entidad)) e.push(`${o.codigo}: entidad ${o.entidad}`);
    if (!ACTIVACIONES.includes(o.activacion_default)) e.push(`${o.codigo}: activación ${o.activacion_default}`);
    for (const t of o.aplica_a_tipos) if (!TIPOS_PRESTADOR.includes(t)) e.push(`${o.codigo}: tipo ${t}`);
    for (const g of o.aplica_a_grupos ?? []) if (!GRUPOS_SUPERSALUD.includes(g)) e.push(`${o.codigo}: grupo ${g}`);
    for (const c of o.condiciones) if (!CONDICIONES_OBLIGACION.includes(c)) e.push(`${o.codigo}: condición ${c} fuera de la lista cerrada`);
    const reglas = m.vencimientos.filter((v) => v.obligacion_id === o.id);
    const conFecha = ["mensual", "trimestral", "semestral", "anual"].includes(o.periodicidad);
    if (conFecha && reglas.length === 0) e.push(`${o.codigo}: periodicidad ${o.periodicidad} sin reglas de fecha`);
    if (!conFecha && reglas.length > 0) e.push(`${o.codigo}: periodicidad ${o.periodicidad} no debería tener reglas`);
    for (const r of reglas) {
      if (!(r.mes_corte >= 1 && r.mes_corte <= 12 && r.dia_limite >= 1 && r.dia_limite <= 31 && r.meses_despues >= 0)) e.push(`${o.codigo}: regla fuera de rango`);
      for (const g of r.aplica_a_grupos ?? []) if (!GRUPOS_SUPERSALUD.includes(g)) e.push(`${o.codigo}: grupo ${g} en regla`);
    }
    if (o._fechas_fuente.length) {
      const grupo = o._grupo_prueba;
      const calc = fechasLimite(reglas, { grupo, tipo: "ips" }, desde, hasta);
      const fuente = [...new Set(o._fechas_fuente)].sort();
      if (JSON.stringify(calc) !== JSON.stringify(fuente)) e.push(`${o.codigo} (grupo ${grupo}): reglas dan [${calc}] y reportes.json dice [${fuente}]`);
      else info.push(`${o.codigo} (${grupo}): ${calc.length} fecha(s) reproducidas`);
    }
  }
  const codigosReportes = new Set(fuentes.reportes.obligaciones.map((o) => o.codigo));
  for (const r of curaduria["obligaciones-reglas"].obligaciones) if (!codigosReportes.has(r.codigo)) e.push(`reglas para obligación inexistente: ${r.codigo}`);
  for (const d of m.documentos) {
    for (const c of d.condiciones) if (!CONDICIONES_DOCUMENTO.includes(c)) e.push(`${d.codigo}: condición ${c} fuera de la lista cerrada`);
    for (const t of d.aplica_a) if (!TIPOS_PRESTADOR.includes(t)) e.push(`${d.codigo}: tipo ${t}`);
    if (!SECCIONES_DOCUMENTO.includes(d.seccion)) e.push(`${d.codigo}: sección ${d.seccion}`);
    if (!d.verificado && d.aplica_a.length) e.push(`${d.codigo}: no verificado y con aplica_a no vacío (nunca debe exigirse)`);
  }
  const curadosDoc = Object.keys(curaduria["documentos-condiciones"].documentos);
  for (const k of curadosDoc) if (!m.documentos.some((d) => d.codigo === k)) e.push(`documentos-condiciones.json: ${k} no existe en inscripcion.json`);
  for (const n of m.novedades) if (!CATEGORIAS_NOVEDAD.includes(n.categoria)) e.push(`novedad ${n.codigo}: categoría ${n._categoria_fuente} sin mapeo`);
  // festivos curados = cálculo independiente
  const calculados = [2026, 2027, 2028].flatMap((a) => festivosColombia(a));
  const curados = curaduria["festivos-co"].festivos;
  if (JSON.stringify(calculados) !== JSON.stringify(curados)) e.push("festivos-co.json no coincide con el cálculo de lib/festivos.mjs");
  return resultado(8, "Reglas de fecha = fechas_2026_2027 de reportes.json (+ catálogos cerrados)", e, info);
}

// 9. Prueba de humo del motor de referencia
function v9(_e, m) {
  const e = [];
  const hoy = resolverCriterios(m, SEDE_EWAH, "2026-10-06");
  const total = hoy.length;
  const enc = hoy.filter((x) => x.es_encabezado).length;
  const auto = hoy.filter((x) => x.autorresuelto).length;
  if (total !== ESPERADO.ewah_total) e.push(`EWAH: ${total} criterios (esperado ${ESPERADO.ewah_total})`);
  if (enc !== ESPERADO.ewah_encabezados) e.push(`EWAH: ${enc} encabezados (esperado ${ESPERADO.ewah_encabezados})`);
  if (auto !== ESPERADO.ewah_autorresueltos) e.push(`EWAH: ${auto} autorresueltos (esperado ${ESPERADO.ewah_autorresueltos})`);
  if (!hoy.some((x) => x.codigo === "11.2.2.HC.26")) e.push("EWAH: falta 11.2.2.HC.26 (corrección del bloque HC)");
  const desglose = {};
  for (const x of hoy) desglose[`${x.servicio_clave}/${x.origen}`] = (desglose[`${x.servicio_clave}/${x.origen}`] ?? 0) + 1;
  const d2027 = resolverCriterios(m, SEDE_EWAH, FECHA_RES_914);
  const salen = hoy.filter((x) => !d2027.some((y) => y.criterio_id === x.criterio_id)).length;
  const entran = d2027.filter((y) => !hoy.some((x) => x.criterio_id === y.criterio_id)).length;
  return resultado(9, "Prueba de humo del motor (referencia JS): EWAH", e, [
    `2026-10-06: ${total} criterios (${Object.entries(desglose).map(([k, v]) => `${k} ${v}`).join(", ")}), ${enc} encabezados, ${auto} autorresueltos`,
    `${FECHA_RES_914}: ${d2027.length} criterios (salen ${salen} derogados/modificados, entra ${entran} texto nuevo)`,
    "La prueba contra la BD (fn_hab_criterios_aplicables) es de F3.",
  ]);
}

export function validarTodo(entrada, modelo) {
  return [v1, v2, v3, v4, v5, v6, v7, v8, v9].map((v) => {
    try {
      return v(entrada, modelo);
    } catch (err) {
      return { n: Number(v.name.slice(1)), nombre: v.name, ok: false, detalle: [`ERROR: excepción ${err.stack ?? err}`] };
    }
  });
}
