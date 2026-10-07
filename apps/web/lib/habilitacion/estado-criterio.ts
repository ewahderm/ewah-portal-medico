// Estado derivado de criterios e indicadores de la autoevaluación (§3.3,
// requerimiento §6). Puro: trabaja sobre lo que devuelven
// fn_hab_tablero_criterios / fn_hab_progreso_autoevaluacion; el motor de
// aplicabilidad sigue siendo uno solo (SQL). Sin E/S.

import type { EstadoEvaluacion } from "@/lib/habilitacion/constantes";
import type { FilaCriterio, FilaProgreso } from "@/lib/habilitacion/tipos";
import { normalizarBusqueda } from "@/lib/texto";

type FilaEstado = Pick<
  FilaCriterio,
  "criterio_id" | "padre_id" | "es_encabezado" | "autorresuelto" | "estado" | "servicio_clave" | "estandar_codigo"
>;

export type EstadoDerivado = {
  estado: EstadoEvaluacion;
  // De dónde sale: evaluado a mano, de sus hijos ("Cuenta con:") o de 11.1.
  fuente: "directo" | "hijos" | "11.1";
  cumplen?: number;
  total?: number;
};

export function esEvaluable(f: Pick<FilaCriterio, "es_encabezado" | "autorresuelto">) {
  return !f.es_encabezado && !f.autorresuelto;
}

// Agregado de un conjunto de estados (hijos de un encabezado, o los
// criterios de 11.1 del mismo estándar para un autorresuelto). La norma no
// admite cumplimiento parcial: un solo "No cumple" hace No cumple; con algo
// pendiente queda Pendiente; todo No aplica = No aplica.
export function agregarEstados(estados: EstadoEvaluacion[]): EstadoEvaluacion {
  if (estados.length === 0) return "pendiente";
  if (estados.includes("no_cumple")) return "no_cumple";
  if (estados.includes("pendiente")) return "pendiente";
  if (estados.every((e) => e === "no_aplica")) return "no_aplica";
  return "cumple";
}

// Estado que se MUESTRA de cada fila, por criterio_id. Los encabezados se
// resuelven de abajo hacia arriba (un hijo puede ser a su vez encabezado);
// los autorresueltos toman el agregado de los criterios de 11.1 del mismo
// estándar en la sede (HU-4.2 AC6).
export function derivarEstados(filas: FilaEstado[]): Map<string, EstadoDerivado> {
  const hijos = new Map<string, FilaEstado[]>();
  for (const f of filas) {
    if (!f.padre_id) continue;
    const lista = hijos.get(f.padre_id) ?? [];
    lista.push(f);
    hijos.set(f.padre_id, lista);
  }

  const directo = (f: FilaEstado): EstadoEvaluacion => f.estado ?? "pendiente";

  // Primero el agregado de 11.1 por estándar (solo evaluables, igual que el
  // indicador): no depende de ningún otro estado derivado.
  const de111 = new Map<string, EstadoEvaluacion[]>();
  for (const f of filas) {
    if (f.servicio_clave !== "11.1" || !esEvaluable(f)) continue;
    const lista = de111.get(f.estandar_codigo) ?? [];
    lista.push(directo(f));
    de111.set(f.estandar_codigo, lista);
  }

  const resultado = new Map<string, EstadoDerivado>();
  const visitando = new Set<string>();

  const resolver = (f: FilaEstado): EstadoDerivado => {
    const previo = resultado.get(f.criterio_id);
    if (previo) return previo;
    let r: EstadoDerivado;
    if (f.es_encabezado) {
      // `visitando` corta un ciclo de padres mal sembrado en vez de colgar.
      visitando.add(f.criterio_id);
      const propios = (hijos.get(f.criterio_id) ?? [])
        .filter((h) => !visitando.has(h.criterio_id))
        .map((h) => resolver(h).estado);
      visitando.delete(f.criterio_id);
      r = {
        estado: agregarEstados(propios),
        fuente: "hijos",
        cumplen: propios.filter((e) => e === "cumple").length,
        total: propios.length,
      };
    } else if (f.autorresuelto) {
      const estados = de111.get(f.estandar_codigo) ?? [];
      r = {
        estado: agregarEstados(estados),
        fuente: "11.1",
        cumplen: estados.filter((e) => e === "cumple").length,
        total: estados.length,
      };
    } else {
      r = { estado: directo(f), fuente: "directo" };
    }
    resultado.set(f.criterio_id, r);
    return r;
  };

  for (const f of filas) resolver(f);
  return resultado;
}

// ============================================================
// Indicadores (requerimiento §6): % cumplimiento = Cumple / (Cumple + No
// cumple + Pendiente). "No aplica" sale del denominador. Encabezados y
// autorresueltos no cuentan (cada criterio evaluable una sola vez).
// ============================================================
export type Indicadores = {
  evaluables: number;
  cumple: number;
  noCumple: number;
  noAplica: number;
  pendientes: number;
  evaluados: number;
  // null = no calculable (todo No aplica o nada evaluable).
  porcentajeCumplimiento: number | null;
  porcentajeAvance: number | null;
};

function armarIndicadores(cumple: number, noCumple: number, noAplica: number, pendientes: number): Indicadores {
  const evaluables = cumple + noCumple + noAplica + pendientes;
  const evaluados = cumple + noCumple + noAplica;
  const denominador = cumple + noCumple + pendientes;
  return {
    evaluables,
    cumple,
    noCumple,
    noAplica,
    pendientes,
    evaluados,
    porcentajeCumplimiento: denominador === 0 ? null : Math.round((cumple / denominador) * 100),
    porcentajeAvance: evaluables === 0 ? null : Math.round((evaluados / evaluables) * 100),
  };
}

export function indicadoresDeFilas(filas: Pick<FilaCriterio, "es_encabezado" | "autorresuelto" | "estado">[]): Indicadores {
  let cumple = 0;
  let noCumple = 0;
  let noAplica = 0;
  let pendientes = 0;
  for (const f of filas) {
    if (!esEvaluable(f)) continue;
    if (f.estado === "cumple") cumple++;
    else if (f.estado === "no_cumple") noCumple++;
    else if (f.estado === "no_aplica") noAplica++;
    else pendientes++;
  }
  return armarIndicadores(cumple, noCumple, noAplica, pendientes);
}

export function indicadoresDeProgreso(filas: Pick<FilaProgreso, "cumple" | "no_cumple" | "no_aplica" | "sin_evaluar">[]): Indicadores {
  const suma = (k: "cumple" | "no_cumple" | "no_aplica" | "sin_evaluar") => filas.reduce((n, f) => n + f[k], 0);
  return armarIndicadores(suma("cumple"), suma("no_cumple"), suma("no_aplica"), suma("sin_evaluar"));
}

// ============================================================
// Filtros de la pantalla (§5.5): en cliente, instantáneos.
// ============================================================
export type FiltroEstado = "todos" | EstadoEvaluacion;

export type Filtros = {
  estado: FiltroEstado;
  servicio: string | null; // servicio_clave
  texto: string;
  asignadosA: string | null; // usuario id ("asignados a mí")
  reverificar: boolean;
};

export const FILTROS_VACIOS: Filtros = { estado: "todos", servicio: null, texto: "", asignadosA: null, reverificar: false };

type FilaFiltro = FilaEstado &
  Pick<FilaCriterio, "codigo" | "texto_literal" | "responsable_id" | "reverificar">;

// Devuelve los criterio_id visibles. Un encabezado se ve si alguno de sus
// descendientes se ve (da el contexto "Cuenta con:"); los autorresueltos se
// filtran por su estado derivado y no entran en "asignados" ni
// "re-verificar" (no se evalúan a mano).
export function filtrarCriterios(
  filas: FilaFiltro[],
  filtros: Filtros,
  estados: Map<string, EstadoDerivado>,
): Set<string> {
  const termino = normalizarBusqueda(filtros.texto.trim());
  const visibles = new Set<string>();
  const porId = new Map(filas.map((f) => [f.criterio_id, f]));

  for (const f of filas) {
    if (f.es_encabezado) continue;
    if (filtros.servicio && f.servicio_clave !== filtros.servicio) continue;
    const estado = estados.get(f.criterio_id)?.estado ?? f.estado ?? "pendiente";
    if (filtros.estado !== "todos" && estado !== filtros.estado) continue;
    if (f.autorresuelto && (filtros.asignadosA || filtros.reverificar)) continue;
    if (filtros.asignadosA && f.responsable_id !== filtros.asignadosA) continue;
    if (filtros.reverificar && !f.reverificar) continue;
    if (termino && !normalizarBusqueda(`${f.codigo} ${f.texto_literal}`).includes(termino)) continue;
    visibles.add(f.criterio_id);
    // Sube por la cadena de padres para mostrar el contexto.
    let padre = f.padre_id ? porId.get(f.padre_id) : undefined;
    while (padre && !visibles.has(padre.criterio_id)) {
      visibles.add(padre.criterio_id);
      padre = padre.padre_id ? porId.get(padre.padre_id) : undefined;
    }
  }
  return visibles;
}

// Grupos por servicio de la norma en el orden de la norma (11.1 primero).
export function agruparPorServicio<T extends Pick<FilaCriterio, "servicio_clave" | "servicio_nombre" | "servicio_orden">>(
  filas: T[],
): { clave: string; nombre: string; filas: T[] }[] {
  const grupos = new Map<string, { clave: string; nombre: string; orden: number; filas: T[] }>();
  for (const f of filas) {
    const g = grupos.get(f.servicio_clave) ?? { clave: f.servicio_clave, nombre: f.servicio_nombre, orden: f.servicio_orden, filas: [] };
    g.filas.push(f);
    grupos.set(f.servicio_clave, g);
  }
  return [...grupos.values()]
    .sort((a, b) => a.orden - b.orden)
    .map(({ clave, nombre, filas: lista }) => ({ clave, nombre, filas: lista }));
}
