import { infoResiduo, type CorrienteResiduo } from "./constantes";

export type PesoPeligrosoMensual =
  | { estado: "medido"; kilogramos: number }
  | { estado: "cero_confirmado"; kilogramos: 0 }
  | { estado: "faltante" };

export type CategoriaGenerador = "micro" | "pequeno" | "mediano" | "grande";

export type PromedioMovilPeligrosos = {
  meses: { mes: string; peso: PesoPeligrosoMensual }[];
  kilogramosMes: number | null;
  categoria: CategoriaGenerador | null;
  mesesFaltantes: string[];
};

export type RegistroPesoResiduo = {
  tipo_residuo: string;
  peso_kg: number | string;
};

export type TotalCorriente = {
  corriente: CorrienteResiduo;
  kilogramos: number;
};

export type TotalesMensualesResiduos = {
  porTipo: { tipo: string; etiqueta: string; corriente: CorrienteResiduo; peligroso: boolean; kilogramos: number }[];
  porCorriente: TotalCorriente[];
  kilogramosTotales: number;
  kilogramosPeligrosos: number;
};

export type FilaReportePgirasa = {
  mes: string;
  tipo_residuo: string | null;
  peso_kg: number | string | null;
  confirmacion_id: string | null;
  confirmado_en: string | null;
  revocada_en: string | null;
  motivo_revocacion: string | null;
};

export type ReportePgirasa = {
  mesEvaluado: string;
  totalesMensuales: TotalesMensualesResiduos;
  promedioPeligrosos: PromedioMovilPeligrosos;
  confirmaciones: {
    id: string;
    mes: string;
    confirmadoEn: string;
    revocadaEn: string | null;
    motivoRevocacion: string | null;
  }[];
};

const MESES = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/;

export function ventanaSeisMeses(mesEvaluado: string): string[] {
  if (!MESES.test(mesEvaluado)) throw new Error("El mes evaluado no tiene el formato AAAA-MM.");

  const [anio, numeroMes] = mesEvaluado.split("-").map(Number);
  return Array.from({ length: 6 }, (_, indice) => {
    const fecha = new Date(Date.UTC(anio, numeroMes - 1 - (5 - indice), 1));
    return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

// Umbrales de la Tabla 2 del Manual PGIRASA (Resolución conjunta 0591 de
// 2024, § 4.1.1.3.1.3; categorías del Decreto 1076 de 2015, art.
// 2.2.6.1.6.2): micro < 10 kg/mes, pequeño 10 a < 100, mediano 100 a
// < 1.000 y grande >= 1.000. Por eso las comparaciones son estrictas: un
// valor exacto de 10, 100 o 1.000 ya pertenece a la categoría siguiente.
// Ver docs/reportes/SPEC-pgirasa-pesos.md.
export function categorizarGenerador(kilogramosMes: number): CategoriaGenerador {
  if (!Number.isFinite(kilogramosMes) || kilogramosMes < 0) {
    throw new Error("El promedio mensual debe ser un número no negativo.");
  }
  if (kilogramosMes < 10) return "micro";
  if (kilogramosMes < 100) return "pequeno";
  if (kilogramosMes < 1000) return "mediano";
  return "grande";
}

export function calcularPromedioMovilPeligrosos(
  mesEvaluado: string,
  pesosPorMes: Readonly<Record<string, PesoPeligrosoMensual | undefined>>,
): PromedioMovilPeligrosos {
  const meses = ventanaSeisMeses(mesEvaluado).map((mes) => {
    const peso = pesosPorMes[mes] ?? { estado: "faltante" as const };
    if (peso.estado === "medido" && (!Number.isFinite(peso.kilogramos) || peso.kilogramos <= 0)) {
      throw new Error(`El peso peligroso medido de ${mes} debe ser mayor que cero.`);
    }
    if (peso.estado === "cero_confirmado" && peso.kilogramos !== 0) {
      throw new Error(`La confirmación de ${mes} debe representar exactamente 0 kg.`);
    }
    return { mes, peso };
  });
  const mesesFaltantes = meses.filter(({ peso }) => peso.estado === "faltante").map(({ mes }) => mes);
  if (mesesFaltantes.length) {
    return { meses, kilogramosMes: null, categoria: null, mesesFaltantes };
  }

  const total = meses.reduce((suma, { peso }) => suma + (peso.estado === "faltante" ? 0 : peso.kilogramos), 0);
  const kilogramosMes = total / 6;
  return {
    meses,
    kilogramosMes,
    categoria: categorizarGenerador(kilogramosMes),
    mesesFaltantes: [],
  };
}

export function calcularTotalesMensualesResiduos(registros: readonly RegistroPesoResiduo[]): TotalesMensualesResiduos {
  const tipos = new Map<string, { etiqueta: string; corriente: CorrienteResiduo; peligroso: boolean; kilogramos: number }>();
  let kilogramosTotales = 0;
  let kilogramosPeligrosos = 0;

  for (const registro of registros) {
    const info = infoResiduo(registro.tipo_residuo);
    const kilogramos = Number(registro.peso_kg);
    if (!info) throw new Error(`Tipo de residuo sin clasificación PGIRASA: ${registro.tipo_residuo}.`);
    if (!Number.isFinite(kilogramos) || kilogramos <= 0) {
      throw new Error(`Peso inválido para el residuo ${registro.tipo_residuo}.`);
    }
    const total = tipos.get(registro.tipo_residuo) ?? {
      etiqueta: info.label,
      corriente: info.corriente,
      peligroso: info.peligroso,
      kilogramos: 0,
    };
    total.kilogramos += kilogramos;
    tipos.set(registro.tipo_residuo, total);
    kilogramosTotales += kilogramos;
    if (info.peligroso) kilogramosPeligrosos += kilogramos;
  }

  const porCorriente = new Map<CorrienteResiduo, number>();
  for (const { corriente, kilogramos } of tipos.values()) {
    porCorriente.set(corriente, (porCorriente.get(corriente) ?? 0) + kilogramos);
  }

  return {
    porTipo: [...tipos.entries()].map(([tipo, total]) => ({ tipo, ...total })),
    porCorriente: [...porCorriente.entries()].map(([corriente, kilogramos]) => ({ corriente, kilogramos })),
    kilogramosTotales,
    kilogramosPeligrosos,
  };
}

export function construirReportePgirasa(mesEvaluado: string, filas: readonly FilaReportePgirasa[]): ReportePgirasa {
  const meses = ventanaSeisMeses(mesEvaluado);
  const pesajes = filas.filter((fila): fila is FilaReportePgirasa & { tipo_residuo: string } => fila.tipo_residuo !== null);
  const ceros = filas.filter((fila): fila is FilaReportePgirasa & { confirmacion_id: string; confirmado_en: string } =>
    fila.confirmacion_id !== null && fila.confirmado_en !== null,
  );
  // Solo existe la entrada de un mes si hubo al menos un pesaje peligroso.
  const peligrososPorMes = new Map<string, number>();
  const cerosVigentes = new Set(ceros.filter((fila) => fila.revocada_en === null).map((fila) => fila.mes.slice(0, 7)));

  for (const fila of pesajes) {
    const mes = fila.mes.slice(0, 7);
    if (!meses.includes(mes)) continue;
    const peso = Number(fila.peso_kg);
    const info = infoResiduo(fila.tipo_residuo);
    if (!Number.isFinite(peso) || peso <= 0 || !info) {
      throw new Error(`Fila de reporte PGIRASA inválida para ${fila.mes}.`);
    }
    if (!info.peligroso) continue;
    peligrososPorMes.set(mes, (peligrososPorMes.get(mes) ?? 0) + peso);
  }

  const pesosPorMes: Record<string, PesoPeligrosoMensual> = {};
  for (const mes of meses) {
    const kilogramosPeligrosos = peligrososPorMes.get(mes);
    const hayCeroVigente = cerosVigentes.has(mes);
    if (kilogramosPeligrosos !== undefined && hayCeroVigente) {
      throw new Error(`El mes ${mes} contiene pesajes peligrosos y una confirmación de cero vigente.`);
    }
    if (kilogramosPeligrosos !== undefined) {
      pesosPorMes[mes] = { estado: "medido", kilogramos: kilogramosPeligrosos };
    } else if (hayCeroVigente) {
      pesosPorMes[mes] = { estado: "cero_confirmado", kilogramos: 0 };
    } else {
      pesosPorMes[mes] = { estado: "faltante" };
    }
  }

  const totalesDelMes = pesajes
    .filter((fila) => fila.mes === `${mesEvaluado}-01` || fila.mes === mesEvaluado)
    .map((fila) => {
      if (fila.peso_kg === null) throw new Error(`Falta el peso de una categoría del mes ${mesEvaluado}.`);
      return { tipo_residuo: fila.tipo_residuo, peso_kg: fila.peso_kg };
    });

  return {
    mesEvaluado,
    totalesMensuales: calcularTotalesMensualesResiduos(totalesDelMes),
    promedioPeligrosos: calcularPromedioMovilPeligrosos(mesEvaluado, pesosPorMes),
    confirmaciones: ceros
      .filter((fila) => meses.includes(fila.mes.slice(0, 7)))
      .map((fila) => ({
        id: fila.confirmacion_id,
        mes: fila.mes.slice(0, 7),
        confirmadoEn: fila.confirmado_en,
        revocadaEn: fila.revocada_en,
        motivoRevocacion: fila.motivo_revocacion,
      })),
  };
}
