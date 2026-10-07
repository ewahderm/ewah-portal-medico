// Estado de la "Ruta de habilitación" (6 pasos, §5.6) y helpers de fecha.
// Puro: recibe lo ya leído de la BD y decide presentación. Sin E/S.

import {
  PASOS_RUTA,
  UMBRALES_VENCIMIENTO_REPS,
  type ClavePaso,
} from "@/lib/habilitacion/constantes";
import type { Indicadores } from "@/lib/habilitacion/estado-criterio";
import type { PerfilPrestador, SedeConServicios, ServicioSede } from "@/lib/habilitacion/tipos";

export type EstadoPaso =
  | "pendiente"
  | "en_curso"
  | "completo"
  | "alerta"
  | "bloqueado"
  | "requiere_pro"
  | "proximamente"
  | "actual";

export type PasoRuta = {
  numero: number;
  clave: ClavePaso;
  titulo: string;
  pregunta: string;
  href: string | null;
  estado: EstadoPaso;
  detalle: string;
};

export function perfilCompleto(perfil: Pick<PerfilPrestador, "tipo_prestador" | "estado_reps" | "fecha_vencimiento_reps"> | null) {
  if (!perfil?.tipo_prestador) return false;
  if (perfil.estado_reps === "inscrito" && !perfil.fecha_vencimiento_reps) return false;
  return true;
}

// Un servicio está listo para el motor de criterios cuando tiene sede,
// numeral de la norma, complejidad y al menos una modalidad (§5.6 paso 2).
export function servicioCompleto(s: Pick<ServicioSede, "sede_id" | "servicio_norma_id" | "complejidad" | "modalidades">) {
  return !!s.sede_id && !!s.servicio_norma_id && !!s.complejidad && s.modalidades.length > 0;
}

// Qué le falta a un servicio, en palabras del usuario (o null si nada).
export function faltanteServicio(
  s: Pick<ServicioSede, "sede_id" | "servicio_norma_id" | "complejidad" | "modalidades" | "telemedicina_categorias" | "telemedicina_roles">,
): string | null {
  if (!s.sede_id) return "Asigna una sede";
  if (!s.servicio_norma_id) return "Elige el numeral de la norma";
  if (!s.complejidad) return "Elige la complejidad";
  if (s.modalidades.length === 0) return "Marca al menos una modalidad";
  if (s.modalidades.includes("telemedicina") && (s.telemedicina_categorias.length === 0 || s.telemedicina_roles.length === 0)) {
    return "Completa la categoría y el rol de telemedicina";
  }
  return null;
}

export function calcularRuta({
  perfil,
  sedes,
  serviciosSinSede,
  gestion,
  autoevaluacion = null,
}: {
  perfil: Pick<PerfilPrestador, "tipo_prestador" | "estado_reps" | "fecha_vencimiento_reps"> | null;
  sedes: Pick<SedeConServicios, "uso_edificacion" | "servicios">[];
  serviciosSinSede: number;
  gestion: boolean;
  // Indicadores de todas las sedes (fn_hab_progreso_autoevaluacion); null =
  // sin plan o la migración 0066 todavía no está aplicada.
  autoevaluacion?: Pick<Indicadores, "evaluables" | "evaluados" | "noCumple" | "porcentajeCumplimiento"> | null;
}): PasoRuta[] {
  const perfilOk = perfilCompleto(perfil);
  const servicios = sedes.flatMap((s) => s.servicios);
  const totalServicios = servicios.length + serviciosSinSede;
  const incompletos = servicios.filter((s) => faltanteServicio(s) !== null).length + serviciosSinSede;
  const sedesSinEdificacion = sedes.filter((s) => s.servicios.length > 0 && !s.uso_edificacion).length;

  return PASOS_RUTA.map((p): PasoRuta => {
    const base = { numero: p.numero, clave: p.clave, titulo: p.titulo, pregunta: p.pregunta, href: p.href };
    switch (p.clave) {
      case "perfil":
        if (perfilOk) return { ...base, estado: "completo", detalle: "Tipo de prestador y situación REPS registrados." };
        if (perfil?.tipo_prestador) {
          return { ...base, estado: "en_curso", detalle: "Falta la fecha de vencimiento de tu inscripción REPS." };
        }
        return { ...base, estado: "pendiente", detalle: "Empieza aquí: cuéntanos qué tipo de prestador eres." };
      case "sedes":
        if (!perfilOk) return { ...base, estado: "bloqueado", detalle: "Primero completa tu perfil." };
        if (!gestion) return { ...base, estado: "requiere_pro", detalle: "Disponible en el plan Pro." };
        if (totalServicios === 0) return { ...base, estado: "pendiente", detalle: "Declara los servicios que prestas en cada sede." };
        if (incompletos > 0) {
          return {
            ...base,
            estado: "en_curso",
            detalle: `${incompletos} de ${totalServicios} servicio${totalServicios === 1 ? "" : "s"} por completar.`,
          };
        }
        if (sedesSinEdificacion > 0) {
          return {
            ...base,
            estado: "alerta",
            detalle: `${sedesSinEdificacion} sede${sedesSinEdificacion === 1 ? "" : "s"} sin tipo de edificación.`,
          };
        }
        return { ...base, estado: "completo", detalle: `${totalServicios} servicio${totalServicios === 1 ? "" : "s"} declarado${totalServicios === 1 ? "" : "s"}.` };
      case "autoevaluacion": {
        if (!perfilOk) return { ...base, estado: "bloqueado", detalle: "Primero completa tu perfil." };
        if (!gestion) return { ...base, estado: "requiere_pro", detalle: "Disponible en el plan Pro." };
        const a = autoevaluacion;
        if (!a) return { ...base, estado: "proximamente", detalle: "Disponible pronto." };
        if (a.evaluables === 0) return { ...base, estado: "bloqueado", detalle: "Primero declara los servicios de cada sede." };
        const avance = `${a.evaluados} de ${a.evaluables} criterios evaluados`;
        if (a.noCumple > 0) {
          return { ...base, estado: "alerta", detalle: `${a.noCumple} no cumple${a.noCumple === 1 ? "" : "n"} · ${avance}.` };
        }
        if (a.evaluados === a.evaluables) {
          return {
            ...base,
            estado: "completo",
            detalle: `Todo evaluado${a.porcentajeCumplimiento !== null ? ` · ${a.porcentajeCumplimiento} % de cumplimiento` : ""}.`,
          };
        }
        return { ...base, estado: a.evaluados > 0 ? "en_curso" : "pendiente", detalle: `${avance}.` };
      }
      case "tablero":
        return { ...base, estado: "actual", detalle: "Estás aquí." };
      default:
        return { ...base, estado: "proximamente", detalle: "Próximamente." };
    }
  });
}

// Días entre hoy y una fecha "YYYY-MM-DD" sin pasar por new Date(texto)
// (que la interpreta como medianoche UTC y corre el día en Colombia).
export function diasHasta(fecha: string, hoy: string): number {
  const aUtc = (f: string) => {
    const [a, m, d] = f.slice(0, 10).split("-").map(Number);
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((aUtc(fecha) - aUtc(hoy)) / 86_400_000);
}

export type NivelVencimiento = "rojo" | "ambar" | "verde";

export function nivelVencimientoReps(dias: number): NivelVencimiento {
  if (dias <= UMBRALES_VENCIMIENTO_REPS.rojo) return "rojo";
  if (dias <= UMBRALES_VENCIMIENTO_REPS.ambar) return "ambar";
  return "verde";
}

// Sugerencia de vencimiento (HU-1.3 AC1): inscripción inicial + 4 años. Es
// solo una ayuda: manda la fecha que el usuario copia del REPS.
export function sugerirVencimientoReps(fechaInscripcion: string): string {
  const [a, m, d] = fechaInscripcion.slice(0, 10).split("-");
  const anio = Number(a) + 4;
  // 29-feb + 4 años siempre existe (bisiesto cada 4), salvo años seculares;
  // se recorta al último día del mes si no existe.
  const ultimoDia = new Date(Date.UTC(anio, Number(m), 0)).getUTCDate();
  const dia = Math.min(Number(d), ultimoDia);
  return `${anio}-${m}-${String(dia).padStart(2, "0")}`;
}

// "2026-10-06" + 30 → "2026-11-05", sin zona horaria.
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

// "2026-10-06" → "6 oct 2026" sin zona horaria.
export function fechaLegible(fecha: string | null | undefined): string {
  if (!fecha) return "";
  const [a, m, d] = fecha.slice(0, 10).split("-").map(Number);
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d} ${meses[m - 1]} ${a}`;
}
