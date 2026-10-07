// Asistente de grupo Supersalud (HU-1.2). Puro: sin E/S. Los umbrales son
// DATOS en constantes.ts (UMBRALES_GRUPO_SUPERSALUD) con su cita; aquí solo
// se decide con ellos. El sistema SUGIERE; lo que se guarda es lo que el
// usuario confirma.

import {
  UMBRALES_GRUPO_SUPERSALUD,
  type GrupoSupersalud,
} from "@/lib/habilitacion/constantes";
import type { RespuestasGrupo } from "@/lib/habilitacion/tipos";

export type SugerenciaGrupo = {
  grupo: GrupoSupersalud;
  motivos: string[];
};

const fmt = (n: number) => new Intl.NumberFormat("es-CO").format(n);

export function sugerirGrupoSupersalud(r: RespuestasGrupo): SugerenciaGrupo {
  if (r.nitEsEapb) {
    return { grupo: "B", motivos: ["Tu NIT es el mismo de una EPS o entidad administradora de planes de beneficios."] };
  }

  const privadaOMixta = r.naturaleza === "privada" || r.naturaleza === "mixta";
  const publica = r.naturaleza === "publica";

  for (const u of UMBRALES_GRUPO_SUPERSALUD) {
    const motivos: string[] = [];
    if ((r.activosUvt ?? 0) > u.activosUvt) motivos.push(`Activos de más de ${fmt(u.activosUvt)} UVT.`);
    if ((r.ingresosUvt ?? 0) > u.ingresosUvt) motivos.push(`Ingresos de más de ${fmt(u.ingresosUvt)} UVT.`);
    if ((r.patrimonioUvt ?? 0) > u.patrimonioUvt) motivos.push(`Patrimonio de más de ${fmt(u.patrimonioUvt)} UVT.`);
    if (u.niifGrupo && privadaOMixta && r.niifGrupo === u.niifGrupo) {
      motivos.push(`Aplicas NIIF Grupo ${u.niifGrupo}.`);
    }
    if (u.nivelPublica && publica && r.nivelPublica === u.nivelPublica) {
      motivos.push(`Eres una IPS pública de nivel ${u.nivelPublica}.`);
    }
    if ((r.serviciosAlta ?? 0) > u.serviciosAlta) motivos.push(`Más de ${u.serviciosAlta} servicios de alta complejidad.`);
    if ((r.serviciosMediana ?? 0) > u.serviciosMediana) motivos.push(`Más de ${u.serviciosMediana} servicios de mediana complejidad.`);
    if ((r.intramuralesHospitalarios ?? 0) > u.intramuralesHospitalarios) {
      motivos.push(`Más de ${u.intramuralesHospitalarios} servicios intramurales hospitalarios.`);
    }
    if (motivos.length > 0) return { grupo: u.grupo, motivos };
  }

  return {
    grupo: "D3",
    motivos: ["No cumples ninguna característica de los grupos B, C1, C2, D1 ni D2 (D3 es el grupo residual)."],
  };
}

// Convierte una cifra escrita en pesos colombianos ("1.234.567,89",
// "$ 1 234 567", "1234567") a número entero de pesos. No usa parseFloat
// sobre el texto crudo: el punto es separador de miles en es-CO (gotcha ya
// visto en la importación del legado). Los decimales se descartan.
export function parsePesos(texto: string | null | undefined): number | null {
  if (!texto) return null;
  const sinDecimales = texto.split(",")[0];
  const digitos = sinDecimales.replace(/\D/g, "");
  if (!digitos) return null;
  const n = Number(digitos);
  return Number.isFinite(n) ? n : null;
}

export function pesosAUvt(pesos: number | null, uvt: number | null): number | null {
  if (pesos === null || !uvt || uvt <= 0) return null;
  return Math.round(pesos / uvt);
}
