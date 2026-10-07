// Contrato TS de fn_reportes_analitica_clinica (migración 0084). La BD
// devuelve una sola tabla "larga" (una fila por dimensión y grupo) para no
// hacer seis viajes; aquí se valida y se reparte en las piezas que dibuja el
// tablero. Si una cifra llega mal se lanza error en vez de pintar un cero
// inventado: un reporte que miente es peor que uno que no carga.

export type DimensionAnalitica = "resumen" | "mes" | "tratamiento" | "profesional" | "medio_pago" | "pais";

// Claves que la BD usa para los grupos "sin dato" (paciente sin país,
// tratamiento sin profesional...). Se mantienen como grupo explícito para
// que la suma de las listas cuadre con el resumen.
export const CLAVE_SIN_PAIS = "__sin_pais__";

export type FilaAnalitica = {
  dimension: DimensionAnalitica;
  periodo: string | null;
  // id del tipo/profesional/medio de pago, ISO del país, "AAAA-MM" del mes,
  // o una clave "__sin_...__" para el grupo sin dato.
  clave: string | null;
  nombre: string;
  pais_iso: string | null;
  cantidad: number | string;
  cantidad_con_valor: number | string;
  valor_registrado: number | string;
};

export type ValorPorGrupo = {
  clave: string | null;
  nombre: string;
  cantidad: number;
  cantidadConValor: number;
  valorRegistrado: number;
};

export type AnaliticaClinica = {
  resumen: { cantidad: number; cantidadConValor: number; valorRegistrado: number };
  tendencia: { mes: string; cantidad: number; cantidadConValor: number; valorRegistrado: number }[];
  tratamientos: ValorPorGrupo[];
  profesionales: ValorPorGrupo[];
  mediosPago: ValorPorGrupo[];
  paises: (ValorPorGrupo & { codigoIso: string | null })[];
};

// Días máximos de un reporte, contando el primero y el último (10 años). Debe
// coincidir con el límite de fn_reportes_analitica_clinica (0088): la tendencia
// agrupa por mes, así que el costo no crece con los años.
export const MAX_DIAS_REPORTE = 3653;
export const TEXTO_RANGO_INVALIDO = "Elige un rango de fechas válido, de hasta 10 años.";

export function esRangoFechaValido(desde: string, hasta: string): boolean {
  const fechaValida = (valor: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
    const fecha = new Date(`${valor}T00:00:00.000Z`);
    return Number.isFinite(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor
      ? fecha.getTime()
      : null;
  };
  const inicio = fechaValida(desde);
  const fin = fechaValida(hasta);
  return inicio !== null && fin !== null && inicio <= fin && fin - inicio <= (MAX_DIAS_REPORTE - 1) * 24 * 60 * 60 * 1000;
}

function numeroValido(valor: number | string, campo: string, permitirNegativo = false): number {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || (!permitirNegativo && numero < 0)) {
    throw new Error(`Valor agregado inválido en ${campo}.`);
  }
  return numero;
}

function grupo(fila: FilaAnalitica): ValorPorGrupo {
  return {
    clave: fila.clave,
    nombre: fila.nombre,
    cantidad: numeroValido(fila.cantidad, "cantidad"),
    cantidadConValor: numeroValido(fila.cantidad_con_valor, "cantidad con valor"),
    valorRegistrado: numeroValido(fila.valor_registrado, "valor registrado", true),
  };
}

function ordenarGrupos<T extends ValorPorGrupo>(grupos: T[]): T[] {
  return grupos.sort((a, b) => b.cantidad - a.cantidad || b.valorRegistrado - a.valorRegistrado || a.nombre.localeCompare(b.nombre, "es"));
}

export function construirAnaliticaClinica(filas: readonly FilaAnalitica[]): AnaliticaClinica {
  const resumenes = filas.filter((fila) => fila.dimension === "resumen");
  if (resumenes.length !== 1) throw new Error("El reporte debe contener exactamente un resumen del periodo.");
  const resumen = grupo(resumenes[0]);

  const tendencia = filas
    .filter((fila) => fila.dimension === "mes")
    .map((fila) => {
      if (!fila.periodo) throw new Error("Falta el mes de una fila de tendencia.");
      const total = grupo(fila);
      return {
        mes: fila.periodo.slice(0, 7),
        cantidad: total.cantidad,
        cantidadConValor: total.cantidadConValor,
        valorRegistrado: total.valorRegistrado,
      };
    })
    .sort((a, b) => a.mes.localeCompare(b.mes));

  const grupos = (dimension: DimensionAnalitica) =>
    ordenarGrupos(filas.filter((fila) => fila.dimension === dimension).map(grupo));

  const paises = ordenarGrupos(
    filas
      .filter((fila) => fila.dimension === "pais")
      .map((fila) => ({ ...grupo(fila), codigoIso: fila.pais_iso })),
  );

  return {
    resumen: {
      cantidad: resumen.cantidad,
      cantidadConValor: resumen.cantidadConValor,
      valorRegistrado: resumen.valorRegistrado,
    },
    tendencia,
    tratamientos: grupos("tratamiento"),
    profesionales: grupos("profesional"),
    mediosPago: grupos("medio_pago"),
    paises,
  };
}
