// Construye el modelo del catálogo (filas de cada tabla global) a partir de
// las fuentes congeladas y la curaduría. Función pura: mismo input → mismo
// output (orden incluido), que es lo que hace determinista el SQL.
import { idDe } from "./uuid.mjs";
import {
  NORMA,
  ESTANDARES,
  SIGLA,
  MODALIDADES,
  SUBMODALIDADES_EXTRAMURAL,
  FECHA_RES_914,
  CATEGORIA_NOVEDAD_BD,
  EFECTO_NOVEDAD,
  MESES_CORTOS,
} from "./constantes.mjs";
import { ultimoDiaMes } from "./fechas.mjs";

const ordenCanonico = (lista, canon) => [...new Set(lista)].sort((a, b) => canon.indexOf(a) - canon.indexOf(b));

/** 'extramural' sin sub-modalidad coincide con cualquiera: se guarda expandido (§1.2 hab_bloques). */
export function expandirModalidades(lista) {
  if (lista == null) return null;
  const s = new Set(lista);
  if (s.has("extramural")) for (const m of SUBMODALIDADES_EXTRAMURAL) s.add(m);
  return ordenCanonico([...s], MODALIDADES);
}

export const claveServicio = (s) => s.id_prefijo || s.numeral;

export const nivelDe = (numero) => numero.split(".").length - 1;

export const idNorma = () => idDe("norma", NORMA.codigo);
export const idServicio = (clave) => idDe("servicio", NORMA.codigo, clave);
export const idBloque = (clave, estandar, orden) => idDe("bloque", NORMA.codigo, clave, estandar, orden);
export const idCriterio = (codigo, vigenteDesde = null) => idDe("criterio", NORMA.codigo, codigo, vigenteDesde ?? "");

const FUENTE_TEXTO_BD = { compilacion_supersalud: "compilacion_supersalud", ocr_pdf_2019: "pdf_ocr", imagen: "imagen" };

function grupoNumeralDe(nombreGrupo, grupos) {
  if (nombreGrupo === "Todos los servicios") return null;
  const norm = (t) =>
    t
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/^grupo\s+/, "")
      .trim();
  const g = grupos.find((x) => norm(x.nombre) === norm(nombreGrupo));
  if (!g) throw new Error(`grupo sin numeral: ${nombreGrupo}`);
  return g.numeral;
}

function construirServicios(c) {
  const conteo = new Map();
  return c.servicios.map((s, i) => {
    const clave = claveServicio(s);
    conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
    const esContenedor = s.bloques.length === 0;
    const es2019 = clave === "11.3.7-2019";
    return {
      id: idServicio(clave),
      clave,
      numeral: s.numeral,
      grupo_numeral: grupoNumeralDe(s.grupo, c.grupos),
      padre_clave: s.padre ?? null,
      nombre: es2019 ? `${s.nombre} (texto 2019, solo por remisión)` : s.nombre,
      nombre_en_pdf: s.nombre_en_pdf,
      descripcion_literal: s.descripcion_literal ?? null,
      estructura_literal: [s.estructura_literal, s.nota_estructura, s.nota_version].filter(Boolean).join("\n\n") || null,
      pagina_inicio: s.pagina_inicio,
      complejidades: s.complejidades ?? [],
      modalidades: ordenCanonico(s.modalidades ?? [], MODALIDADES),
      telemedicina_categorias: s.telemedicina_categorias ?? [],
      es_transversal: clave === "11.1",
      solo_por_remision: es2019,
      seleccionable: !(clave === "11.1" || esContenedor || es2019),
      orden: i + 1,
      _fuente: s,
    };
  });
}

function construirBloques(c, curaduria, servicios) {
  const { correcciones, edificacion } = curaduria["correcciones-bloques"];
  const bloques = [];
  c.servicios.forEach((s, si) => {
    const srv = servicios[si];
    s.bloques.forEach((b, bi) => {
      const orden = bi + 1;
      const fila = {
        id: idBloque(srv.clave, b.estandar, orden),
        servicio_norma_id: srv.id,
        servicio_clave: srv.clave,
        estandar_codigo: b.estandar,
        orden,
        encabezado_literal: b.encabezado_literal ?? null,
        subtitulo: b.subtitulo ?? null,
        aplica_complejidad: b.aplica_complejidad ?? null,
        aplica_modalidad: expandirModalidades(b.aplica_modalidad ?? null),
        aplica_telemedicina_categoria: b.aplica_telemedicina_categoria ?? null,
        aplica_telemedicina_rol: b.aplica_telemedicina_rol ?? null,
        aplica_tipo_edificacion: null,
        correccion_curada: null,
        _modalidad_fuente: b.aplica_modalidad ?? null,
        _fuente: b,
      };
      const es = (x) => x.servicio === srv.clave && x.estandar === b.estandar && x.orden === orden;
      for (const corr of correcciones.filter(es)) {
        fila.aplica_modalidad = expandirModalidades([...(fila.aplica_modalidad ?? []), ...corr.agregar_modalidad]);
        fila.correccion_curada = `${corr.motivo} Fuente: ${corr.fuente} [curaduría F0, correcciones-bloques.json]`;
      }
      for (const ed of edificacion.filter(es)) fila.aplica_tipo_edificacion = ed.aplica_tipo_edificacion;
      bloques.push(fila);
    });
  });
  return bloques;
}

function construirCriterios(c, curaduria, servicios, bloques) {
  const r11 = curaduria["remite-11-1"];
  const autorresueltos = new Set(r11.autorresueltos);
  const conRemision = new Set(curaduria.remisiones.remisiones.map((r) => r.criterio));
  const vig = curaduria.vigencias;
  const conVigenciaHasta = new Set([...vig.derogados, ...vig.modificados.map((m) => m.codigo)]);

  const criterios = [];
  let bi = 0;
  c.servicios.forEach((s, si) => {
    const srv = servicios[si];
    let orden = 0;
    for (const b of s.bloques) {
      const bloque = bloques[bi++];
      for (const x of b.criterios) {
        orden += 1;
        criterios.push({
          id: idCriterio(x.id),
          codigo: x.id,
          bloque_id: bloque.id,
          servicio_norma_id: srv.id,
          servicio_clave: srv.clave,
          estandar_codigo: b.estandar,
          numero: x.numero,
          padre_codigo: x.padre ? `${srv.clave}.${SIGLA[b.estandar]}.${x.padre}` : null,
          padre_id: null,
          nivel: nivelDe(x.numero),
          orden,
          texto_literal: x.texto_literal,
          pagina: x.pagina,
          confianza: x.confianza,
          motivo_confianza_baja: x.motivo_confianza_baja ?? null,
          fuente_texto: FUENTE_TEXTO_BD[x.fuente_texto],
          nota_vigencia: x.nota_vigencia ?? null,
          vigente_desde: null,
          vigente_hasta: conVigenciaHasta.has(x.id) ? FECHA_RES_914 : null,
          es_encabezado: false,
          remite_a_11_1: autorresueltos.has(x.id),
          tiene_remision: conRemision.has(x.id),
          _bloque: bloque,
        });
      }
    }
  });

  const porCodigo = new Map(criterios.map((x) => [x.codigo, x]));
  for (const j of curaduria["correcciones-bloques"].jerarquia ?? []) {
    const x = porCodigo.get(j.criterio);
    if (!x) throw new Error(`corrección de jerarquía sobre criterio inexistente: ${j.criterio}`);
    if (j.padre !== null) throw new Error(`corrección de jerarquía solo admite padre null: ${j.criterio}`);
    x.padre_codigo = null;
    x.nivel = 0;
  }
  for (const extra of curaduria["criterios-adicionales"].criterios) {
    const base = porCodigo.get(extra.mismo_lugar_que);
    if (!base) throw new Error(`criterio adicional sin base: ${extra.mismo_lugar_que}`);
    criterios.push({
      ...base,
      id: idCriterio(extra.codigo, extra.vigente_desde),
      codigo: extra.codigo,
      texto_literal: extra.texto_literal,
      confianza: "alta",
      motivo_confianza_baja: null,
      fuente_texto: extra.fuente_texto,
      nota_vigencia: extra.nota_vigencia,
      vigente_desde: extra.vigente_desde,
      vigente_hasta: null,
      remite_a_11_1: false,
      tiene_remision: false,
    });
  }

  // padre_id: el padre es siempre la fila sin vigente_desde (la versión base)
  const conHijos = new Set();
  for (const x of criterios) {
    if (!x.padre_codigo) continue;
    const p = porCodigo.get(x.padre_codigo);
    if (!p) throw new Error(`padre inexistente: ${x.codigo} → ${x.padre_codigo}`);
    x.padre_id = p.id;
    conHijos.add(p.id);
  }
  for (const x of criterios) x.es_encabezado = conHijos.has(x.id);
  return criterios;
}

function construirRemisiones(curaduria, servicios, criterios) {
  const porClave = new Map(servicios.map((s) => [s.clave, s]));
  const porCodigo = new Map(criterios.filter((x) => !x.vigente_desde).map((x) => [x.codigo, x]));
  return curaduria.remisiones.remisiones.map((r) => {
    const origen = porCodigo.get(r.criterio);
    const destino = porClave.get(r.servicio_destino);
    if (!origen) throw new Error(`remisión con origen inexistente: ${r.criterio}`);
    if (!destino) throw new Error(`remisión con destino inexistente: ${r.servicio_destino}`);
    return {
      id: idDe("remision", NORMA.codigo, r.criterio, r.servicio_destino, r.estandar_destino ?? ""),
      criterio_id: origen.id,
      criterio_codigo: r.criterio,
      tipo: r.tipo,
      servicio_destino_id: destino.id,
      servicio_destino_clave: destino.clave,
      complejidades_destino: r.complejidades_destino ?? null,
      modalidades_destino: r.modalidades_destino ?? null,
      estandar_destino: r.estandar_destino ?? null,
      criterios_destino: r.criterios_destino ?? null,
      nota_curaduria: `${r.nota} [curaduría F0 ${curaduria.remisiones.fecha_curaduria}, remisiones.json]`,
    };
  });
}

function construirMapeo(fuentes, curaduria, servicios) {
  const aj = curaduria["mapeo-ajustes"];
  const porClave = new Map(servicios.map((s) => [s.clave, s]));
  const excluidos = new Set(aj.numerales_contenedor_excluidos.numerales);
  const inferidas = new Set(aj.inferidas.practicas);
  const divisiones = new Map(aj.divisiones.map((d) => [d.practica_original, d]));
  const eleccion = new Map(aj.eleccion.map((e) => [e.practica, e]));
  const filas = [];
  const agregar = (practica_medica_id, practica_nombre, numeral, confianza, nota) => {
    const srv = porClave.get(numeral);
    if (!srv) throw new Error(`mapeo a numeral inexistente: ${numeral}`);
    filas.push({ practica_medica_id, practica_nombre, servicio_norma_id: srv.id, servicio_clave: numeral, requiere_eleccion: false, nota, confianza });
  };
  for (const p of fuentes["mapeo-servicios"]) {
    const div = divisiones.get(p.practica_medica_id);
    const ele = eleccion.get(p.practica_medica_id);
    if (div) {
      agregar(p.practica_medica_id, div.conserva_uuid_como.nombre, div.conserva_uuid_como.numeral, "alta", `D2: la práctica '${div.nombre_original}' se dividió; esta fila conserva el uuid como '${div.conserva_uuid_como.nombre}'.`);
      for (const n of div.nuevas) agregar(n.id, n.nombre, n.numeral, "alta", `D2: práctica nueva creada al dividir '${div.nombre_original}' (0061).`);
      continue;
    }
    if (ele) {
      for (const o of ele.opciones) agregar(p.practica_medica_id, p.nombre_usuario, o.numeral, o.confianza, `${o.nota} La clínica elige el numeral al declarar el servicio.`);
      continue;
    }
    for (const n of p.numerales_res3100) {
      if (excluidos.has(n.numeral)) continue;
      agregar(p.practica_medica_id, p.nombre_usuario, n.numeral, inferidas.has(p.practica_medica_id) ? "inferida" : "alta", p.nota);
    }
  }
  const porPractica = new Map();
  for (const f of filas) porPractica.set(f.practica_medica_id, (porPractica.get(f.practica_medica_id) ?? 0) + 1);
  for (const f of filas) f.requiere_eleccion = porPractica.get(f.practica_medica_id) > 1;
  return filas;
}

function construirTiposPrestador(fuentes) {
  return fuentes.inscripcion.tipos_prestador.map((t, i) => ({
    codigo: t.codigo,
    nombre: t.nombre,
    definicion: t.definicion,
    condiciones: t.condiciones_que_le_aplican,
    fuente_norma: t.fuente?.norma ?? null,
    fuente_articulo: t.fuente?.articulo_numeral ?? null,
    fuente_pagina: t.fuente?.pagina ?? null,
    fuente_url: t.fuente?.url ?? null,
    orden: i + 1,
  }));
}

function construirDocumentos(fuentes, curaduria) {
  const cond = curaduria["documentos-condiciones"].documentos;
  return fuentes.inscripcion.documentos.map((d, i) => {
    const k = cond[d.id];
    if (!k) throw new Error(`documento sin curaduría de condiciones: ${d.id}`);
    return {
      id: idDe("documento", NORMA.codigo, d.id),
      codigo: d.id,
      nombre_corto: d.nombre_corto,
      descripcion_literal: d.descripcion_literal,
      explicacion_sencilla: null,
      aplica_a: d.aplica_a,
      obligatorio: d.obligatorio,
      condicion_texto: d.condicion ?? null,
      condiciones: k.condiciones,
      seccion: k.seccion,
      por_sede: k.por_sede,
      tiene_vencimiento: k.tiene_vencimiento,
      regla_vigencia: k.regla_vigencia ?? null,
      uno_por_servicio: k.uno_por_servicio ?? false,
      fuente_norma: d.fuente?.norma ?? null,
      fuente_articulo: d.fuente?.articulo_numeral ?? null,
      fuente_pagina: d.fuente?.pagina ?? null,
      fuente_url: d.fuente?.url ?? null,
      verificado: d.verificado,
      orden: i + 1,
    };
  });
}

/** Expande plantillas (mensual/trimestral) a reglas de una ocurrencia por año. */
export function expandirVencimientos(lista) {
  const out = [];
  for (const v of lista) {
    if (!v.plantilla) {
      out.push({ ...v, dia_corte: v.dia_corte ?? null });
      continue;
    }
    const meses = v.plantilla === "mensual" ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : v.plantilla === "trimestral" ? [3, 6, 9, 12] : null;
    if (!meses) throw new Error(`plantilla desconocida: ${v.plantilla}`);
    for (const mes of meses) {
      const especial = mes === 12 && v.excepcion_diciembre ? v.excepcion_diciembre : null;
      out.push({
        aplica_a_grupos: v.aplica_a_grupos ?? null,
        aplica_a_tipos: v.aplica_a_tipos ?? null,
        mes_corte: mes,
        dia_corte: null,
        meses_despues: especial ? especial.meses_despues : v.meses_despues,
        dia_limite: especial ? especial.dia_limite : v.dia_limite,
        etiqueta_periodo: `corte ${ultimoDiaMes(2001, mes)}-${MESES_CORTOS[mes - 1]}`,
      });
    }
  }
  return out;
}

function separarPlataforma(texto) {
  if (!texto) return { nombre: null, url: null };
  const url = texto.match(/https?:\/\/[^\s),]+/)?.[0] ?? null;
  return { nombre: texto, url };
}

function construirObligaciones(fuentes, curaduria) {
  const reglas = curaduria["obligaciones-reglas"];
  const porCodigo = new Map(reglas.obligaciones.map((o) => [o.codigo, o]));
  const consultado = fuentes.reportes.consultado;
  const filas = [];
  const vencimientos = [];
  const empujar = (base, r, esPropia) => {
    const id = idDe("obligacion", NORMA.codigo, base.codigo);
    filas.push({
      id,
      codigo: base.codigo,
      nombre: base.nombre,
      descripcion_corta: base.descripcion_corta,
      entidad: base.entidad,
      plataforma_nombre: base.plataforma_nombre,
      plataforma_url: base.plataforma_url,
      norma_nombre: base.norma_nombre,
      norma_numero: base.norma_numero,
      norma_articulo: base.norma_articulo,
      norma_url: base.norma_url,
      url_instructivo: base.url_instructivo ?? null,
      enlace_verificado_el: base.url_responde == null ? null : consultado,
      url_responde: base.url_responde ?? null,
      periodicidad: r.periodicidad,
      aplica_a_tipos: r.aplica_a_tipos,
      aplica_a_grupos: r.aplica_a_grupos ?? null,
      condiciones: r.condiciones ?? [],
      activacion_default: r.activacion_default,
      requiere_confirmacion_asesor: r.requiere_confirmacion_asesor ?? false,
      dias_aviso_default: r.dias_aviso_default ?? reglas.dias_aviso_default,
      verificado: base.verificado,
      notas: [base.notas, r.nota_aplicabilidad, base.regla_literal ? `Regla literal: ${base.regla_literal}` : null].filter(Boolean).join("\n\n") || null,
      _es_propia: esPropia,
      _grupo_prueba: r.grupo_prueba ?? null,
      _fechas_fuente: base.fechas_fuente ?? [],
    });
    for (const v of expandirVencimientos(r.vencimientos)) {
      vencimientos.push({
        id: idDe(
          "vencimiento",
          NORMA.codigo,
          base.codigo,
          (v.aplica_a_grupos ?? []).join(","),
          (v.aplica_a_tipos ?? []).join(","),
          v.mes_corte,
          v.dia_corte ?? "",
          v.meses_despues,
          v.dia_limite,
        ),
        obligacion_id: id,
        obligacion_codigo: base.codigo,
        ...v,
      });
    }
  };
  for (const o of fuentes.reportes.obligaciones) {
    const r = porCodigo.get(o.codigo);
    if (!r) throw new Error(`obligación sin reglas curadas: ${o.codigo}`);
    const plat = separarPlataforma(o.plataforma);
    empujar(
      {
        codigo: o.codigo,
        nombre: o.nombre,
        descripcion_corta: o.descripcion_corta,
        entidad: o.entidad,
        plataforma_nombre: plat.nombre,
        plataforma_url: plat.url,
        norma_nombre: o.norma?.nombre ?? null,
        norma_numero: o.norma?.numero ?? null,
        norma_articulo: o.norma?.articulo ?? null,
        norma_url: o.norma?.url ?? null,
        url_instructivo: o.url_instructivo ?? null,
        url_responde: o.url_responde ?? null,
        verificado: o.verificado,
        notas: o.notas ?? null,
        regla_literal: o.regla_fecha_limite ?? null,
        fechas_fuente: o.fechas_2026_2027 ?? [],
      },
      r,
      false,
    );
  }
  for (const p of reglas.propias) empujar({ ...p, url_responde: null }, p, true);
  return { obligaciones: filas, vencimientos };
}

function construirNovedades(fuentes) {
  return fuentes.inscripcion.novedades.catalogo.map((n, i) => ({
    id: idDe("novedad", NORMA.codigo, n.id),
    codigo: n.id,
    categoria: CATEGORIA_NOVEDAD_BD[n.categoria],
    nombre: n.nombre,
    definicion_literal: n.definicion_literal,
    fuente_norma: n.fuente?.norma ?? null,
    fuente_articulo: n.fuente?.articulo_numeral ?? null,
    fuente_pagina: n.fuente?.pagina ?? null,
    fuente_url: n.fuente?.url ?? null,
    efecto: EFECTO_NOVEDAD[n.id] ?? null,
    orden: i + 1,
    _categoria_fuente: n.categoria,
  }));
}

function construirFestivos(curaduria) {
  const f = curaduria["festivos-co"];
  return f.festivos.map((x) => ({
    id: idDe("festivo", f.pais_codigo, x.fecha),
    pais_codigo: f.pais_codigo,
    fecha: x.fecha,
    nombre: x.nombre,
    fuente: f.fuente_bd,
  }));
}

export function construirModelo({ fuentes, curaduria }) {
  const c = fuentes.criterios;
  const servicios = construirServicios(c);
  const bloques = construirBloques(c, curaduria, servicios);
  const criterios = construirCriterios(c, curaduria, servicios, bloques);
  const remisiones = construirRemisiones(curaduria, servicios, criterios);
  const mapeo = construirMapeo(fuentes, curaduria, servicios);
  const { obligaciones, vencimientos } = construirObligaciones(fuentes, curaduria);
  const norma = { id: idNorma(), ...NORMA };
  const estandares = ESTANDARES.map((e, i) => {
    const f = c.estandares.find((x) => x.codigo === e.codigo);
    if (!f) throw new Error(`estándar sin fuente: ${e.codigo}`);
    return { codigo: e.codigo, sigla: e.sigla, nombre: f.nombre, numeral_manual: f.numeral_manual, definicion_literal: f.definicion_literal, pagina: f.pagina, orden: i + 1 };
  });
  const nombreGrupo = new Map(c.servicios.map((s) => [s.grupo, s.grupo]));
  const grupos = c.grupos.map((g, i) => {
    const nombre = [...nombreGrupo.keys()].find((n) => n !== "Todos los servicios" && grupoNumeralDe(n, c.grupos) === g.numeral);
    return { numeral: g.numeral, nombre: nombre ?? g.nombre, descripcion_literal: g.descripcion_literal ?? null, orden: i + 1 };
  });
  return {
    norma,
    estandares,
    grupos,
    servicios,
    bloques,
    criterios,
    remisiones,
    mapeo,
    tiposPrestador: construirTiposPrestador(fuentes),
    documentos: construirDocumentos(fuentes, curaduria),
    obligaciones,
    vencimientos,
    novedades: construirNovedades(fuentes),
    festivos: construirFestivos(curaduria),
  };
}
