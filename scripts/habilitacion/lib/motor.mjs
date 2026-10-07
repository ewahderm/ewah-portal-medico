// Implementación de REFERENCIA del motor de aplicabilidad (§1.6), en JS, solo
// para la prueba de humo de la validación 9 y como oráculo de las pruebas del
// motor SQL de F3. NO es código de producción: el motor único vive en SQL
// (fn_hab_resolver_criterios). Si este archivo y el SQL difieren, manda el
// diseño y se corrigen ambos.
//
// Refinamiento respecto del texto de §1.6 (documentado en NOTAS.md): el rol
// de telemedicina filtra también cuando el bloque no restringe categoría
// (p. ej. "Modalidad telemedicina - prestador de referencia" sin categoría),
// y la parte NO telemedicina de un bloque coincide por sí sola sin mirar el
// rol (p. ej. "Modalidades intramural, telemedicina - prestador remisor"
// aplica a una sede solo intramural).

const interseca = (a, b) => a.some((x) => b.includes(x));

export function bloqueCoincide(b, ctx, usoEdificacion) {
  // complejidad
  if (b.aplica_complejidad && !ctx.complejidades.includes("no_aplica")) {
    if (!interseca(b.aplica_complejidad, ctx.complejidades)) return false;
  }
  // modalidad + telemedicina
  if (b.aplica_modalidad) {
    const sinTele = b.aplica_modalidad.filter((m) => m !== "telemedicina");
    const porModalidad = interseca(sinTele, ctx.modalidades);
    const porTele =
      b.aplica_modalidad.includes("telemedicina") &&
      ctx.modalidades.includes("telemedicina") &&
      (!b.aplica_telemedicina_categoria || interseca(b.aplica_telemedicina_categoria, ctx.telemedicina_categorias)) &&
      (!b.aplica_telemedicina_rol || interseca(b.aplica_telemedicina_rol, ctx.telemedicina_roles));
    if (!porModalidad && !porTele) return false;
  }
  // edificación (null en la sede = conservador: incluye ambos)
  if (b.aplica_tipo_edificacion && usoEdificacion && b.aplica_tipo_edificacion !== usoEdificacion) return false;
  return true;
}

export const vigenteEn = (c, fecha) => (!c.vigente_desde || c.vigente_desde <= fecha) && (!c.vigente_hasta || c.vigente_hasta > fecha);

const PRIORIDAD = { directo: 0, transversal: 1, remision: 2 };

/**
 * @param modelo  salida de construirModelo
 * @param sede    { uso_edificacion, servicios: [{ clave, complejidad, modalidades, telemedicina_categorias, telemedicina_roles }] }
 * @param fecha   'AAAA-MM-DD'
 */
export function resolverCriterios(modelo, sede, fecha) {
  const servicioPorClave = new Map(modelo.servicios.map((s) => [s.clave, s]));
  const servicioPorId = new Map(modelo.servicios.map((s) => [s.id, s]));
  const bloquesPorServicio = new Map();
  for (const b of modelo.bloques) {
    if (!bloquesPorServicio.has(b.servicio_norma_id)) bloquesPorServicio.set(b.servicio_norma_id, []);
    bloquesPorServicio.get(b.servicio_norma_id).push(b);
  }
  const criteriosPorBloque = new Map();
  for (const c of modelo.criterios) {
    if (!criteriosPorBloque.has(c.bloque_id)) criteriosPorBloque.set(c.bloque_id, []);
    criteriosPorBloque.get(c.bloque_id).push(c);
  }
  const criterioPorCodigo = new Map(modelo.criterios.filter((c) => !c.vigente_desde).map((c) => [c.codigo, c]));
  const hijosDe = new Map();
  for (const c of modelo.criterios) {
    if (!c.padre_id) continue;
    if (!hijosDe.has(c.padre_id)) hijosDe.set(c.padre_id, []);
    hijosDe.get(c.padre_id).push(c);
  }
  const remisionesPorCriterio = new Map();
  for (const r of modelo.remisiones) {
    if (!remisionesPorCriterio.has(r.criterio_id)) remisionesPorCriterio.set(r.criterio_id, []);
    remisionesPorCriterio.get(r.criterio_id).push(r);
  }

  const contexto = (s) => ({
    complejidades: [s.complejidad],
    modalidades: s.modalidades ?? [],
    telemedicina_categorias: s.telemedicina_categorias ?? [],
    telemedicina_roles: s.telemedicina_roles ?? [],
  });

  // Paso 1: servicios de la sede + 11.1 una vez (contexto = unión)
  const entradas = sede.servicios.map((s) => ({ servicio: servicioPorClave.get(s.clave), ctx: contexto(s), origen: "directo" }));
  if (entradas.some((e) => !e.servicio)) throw new Error("servicio declarado inexistente");
  if (entradas.length > 0) {
    const union = (k) => [...new Set(entradas.flatMap((e) => e.ctx[k]))];
    entradas.push({
      servicio: servicioPorClave.get("11.1"),
      ctx: { complejidades: union("complejidades"), modalidades: union("modalidades"), telemedicina_categorias: union("telemedicina_categorias"), telemedicina_roles: union("telemedicina_roles") },
      origen: "transversal",
    });
  }

  const incluidos = new Map(); // criterio_id → fila
  const agregar = (c, origen, desde, ctx) => {
    if (!vigenteEn(c, fecha)) return false;
    const previo = incluidos.get(c.id);
    if (previo && PRIORIDAD[previo.origen] <= PRIORIDAD[origen]) return false;
    incluidos.set(c.id, { criterio: c, origen, remitido_desde: desde, ctx });
    return true;
  };

  // Paso 2-3: bloques que coinciden + vigencia
  for (const e of entradas) {
    for (const b of bloquesPorServicio.get(e.servicio.id) ?? []) {
      if (!bloqueCoincide(b, e.ctx, sede.uso_edificacion ?? null)) continue;
      for (const c of criteriosPorBloque.get(b.id) ?? []) agregar(c, e.origen, null, e.ctx);
    }
  }

  // Paso 4: remisiones (profundidad máx. 3)
  let frontera = [...incluidos.values()];
  for (let profundidad = 0; profundidad < 3 && frontera.length; profundidad++) {
    const nuevos = [];
    for (const fila of frontera) {
      for (const r of remisionesPorCriterio.get(fila.criterio.id) ?? []) {
        const destino = servicioPorId.get(r.servicio_destino_id);
        const agregarYAnotar = (c, ctx) => {
          if (agregar(c, "remision", fila.criterio.id, ctx)) nuevos.push(incluidos.get(c.id));
        };
        if (r.criterios_destino) {
          const pila = r.criterios_destino.map((cod) => criterioPorCodigo.get(cod));
          while (pila.length) {
            const c = pila.pop();
            agregarYAnotar(c, fila.ctx);
            pila.push(...(hijosDe.get(c.id) ?? []));
          }
          continue;
        }
        const ctx = {
          complejidades:
            r.complejidades_destino ??
            (destino.complejidades.length === 1 ? destino.complejidades : fila.ctx.complejidades),
          modalidades: r.modalidades_destino ?? fila.ctx.modalidades,
          telemedicina_categorias: fila.ctx.telemedicina_categorias,
          telemedicina_roles: fila.ctx.telemedicina_roles,
        };
        const estandar = r.estandar_destino ?? fila.criterio.estandar_codigo;
        for (const b of bloquesPorServicio.get(destino.id) ?? []) {
          if (b.estandar_codigo !== estandar) continue;
          if (!bloqueCoincide(b, ctx, sede.uso_edificacion ?? null)) continue;
          for (const c of criteriosPorBloque.get(b.id) ?? []) agregarYAnotar(c, ctx);
        }
      }
    }
    frontera = nuevos;
  }

  // Paso 6: jerarquía (un hijo solo entra si su padre entró)
  const ordenados = [...incluidos.values()].sort((a, b) => a.criterio.nivel - b.criterio.nivel);
  const finales = new Map();
  for (const f of ordenados) {
    if (f.criterio.padre_id && !finales.has(f.criterio.padre_id)) continue;
    finales.set(f.criterio.id, f);
  }

  return [...finales.values()].map((f) => ({
    criterio_id: f.criterio.id,
    codigo: f.criterio.codigo,
    servicio_clave: f.criterio.servicio_clave,
    estandar_codigo: f.criterio.estandar_codigo,
    origen: f.origen,
    remitido_desde_criterio_id: f.remitido_desde,
    es_encabezado: f.criterio.es_encabezado,
    autorresuelto: f.criterio.remite_a_11_1,
  }));
}
