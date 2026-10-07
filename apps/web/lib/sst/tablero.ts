// Tablero de pendientes del SG-SST (F8): lo que vence o ya venció, del más
// urgente al menos. Lógica pura (sin "use server"); las lecturas viven en
// consultas.ts. Mismos plazos que las alertas del cron (0079).

import { diasHasta, fechaLegible } from "@/lib/habilitacion/ruta";

export type Tono = "rojo" | "ambar" | "info";

export type Pendiente = { clave: string; titulo: string; detalle: string; href: string; tono: Tono; orden: number };

export type InsumosTablero = {
  hoy: string;
  gestion: boolean;
  modo: "empleador" | "independiente";
  eventos: {
    id: string;
    fecha: string;
    tipo_evento: "incidente" | "accidente" | "enfermedad_laboral";
    reportado_arl: boolean;
    fecha_limite_reporte: string | null;
    fecha_limite_investigacion: string | null;
    investigacion_cerrada: boolean;
  }[];
  acciones: { fecha_compromiso: string; estado: string }[];
  examenes: { nombre: string; proximo_examen: string | null }[];
  planPendientes: { anio: number; mes: number }[];
  autoevaluacionAnio: { estado: "abierta" | "cerrada" } | null;
  licenciaVence: string | null;
  comites: { tipo: "vigia" | "copasst" | "convivencia"; fecha_fin: string }[];
  registroAnual: { fecha: string } | null;
};

const plural = (n: number, s: string, p = `${s}s`) => `${n} ${n === 1 ? s : p}`;

function cuandoVence(dias: number): string {
  if (dias < 0) return `venció hace ${plural(-dias, "día")}`;
  if (dias === 0) return "vence hoy";
  return `vence en ${plural(dias, "día")}`;
}

function tonoDe(dias: number, ambar = 30): Tono {
  return dias <= 7 ? "rojo" : dias <= ambar ? "ambar" : "info";
}

export function pendientesSst(x: InsumosTablero): Pendiente[] {
  const r: Pendiente[] = [];
  const anio = Number(x.hoy.slice(0, 4));
  const mes = Number(x.hoy.slice(5, 7));

  for (const e of x.eventos) {
    if (e.tipo_evento !== "incidente" && !e.reportado_arl && e.fecha_limite_reporte) {
      const d = diasHasta(e.fecha_limite_reporte, x.hoy);
      r.push({
        clave: `reporte-${e.id}`,
        titulo: e.tipo_evento === "enfermedad_laboral" ? "Reportar la enfermedad laboral a la ARL y la EPS" : "Reportar el accidente a la ARL y la EPS",
        detalle: `Evento del ${fechaLegible(e.fecha)} · ${cuandoVence(d)} (2 días hábiles)`,
        href: `/sst/eventos/${e.id}`,
        tono: "rojo",
        orden: d,
      });
    }
    if (!e.investigacion_cerrada && e.fecha_limite_investigacion) {
      const d = diasHasta(e.fecha_limite_investigacion, x.hoy);
      r.push({
        clave: `investigacion-${e.id}`,
        titulo: "Terminar la investigación",
        detalle: `Evento del ${fechaLegible(e.fecha)} · ${cuandoVence(d)} (15 días)`,
        href: `/sst/eventos/${e.id}`,
        tono: tonoDe(d, 15),
        orden: d,
      });
    }
  }

  if (!x.gestion) return ordenar(r);

  const abiertas = x.acciones.filter((a) => a.estado !== "cerrada");
  const vencidas = abiertas.filter((a) => diasHasta(a.fecha_compromiso, x.hoy) < 0).length;
  const proximas = abiertas.filter((a) => {
    const d = diasHasta(a.fecha_compromiso, x.hoy);
    return d >= 0 && d <= 7;
  }).length;
  if (vencidas + proximas > 0) {
    r.push({
      clave: "acciones",
      titulo: "Acciones del plan",
      detalle: [vencidas ? `${plural(vencidas, "vencida")}` : null, proximas ? `${plural(proximas, "vence", "vencen")} esta semana` : null].filter(Boolean).join(" · "),
      href: "/sst/eventos",
      tono: vencidas ? "rojo" : "ambar",
      orden: vencidas ? -1 : 7,
    });
  }

  const examenesVencidos = x.examenes.filter((p) => p.proximo_examen && diasHasta(p.proximo_examen, x.hoy) < 0);
  const examenesProximos = x.examenes.filter((p) => p.proximo_examen && diasHasta(p.proximo_examen, x.hoy) >= 0 && diasHasta(p.proximo_examen, x.hoy) <= 30);
  if (examenesVencidos.length + examenesProximos.length > 0) {
    const nombres = [...examenesVencidos, ...examenesProximos].slice(0, 3).map((p) => p.nombre).join(", ");
    r.push({
      clave: "examenes",
      titulo: "Exámenes médicos periódicos",
      detalle: [
        examenesVencidos.length ? `${plural(examenesVencidos.length, "vencido")}` : null,
        examenesProximos.length ? `${plural(examenesProximos.length, "próximo")} (30 días)` : null,
        nombres,
      ]
        .filter(Boolean)
        .join(" · "),
      href: "/sst/personas",
      tono: examenesVencidos.length ? "rojo" : "ambar",
      orden: examenesVencidos.length ? -1 : 30,
    });
  }

  const atrasadas = x.planPendientes.filter((p) => p.anio < anio || (p.anio === anio && p.mes < mes)).length;
  if (atrasadas > 0) {
    r.push({
      clave: "plan",
      titulo: "Actividades del plan anual sin ejecutar",
      detalle: `${plural(atrasadas, "actividad", "actividades")} de meses pasados`,
      href: "/sst/plan",
      tono: "ambar",
      orden: 10,
    });
  }

  if (x.modo === "empleador" && x.autoevaluacionAnio?.estado !== "cerrada") {
    const d = diasHasta(`${anio}-12-31`, x.hoy);
    r.push({
      clave: "autoevaluacion",
      titulo: `Autoevaluación de estándares ${anio}`,
      detalle: `${x.autoevaluacionAnio ? "En curso" : "Sin iniciar"} · se cierra antes del 31 de diciembre (${cuandoVence(d)})`,
      href: "/sst/estandares",
      tono: tonoDe(d, 60),
      orden: d,
    });
  }

  if (x.modo === "empleador" && x.registroAnual) {
    const d = diasHasta(x.registroAnual.fecha, x.hoy);
    if (d >= -7 && d <= 60) {
      r.push({
        clave: "registro",
        titulo: "Registro anual ante el Ministerio del Trabajo",
        detalle: `Autoevaluación y plan de mejoramiento · ${cuandoVence(d)} (${fechaLegible(x.registroAnual.fecha)})`,
        href: "/sst/estandares",
        tono: tonoDe(d),
        orden: d,
      });
    }
  }

  if (x.licenciaVence) {
    const d = diasHasta(x.licenciaVence, x.hoy);
    if (d <= 60) {
      r.push({ clave: "licencia", titulo: "Licencia en SST del responsable", detalle: cuandoVence(d), href: "/sst", tono: tonoDe(d), orden: d });
    }
  }

  // Solo el periodo más reciente de cada comité.
  const ultimo = new Map<string, string>();
  for (const c of x.comites) if (!ultimo.has(c.tipo) || c.fecha_fin > ultimo.get(c.tipo)!) ultimo.set(c.tipo, c.fecha_fin);
  const NOMBRE = { vigia: "Vigía de SST", copasst: "COPASST", convivencia: "Comité de Convivencia" } as const;
  for (const [tipo, fin] of ultimo) {
    const d = diasHasta(fin, x.hoy);
    if (d <= 60) {
      r.push({
        clave: `comite-${tipo}`,
        titulo: `Periodo del ${NOMBRE[tipo as keyof typeof NOMBRE]}`,
        detalle: `${d < 0 ? "Terminó" : "Termina"} el ${fechaLegible(fin)}: conforma el nuevo periodo`,
        href: "/sst/plan?tab=comites",
        tono: tonoDe(d),
        orden: d,
      });
    }
  }

  return ordenar(r);
}

const PESO: Record<Tono, number> = { rojo: 0, ambar: 1, info: 2 };
function ordenar(r: Pendiente[]): Pendiente[] {
  return r.sort((a, b) => PESO[a.tono] - PESO[b.tono] || a.orden - b.orden);
}
