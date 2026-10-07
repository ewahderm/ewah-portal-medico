// Detección de CANDIDATOS a remisión. Solo detecta: la clasificación es
// humana y vive en curaduria/ (remisiones.json, remite-11-1.json,
// no-remision.json). Si un candidato queda sin clasificar, la validación 5
// falla y no se escribe el SQL. Así un cambio en el texto de la norma (otra
// versión) obliga a curar de nuevo en vez de autorresolver en silencio.

const normalizar = (t) => t.replace(/\s+/g, " ").trim();

/** Remisión a 11.1: "criterios … de todos los servicios". */
export const RX_REMISION_11_1 = /todos los servicios/i;

/**
 * Remisión a otro servicio, complejidad, modalidad o numeral. Deliberadamente
 * amplio (falsos positivos se descartan a mano en no-remision.json); excluye
 * "lo definido por el prestador / fabricante / licencia", que no remite a
 * otros criterios de la norma.
 */
export const RX_REMISION_OTRA = new RegExp(
  [
    "cumplen? (con )?(los |el |lo )?criterios",
    "adicional (a|al) (lo |los )?(definido|establecido|criterios|cumplimiento)",
    "y (con )?los (de|del) (la |el )?(servicio|modalidad|complejidad|baja|mediana|alta|hospitalizaci)",
    "y los establecidos en",
    "y del servicio de",
    "lo definido (con|en) el numeral",
    "criterios (definidos|establecidos) (para|en|del)",
    "criterios de la complejidad",
    "criterios del servicio",
  ].join("|"),
  "i",
);

export function esCandidato11_1(texto) {
  return RX_REMISION_11_1.test(normalizar(texto));
}

export function esCandidatoOtra(texto) {
  return RX_REMISION_OTRA.test(normalizar(texto));
}
