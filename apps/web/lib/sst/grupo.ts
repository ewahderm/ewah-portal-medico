// Grupo de estándares mínimos del SG-SST (Res. 0312/2019) a partir de las
// dos variables que lo deciden: número de trabajadores y clase de riesgo.
// Puro, sin E/S (docs/sgsst/diseno-tecnico-sgsst.md §3). Los umbrales y los
// comités marcados `porConfirmar` esperan el cotejo con el texto oficial.

export const CLASES_RIESGO = ["I", "II", "III", "IV", "V"] as const;
export type ClaseRiesgo = (typeof CLASES_RIESGO)[number];

export type ModoSst = "empleador" | "independiente";
export type GrupoSst = "independiente" | "7" | "21" | "60" | "sin_calcular";

export type EntradaGrupo = {
  modo: ModoSst;
  dependientes: number;
  contratistas: number;
  sinCategoria: number;
  otros: number;
  excluyeContratistas: boolean;
  codigoActividad: string | null;
  claseClinica: string | null;
  claseCargosMax: string | null;
};

export type FuenteClase = "actividad" | "clinica" | "cargos";

export type Diagnostico = {
  trabajadores: number;
  clase: ClaseRiesgo | null;
  fuenteClase: FuenteClase | null;
  // Fuentes que no coinciden con la clase usada (para avisar).
  clasesDistintas: { fuente: FuenteClase; clase: ClaseRiesgo }[];
  grupo: GrupoSst;
  estandares: 7 | 21 | 60 | null;
  motivo: string;
  comite: { tipo: "vigia" | "copasst" | "ninguno"; representantesPorParte: number };
  convivencia: { requerido: boolean; porConfirmar: boolean };
  responsable: string | null;
};

const ORDEN: Record<ClaseRiesgo, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5 };

export function esClase(v: string | null | undefined): v is ClaseRiesgo {
  return !!v && (CLASES_RIESGO as readonly string[]).includes(v);
}

// Primer dígito del código del Dec. 768/2022 = clase de riesgo.
export function claseDeActividad(codigo: string | null | undefined): ClaseRiesgo | null {
  if (!codigo || !/^[1-5]\d{6}$/.test(codigo)) return null;
  return CLASES_RIESGO[Number(codigo[0]) - 1];
}

export function contarTrabajadores(e: Pick<EntradaGrupo, "dependientes" | "contratistas" | "sinCategoria" | "otros" | "excluyeContratistas">): number {
  return e.dependientes + e.sinCategoria + e.otros + (e.excluyeContratistas ? 0 : e.contratistas);
}

// COPASST: 1 representante por parte de 10 a 49 trabajadores, 2 de 50 a
// 499, 3 de 500 a 999 y 4 desde 1.000; por debajo de 10, vigía.
export function comiteSst(trabajadores: number): Diagnostico["comite"] {
  if (trabajadores <= 0) return { tipo: "ninguno", representantesPorParte: 0 };
  if (trabajadores < 10) return { tipo: "vigia", representantesPorParte: 1 };
  const n = trabajadores < 50 ? 1 : trabajadores < 500 ? 2 : trabajadores < 1000 ? 3 : 4;
  return { tipo: "copasst", representantesPorParte: n };
}

export function diagnosticar(e: EntradaGrupo): Diagnostico {
  const trabajadores = contarTrabajadores(e);

  const candidatas: { fuente: FuenteClase; clase: ClaseRiesgo }[] = [];
  const act = claseDeActividad(e.codigoActividad);
  if (act) candidatas.push({ fuente: "actividad", clase: act });
  if (esClase(e.claseClinica)) candidatas.push({ fuente: "clinica", clase: e.claseClinica });
  if (esClase(e.claseCargosMax)) candidatas.push({ fuente: "cargos", clase: e.claseCargosMax });
  // La mayor: un cargo en clase IV no se esconde detrás de la III de la empresa.
  const elegida = candidatas.reduce<(typeof candidatas)[number] | null>(
    (max, c) => (!max || ORDEN[c.clase] > ORDEN[max.clase] ? c : max),
    null,
  );
  const clase = elegida?.clase ?? null;
  const clasesDistintas = candidatas.filter((c) => c.clase !== clase);

  const comite = comiteSst(trabajadores);
  const convivencia = { requerido: trabajadores > 5, porConfirmar: true };
  const base = { trabajadores, clase, fuenteClase: elegida?.fuente ?? null, clasesDistintas, comite, convivencia };

  if (e.modo === "independiente" && trabajadores === 0) {
    return {
      ...base,
      grupo: "independiente",
      estandares: null,
      motivo: "Trabajas solo: no te aplican los estándares mínimos de la Res. 0312, pero sí la afiliación a la ARL, el autocuidado y lo que te exija quien te contrata.",
      responsable: null,
    };
  }
  if (trabajadores === 0) {
    return {
      ...base,
      grupo: "sin_calcular",
      estandares: null,
      motivo: "No hay trabajadores registrados. Regístralos en RRHH (o indica los que no están ahí) o, si trabajas solo, marca el modo independiente.",
      responsable: null,
    };
  }
  if (!clase) {
    return {
      ...base,
      grupo: "sin_calcular",
      estandares: null,
      motivo: "Falta la clase de riesgo: escribe el código de actividad económica de tu afiliación a la ARL (Dec. 768 de 2022).",
      responsable: null,
    };
  }
  if (ORDEN[clase] >= 4 || trabajadores > 50) {
    return {
      ...base,
      grupo: "60",
      estandares: 60,
      motivo: ORDEN[clase] >= 4 ? `Riesgo ${clase}: con riesgo IV o V aplican los 60 estándares sin importar el tamaño.` : `${trabajadores} trabajadores: más de 50 aplican los 60 estándares.`,
      responsable: "Profesional en SST o especialista con licencia vigente y curso de 50 horas.",
    };
  }
  if (trabajadores > 10) {
    return {
      ...base,
      grupo: "21",
      estandares: 21,
      motivo: `${trabajadores} trabajadores con riesgo ${clase}: de 11 a 50 aplican 21 estándares.`,
      responsable: "Técnico en SST (con al menos 1 año de experiencia), tecnólogo o profesional, con licencia vigente y curso de 50 horas.",
    };
  }
  return {
    ...base,
    grupo: "7",
    estandares: 7,
    motivo: `${trabajadores} trabajador${trabajadores === 1 ? "" : "es"} con riesgo ${clase}: hasta 10 aplican 7 estándares.`,
    responsable: "Técnico, tecnólogo o profesional en SST con licencia vigente y curso de 50 horas.",
  };
}
