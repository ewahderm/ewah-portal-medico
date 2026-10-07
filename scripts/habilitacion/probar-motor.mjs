// Pruebas del motor de aplicabilidad SQL (F3, migración 0065) contra la BD
// enlazada, comparando cada caso con el motor de referencia en JS
// (lib/motor.mjs, el oráculo de la validación 9).
//
//   node scripts/habilitacion/probar-motor.mjs
//
// Lee NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY y
// SUPABASE_SERVICE_ROLE_KEY de apps/web/.env.local.
//
// 1. Núcleo (fn_hab_resolver_criterios) con fixtures jsonb: no necesita
//    datos de clínica. Por cada caso exige el MISMO conjunto de criterio_id
//    y el mismo origen por criterio que el motor JS, más las aserciones
//    propias del caso (465 de EWAH, 423 en 2027, edificación, telemedicina,
//    quimioterapia) y un barrido de todos los servicios seleccionables.
// 2. Envoltorio (fn_hab_criterios_aplicables, fn_hab_criterio_aplica,
//    fn_hab_tablero_criterios) con una clínica desechable (createUser +
//    bootstrap_clinica + sede + servicio 11.2.2), incluido que un usuario
//    de OTRA clínica no ve nada. Se borra todo al final, falle o no.
//
// Sale con código 1 si algún caso falla.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { cargarTodo, RAIZ } from "./lib/cargar.mjs";
import { construirModelo } from "./lib/modelo.mjs";
import { resolverCriterios } from "./lib/motor.mjs";
import { FECHA_RES_914 } from "./lib/constantes.mjs";

const HOY = "2026-10-06";
const EWAH = {
  uso_edificacion: "exclusivo_salud",
  servicios: [{ clave: "11.2.2", complejidad: "mediana", modalidades: ["intramural"], telemedicina_categorias: [], telemedicina_roles: [] }],
};
const conEdificacion = (uso) => ({ ...EWAH, uso_edificacion: uso });
const conServicio = (s) => ({ uso_edificacion: "exclusivo_salud", servicios: [s] });

// ------------------------------------------------------------------
// Casos (exportados para poder correrlos también contra PGlite)
// ------------------------------------------------------------------
export function construirCasos(m) {
  const bloque = new Map(m.bloques.map((b) => [b.id, b]));
  const criterio = new Map(m.criterios.map((c) => [c.id, c]));
  const servicio = new Map(m.servicios.map((s) => [s.id, s]));
  const claveDe = (fila) => servicio.get(fila.servicio_norma_id).clave;
  const bloqueDe = (id) => bloque.get(criterio.get(id).bloque_id);
  const casos = [];

  casos.push({
    nombre: "EWAH 11.2.2 mediana intramural, exclusiva, hoy",
    sede: EWAH,
    fecha: HOY,
    verificar(filas) {
      const e = [];
      const desglose = {};
      for (const f of filas) desglose[`${claveDe(f)}/${f.origen}`] = (desglose[`${claveDe(f)}/${f.origen}`] ?? 0) + 1;
      const esperado = { "11.1/transversal": 389, "11.2.2/directo": 16, "11.2.1/remision": 60 };
      if (filas.length !== 465) e.push(`total ${filas.length} (esperado 465)`);
      for (const [k, v] of Object.entries(esperado)) if (desglose[k] !== v) e.push(`${k} = ${desglose[k]} (esperado ${v})`);
      if (Object.keys(desglose).length !== 3) e.push(`desglose inesperado ${JSON.stringify(desglose)}`);
      const enc = filas.filter((f) => f.es_encabezado).length;
      const auto = filas.filter((f) => f.autorresuelto).length;
      if (enc !== 70) e.push(`encabezados ${enc} (esperado 70)`);
      if (auto !== 6) e.push(`autorresueltos ${auto} (esperado 6)`);
      return { e, info: `465 = ${JSON.stringify(desglose)}, ${enc} encabezados, ${auto} autorresueltos` };
    },
  });

  casos.push({
    nombre: `EWAH a ${FECHA_RES_914} (Res. 914/2025)`,
    sede: EWAH,
    fecha: FECHA_RES_914,
    verificar(filas) {
      const e = filas.length === 423 ? [] : [`total ${filas.length} (esperado 423)`];
      return { e, info: `${filas.length} criterios` };
    },
  });

  // Edificación: exclusiva vs mixta vs sin dato. Lo que cambia debe venir
  // SOLO de bloques con aplica_tipo_edificacion; sin dato = unión.
  const edif = {};
  for (const uso of ["exclusivo_salud", "mixto", null]) {
    casos.push({
      nombre: `EWAH edificación ${uso ?? "sin dato"}`,
      sede: conEdificacion(uso),
      fecha: HOY,
      verificar(filas) {
        edif[uso ?? "null"] = new Set(filas.map((f) => f.criterio_id));
        if (uso !== null) return { e: [], info: `${filas.length} criterios` };
        const e = [];
        const ex = edif.exclusivo_salud, mx = edif.mixto, nu = edif.null;
        const soloEx = [...ex].filter((id) => !mx.has(id));
        const soloMx = [...mx].filter((id) => !ex.has(id));
        if (!soloEx.length || !soloMx.length) e.push("mixta y exclusiva no cambian los bloques de edificación");
        for (const id of soloEx) if (bloqueDe(id).aplica_tipo_edificacion !== "exclusivo_salud") e.push(`${criterio.get(id).codigo} solo en exclusiva sin bloque de edificación exclusiva`);
        for (const id of soloMx) if (bloqueDe(id).aplica_tipo_edificacion !== "mixto") e.push(`${criterio.get(id).codigo} solo en mixta sin bloque de edificación mixta`);
        const union = new Set([...ex, ...mx]);
        if (union.size !== nu.size || [...union].some((id) => !nu.has(id))) e.push(`sin dato (${nu.size}) ≠ unión exclusiva ∪ mixta (${union.size})`);
        return { e, info: `exclusiva ${ex.size}, mixta ${mx.size} (−${soloEx.length} +${soloMx.length}), sin dato ${nu.size} = unión` };
      },
    });
  }

  // Telemedicina: 11.2.2 intramural + telemedicina con una categoría y un
  // rol agrega solo bloques de telemedicina de esa categoría/rol (o lo que
  // ellos remiten).
  const base = new Set(resolverCriterios(m, EWAH, HOY).map((x) => x.criterio_id));
  for (const [cat, rol] of [["interactiva", "prestador_referencia"], ["interactiva", "prestador_remisor"], ["telexperticia", "prestador_referencia"]]) {
    casos.push({
      nombre: `EWAH + telemedicina ${cat} / ${rol}`,
      sede: { ...EWAH, servicios: [{ ...EWAH.servicios[0], modalidades: ["intramural", "telemedicina"], telemedicina_categorias: [cat], telemedicina_roles: [rol] }] },
      fecha: HOY,
      verificar(filas) {
        const e = [];
        const ids = new Set(filas.map((f) => f.criterio_id));
        const faltan = [...base].filter((id) => !ids.has(id));
        if (faltan.length) e.push(`agregar telemedicina quitó ${faltan.length} criterios`);
        const nuevos = filas.filter((f) => !base.has(f.criterio_id));
        if (!nuevos.length) e.push("telemedicina no agregó nada");
        for (const f of nuevos) {
          if (f.origen === "remision") continue; // traído por un criterio de telemedicina
          const b = bloqueDe(f.criterio_id);
          const ok = b.aplica_modalidad?.includes("telemedicina") &&
            (!b.aplica_telemedicina_categoria || b.aplica_telemedicina_categoria.includes(cat)) &&
            (!b.aplica_telemedicina_rol || b.aplica_telemedicina_rol.includes(rol));
          if (!ok) e.push(`${criterio.get(f.criterio_id).codigo} entró sin ser de un bloque de telemedicina ${cat}/${rol}`);
        }
        return { e, info: `+${nuevos.length} criterios (${nuevos.filter((f) => f.origen === "remision").length} por remisión)` };
      },
    });
  }

  // Quimioterapia 2022: solo entran de 11.3.7-2019 los remitidos por los
  // criterios 8, 9 y 10 (MD/PP/HC), del mismo estándar.
  casos.push({
    nombre: "Quimioterapia 11.3.7 (2022) alta intramural",
    sede: conServicio({ clave: "11.3.7", complejidad: "alta", modalidades: ["intramural"], telemedicina_categorias: [], telemedicina_roles: [] }),
    fecha: HOY,
    verificar(filas) {
      const e = [];
      const s2019 = m.servicios.find((s) => s.clave === "11.3.7-2019").id;
      const de2019 = filas.filter((f) => f.servicio_norma_id === s2019);
      const total2019 = m.criterios.filter((c) => c.servicio_norma_id === s2019).length;
      if (!de2019.length) e.push("no entró ningún criterio 2019");
      if (de2019.length >= total2019) e.push("entró todo 11.3.7-2019, no solo lo referenciado");
      const origenes = new Set();
      for (const f of de2019) {
        if (f.origen !== "remision") e.push(`${criterio.get(f.criterio_id).codigo} entró como ${f.origen}`);
        // subir por la cadena de remisiones hasta un criterio de 11.3.7 (2022)
        let desde = f.remitido_desde_criterio_id, pasos = 0;
        while (desde && criterio.get(desde).servicio_norma_id === s2019 && pasos++ < 3) {
          desde = filas.find((x) => x.criterio_id === desde)?.remitido_desde_criterio_id;
        }
        const raiz = desde && criterio.get(desde);
        if (!raiz || raiz.servicio_clave !== "11.3.7") e.push(`${criterio.get(f.criterio_id).codigo} sin remisión desde 11.3.7 (2022)`);
        else {
          origenes.add(raiz.codigo);
          if (raiz.estandar_codigo !== f.estandar_codigo) e.push(`${criterio.get(f.criterio_id).codigo} de otro estándar que ${raiz.codigo}`);
        }
      }
      return { e, info: `${de2019.length} de ${total2019} criterios 2019, remitidos desde ${[...origenes].sort().join(", ")}` };
    },
  });

  casos.push({ nombre: "Contexto vacío", sede: { uso_edificacion: null, servicios: [] }, fecha: HOY, verificar: (f) => ({ e: f.length ? [`${f.length} filas (esperado 0)`] : [], info: "0 filas" }) });

  casos.push({
    nombre: "Sede múltiple (11.2.1 baja intra+domiciliaria, 11.3.2 alta telexperticia remisor, 11.6.2 extramural)",
    sede: {
      uso_edificacion: "mixto",
      servicios: [
        { clave: "11.2.1", complejidad: "baja", modalidades: ["intramural", "extramural_domiciliaria"], telemedicina_categorias: [], telemedicina_roles: [] },
        { clave: "11.3.2", complejidad: "alta", modalidades: ["intramural", "telemedicina"], telemedicina_categorias: ["telexperticia"], telemedicina_roles: ["prestador_remisor"] },
        { clave: "11.6.2", complejidad: "baja", modalidades: ["extramural"], telemedicina_categorias: [], telemedicina_roles: [] },
      ],
    },
    fecha: HOY,
    verificar: (f) => ({ e: [], info: `${f.length} criterios` }),
  });

  // Barrido: cada servicio seleccionable × cada complejidad que admite,
  // con todas sus modalidades y toda su telemedicina (ambos roles), y con
  // solo intramural. Solo se exige igualdad con el motor JS.
  for (const s of m.servicios.filter((x) => x.seleccionable)) {
    for (const complejidad of s.complejidades) {
      const todas = {
        clave: s.clave, complejidad, modalidades: s.modalidades,
        telemedicina_categorias: s.modalidades.includes("telemedicina") ? s.telemedicina_categorias : [],
        telemedicina_roles: s.modalidades.includes("telemedicina") ? ["prestador_remisor", "prestador_referencia"] : [],
      };
      casos.push({ nombre: `barrido ${s.clave} ${complejidad} todas`, barrido: true, sede: { uso_edificacion: null, servicios: [todas] }, fecha: HOY, verificar: () => ({ e: [] }) });
      if (s.modalidades.includes("intramural")) {
        casos.push({
          nombre: `barrido ${s.clave} ${complejidad} intramural`, barrido: true,
          sede: conServicio({ clave: s.clave, complejidad, modalidades: ["intramural"], telemedicina_categorias: [], telemedicina_roles: [] }),
          fecha: FECHA_RES_914, verificar: () => ({ e: [] }),
        });
      }
    }
  }
  return casos;
}

// Mismo conjunto de criterio_id y mismo origen por criterio que el motor JS.
export function compararConJs(m, caso, filas) {
  const js = resolverCriterios(m, caso.sede, caso.fecha);
  const jsPorId = new Map(js.map((x) => [x.criterio_id, x]));
  const sqlPorId = new Map(filas.map((x) => [x.criterio_id, x]));
  const e = [];
  if (sqlPorId.size !== filas.length) e.push(`SQL devolvió criterios duplicados (${filas.length} filas, ${sqlPorId.size} distintos)`);
  const cod = (id) => m.criterios.find((c) => c.id === id)?.codigo ?? id;
  const soloSql = [...sqlPorId.keys()].filter((id) => !jsPorId.has(id));
  const soloJs = [...jsPorId.keys()].filter((id) => !sqlPorId.has(id));
  if (soloSql.length) e.push(`solo en SQL (${soloSql.length}): ${soloSql.slice(0, 5).map(cod).join(", ")}`);
  if (soloJs.length) e.push(`solo en JS (${soloJs.length}): ${soloJs.slice(0, 5).map(cod).join(", ")}`);
  const otroOrigen = [...sqlPorId.values()].filter((f) => jsPorId.has(f.criterio_id) && jsPorId.get(f.criterio_id).origen !== f.origen);
  if (otroOrigen.length) e.push(`origen distinto en ${otroOrigen.length}: ${otroOrigen.slice(0, 5).map((f) => cod(f.criterio_id)).join(", ")}`);
  for (const f of filas) {
    const c = m.criterios.find((x) => x.id === f.criterio_id);
    if (c && (c.es_encabezado !== f.es_encabezado || c.remite_a_11_1 !== f.autorresuelto)) { e.push(`banderas distintas en ${c.codigo}`); break; }
  }
  return { e, js: js.length };
}

// Contexto jsonb del núcleo (servicio_norma_id en vez de clave).
export function contextoJsonb(m, sede) {
  const id = new Map(m.servicios.map((s) => [s.clave, s.id]));
  return {
    uso_edificacion: sede.uso_edificacion ?? null,
    servicios: sede.servicios.map(({ clave, ...resto }) => ({ servicio_norma_id: id.get(clave), ...resto })),
  };
}

// ------------------------------------------------------------------
// Ejecución contra la BD enlazada
// ------------------------------------------------------------------
async function main() {
  const WEB = join(RAIZ, "..", "..", "apps", "web");
  const env = Object.fromEntries(
    readFileSync(join(WEB, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
  );
  const { createClient } = createRequire(join(WEB, "package.json"))("@supabase/supabase-js");
  const opciones = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opciones);
  const nuevoCliente = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opciones);

  const m = construirModelo(cargarTodo());
  let fallas = 0;
  const informar = (nombre, e, info, mostrar = true) => {
    if (e.length) { fallas++; console.log(`  ROJO  ${nombre}\n        ${e.join("\n        ")}`); }
    else if (mostrar) console.log(`  OK    ${nombre}${info ? ` — ${info}` : ""}`);
  };

  // Los ids del catálogo en la BD deben ser los del modelo (uuid v5).
  const { count: nServ } = await admin.from("hab_servicios_norma").select("id", { count: "exact", head: true }).in("id", m.servicios.map((s) => s.id));
  if (nServ !== m.servicios.length) throw new Error(`la BD no tiene los ${m.servicios.length} servicios del modelo (tiene ${nServ}); ¿se aplicó 0063?`);

  // 1. Núcleo con fixtures (service role: el núcleo solo lee catálogos)
  console.log("1. Núcleo fn_hab_resolver_criterios vs motor JS");
  const casos = construirCasos(m);
  let barridos = 0, maxMs = 0;
  for (const caso of casos) {
    const t0 = performance.now();
    const { data, error } = await admin.rpc("fn_hab_resolver_criterios", { p_contexto: contextoJsonb(m, caso.sede), p_fecha: caso.fecha });
    const ms = performance.now() - t0;
    maxMs = Math.max(maxMs, ms);
    if (error) { informar(caso.nombre, [`RPC: ${error.message}`]); continue; }
    const cmp = compararConJs(m, caso, data);
    const propio = caso.verificar(data);
    if (caso.barrido) barridos++;
    informar(caso.nombre, [...cmp.e, ...propio.e], `SQL ${data.length} = JS ${cmp.js}${propio.info ? `; ${propio.info}` : ""}`, !caso.barrido);
  }
  console.log(`  ${barridos} casos de barrido comparados con JS; ida y vuelta RPC más lenta ${maxMs.toFixed(0)} ms`);

  // 2. Envoltorio con clínica desechable
  console.log("2. Envoltorio con clínica desechable");
  const creadas = [];
  const crearClinica = async (sufijo) => {
    const email = `f3-motor-${sufijo}-${Date.now()}@example.com`;
    const password = `Prueba-F3-${Math.random().toString(36).slice(2, 10)}!`;
    const { data: u, error: e1 } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (e1) throw e1;
    const reg = { userId: u.user.id, clinicaId: null };
    creadas.push(reg);
    const { data: clinicaId, error: e2 } = await admin.rpc("bootstrap_clinica", {
      p_nombre_clinica: `Clinica Desechable F3 ${sufijo}`, p_nit: `F3-${sufijo}-${Date.now()}`,
      p_admin_id: u.user.id, p_admin_nombre: `Admin F3 ${sufijo}`, p_admin_email: email,
    });
    if (e2) throw e2;
    reg.clinicaId = clinicaId;
    const cli = nuevoCliente();
    const { error: e3 } = await cli.auth.signInWithPassword({ email, password });
    if (e3) throw e3;
    return { ...reg, cli };
  };

  try {
    const a = await crearClinica("A");
    const b = await crearClinica("B");
    const { data: sedes, error: eS } = await admin.from("sedes").insert([
      { clinica_id: a.clinicaId, codigo: "P", nombre: "Sede Principal", orden: 1, uso_edificacion: "exclusivo_salud" },
      { clinica_id: a.clinicaId, codigo: "V", nombre: "Sede Vacía", orden: 2 },
    ]).select("id, codigo");
    if (eS) throw eS;
    const sede = sedes.find((s) => s.codigo === "P").id;
    const vacia = sedes.find((s) => s.codigo === "V").id;
    // Práctica cuyo ÚNICO numeral es 11.2.2 (el trigger de 0062 lo asigna solo).
    const s1122 = m.servicios.find((s) => s.clave === "11.2.2").id;
    const conteo = new Map();
    for (const x of m.mapeo) conteo.set(x.practica_medica_id, (conteo.get(x.practica_medica_id) ?? 0) + 1);
    const practica = m.mapeo.find((x) => x.servicio_norma_id === s1122 && conteo.get(x.practica_medica_id) === 1).practica_medica_id;
    const { data: fila, error: eH } = await admin.from("clinica_servicios_habilitados").insert({
      clinica_id: a.clinicaId, practica_medica_id: practica, sede_id: sede, modalidades: ["intramural"], complejidad: "mediana",
    }).select("servicio_norma_id, complejidad").single();
    if (eH) throw eH;
    informar("trigger asignó 11.2.2", fila.servicio_norma_id === s1122 ? [] : [`servicio_norma_id ${fila.servicio_norma_id}`]);

    const t0 = performance.now();
    const { data: apl, error: eA } = await a.cli.rpc("fn_hab_criterios_aplicables");
    const ms = performance.now() - t0;
    if (eA) throw eA;
    const enSede = apl.filter((x) => x.sede_id === sede);
    const js = new Set(resolverCriterios(m, EWAH, new Date().toISOString().slice(0, 10)).map((x) => x.criterio_id));
    const iguales = enSede.length === js.size && enSede.every((x) => js.has(x.criterio_id));
    informar("A ve su sede (todas las sedes, fecha de hoy)", [
      ...(apl.length === enSede.length ? [] : [`${apl.length - enSede.length} filas de otras sedes (la sede vacía debe dar 0)`]),
      ...(enSede.length === 465 ? [] : [`${enSede.length} criterios (esperado 465)`]),
      ...(iguales ? [] : ["conjunto distinto del motor JS"]),
    ], `${enSede.length} criterios = JS, ${ms.toFixed(0)} ms ida y vuelta`);

    const { data: apl27 } = await a.cli.rpc("fn_hab_criterios_aplicables", { p_sede_id: sede, p_fecha: FECHA_RES_914 });
    informar(`A con p_sede_id y p_fecha ${FECHA_RES_914}`, apl27?.length === 423 ? [] : [`${apl27?.length} (esperado 423)`], "423");

    const aplica = enSede.find((x) => !x.es_encabezado).criterio_id;
    const noAplica = m.criterios.find((c) => !js.has(c.id)).id;
    const r1 = await a.cli.rpc("fn_hab_criterio_aplica", { p_sede_id: sede, p_criterio_id: aplica });
    const r2 = await a.cli.rpc("fn_hab_criterio_aplica", { p_sede_id: sede, p_criterio_id: noAplica });
    const r3 = await a.cli.rpc("fn_hab_criterio_aplica", { p_sede_id: vacia, p_criterio_id: aplica });
    informar("fn_hab_criterio_aplica (sí / no / sede sin servicios)", [
      ...(r1.data === true ? [] : [`aplicable → ${JSON.stringify(r1)}`]),
      ...(r2.data === false ? [] : [`no aplicable → ${JSON.stringify(r2)}`]),
      ...(r3.data === false ? [] : [`sede vacía → ${JSON.stringify(r3)}`]),
    ], "true / false / false");

    const { data: tab, error: eT } = await a.cli.rpc("fn_hab_tablero_criterios", { p_sede_id: sede });
    if (eT) throw eT;
    const clave = (x) => [x.servicio_orden, x.estandar_orden, x.orden];
    const menorIgual = (p, q) => { for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return p[i] < q[i]; return true; };
    const ordenado = tab.every((x, i) => i === 0 || menorIgual(clave(tab[i - 1]), clave(x)));
    const conTexto = tab.every((x) => x.texto_literal && x.codigo && x.estandar_sigla && x.servicio_clave);
    const kb = (JSON.stringify(tab).length / 1024).toFixed(0);
    informar("fn_hab_tablero_criterios", [
      ...(tab.length === 465 ? [] : [`${tab.length} filas (esperado 465)`]),
      ...(conTexto ? [] : ["filas sin texto/estándar/servicio"]),
      ...(ordenado ? [] : ["tablero fuera de orden (servicio, estándar, criterio)"]),
      ...(tab.every((x) => x.estado === null && x.evidencias_activas === null) ? [] : ["columnas de F5 no nulas"]),
    ], `${tab.length} filas, ~${kb} KB, primera ${tab[0]?.codigo}, columnas F5 en null`);

    const { data: deshab } = await admin.from("clinica_servicios_habilitados").update({ estado: "cierre_temporal" }).eq("sede_id", sede).select("id");
    const { data: ct } = await a.cli.rpc("fn_hab_criterios_aplicables", { p_sede_id: sede });
    informar("servicio en cierre temporal: entra con marca", deshab?.length === 1 && ct?.length === 465 && ct.every((x) => x.en_cierre_temporal) ? [] : [`${ct?.length} filas, marca ${ct?.every((x) => x.en_cierre_temporal)}`], "465 con en_cierre_temporal");
    await admin.from("clinica_servicios_habilitados").update({ estado: "cerrado" }).eq("sede_id", sede);
    const { data: cerr } = await a.cli.rpc("fn_hab_criterios_aplicables", { p_sede_id: sede });
    informar("servicio cerrado: no entra", cerr?.length === 0 ? [] : [`${cerr?.length} filas`], "0");
    await admin.from("clinica_servicios_habilitados").update({ estado: "habilitado" }).eq("sede_id", sede);

    // Otra clínica: no ve nada de A, ni pasando el sede_id ajeno.
    const b1 = await b.cli.rpc("fn_hab_criterios_aplicables");
    const b2 = await b.cli.rpc("fn_hab_criterios_aplicables", { p_sede_id: sede });
    const b3 = await b.cli.rpc("fn_hab_criterio_aplica", { p_sede_id: sede, p_criterio_id: aplica });
    const b4 = await b.cli.rpc("fn_hab_tablero_criterios", { p_sede_id: sede });
    informar("usuario de OTRA clínica no ve nada", [
      ...(b1.data?.length === 0 ? [] : [`todas: ${JSON.stringify(b1.error ?? b1.data?.length)}`]),
      ...(b2.data?.length === 0 ? [] : [`sede ajena: ${JSON.stringify(b2.error ?? b2.data?.length)}`]),
      ...(b3.data === false ? [] : [`criterio_aplica: ${JSON.stringify(b3)}`]),
      ...(b4.data?.length === 0 ? [] : [`tablero: ${JSON.stringify(b4.error ?? b4.data?.length)}`]),
    ], "0 / 0 / false / 0");

    const anon = await nuevoCliente().rpc("fn_hab_criterios_aplicables");
    informar("anon sin permiso de ejecución", anon.error ? [] : [`anon recibió ${anon.data?.length} filas`], anon.error?.message);
  } finally {
    for (const { userId, clinicaId } of creadas.reverse()) {
      if (clinicaId) {
        for (const t of ["clinica_servicios_habilitados", "hab_perfil_prestador", "motivos_movimiento_inventario", "sedes", "auditoria", "usuarios", "roles"]) {
          const { error } = await admin.from(t).delete().eq("clinica_id", clinicaId);
          if (error) console.log(`  limpieza ${t}: ${error.message}`);
        }
        const { error } = await admin.from("clinicas").delete().eq("id", clinicaId);
        if (error) console.log(`  limpieza clinicas: ${error.message}`);
      }
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) console.log(`  limpieza usuario: ${error.message}`);
    }
    const ids = creadas.map((c) => c.clinicaId).filter(Boolean);
    const { count } = await admin.from("clinicas").select("id", { count: "exact", head: true }).in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    console.log(`  limpieza: ${creadas.length} usuario(s) y clínica(s) desechables borrados; quedan ${count}`);
  }

  console.log(fallas === 0 ? "\nMotor en verde." : `\n${fallas} caso(s) en rojo.`);
  process.exit(fallas === 0 ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
