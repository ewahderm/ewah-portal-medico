import { describe, expect, it } from "vitest";
import { pendientesSst, type InsumosTablero } from "@/lib/sst/tablero";

const base = (p: Partial<InsumosTablero> = {}): InsumosTablero => ({
  hoy: "2026-10-07",
  gestion: true,
  modo: "empleador",
  eventos: [],
  acciones: [],
  examenes: [],
  planPendientes: [],
  autoevaluacionAnio: { estado: "cerrada" },
  licenciaVence: null,
  comites: [],
  registroAnual: { fecha: "2027-07-31" },
  ...p,
});

const evento = {
  id: "e1",
  fecha: "2026-10-06",
  tipo_evento: "accidente" as const,
  gravedad: "leve" as "leve" | "grave" | "mortal" | null,
  reportado_arl: false,
  reportado_eps: false,
  reportado_mintrabajo: false,
  cerrado: false,
  fecha_limite_reporte: "2026-10-08",
  fecha_limite_investigacion: "2026-10-21",
  investigacion_cerrada: false,
};

describe("tablero de pendientes SG-SST", () => {
  it("sin nada pendiente, vacío", () => {
    expect(pendientesSst(base())).toEqual([]);
  });
  it("accidente sin reportar va primero y en rojo; la investigación después", () => {
    const r = pendientesSst(base({ eventos: [evento] }));
    expect(r.map((p) => p.clave)).toEqual(["reporte-arl-e1", "reporte-eps-e1", "investigacion-e1"]);
    expect(r[0]).toMatchObject({ tono: "rojo", href: "/sst/eventos/e1" });
    expect(r[0].detalle).toContain("vence en 1 día");
    expect(r[2].tono).toBe("ambar");
  });
  it("cada reporte pendiente aparece por su cuenta: la EPS sigue aunque la ARL ya se hizo", () => {
    const r = pendientesSst(base({ eventos: [{ ...evento, reportado_arl: true }] }));
    expect(r.map((p) => p.clave)).toEqual(["reporte-eps-e1", "investigacion-e1"]);
    expect(r[0].titulo).toBe("Reportar el accidente a la EPS");
  });
  it("MinTrabajo solo si el evento es grave o mortal", () => {
    const leve = pendientesSst(base({ eventos: [{ ...evento, reportado_arl: true, reportado_eps: true }] }));
    expect(leve.map((p) => p.clave)).toEqual(["investigacion-e1"]);
    const grave = pendientesSst(base({ eventos: [{ ...evento, gravedad: "grave", reportado_arl: true, reportado_eps: true }] }));
    expect(grave.map((p) => p.clave)).toEqual(["reporte-mintrabajo-e1", "investigacion-e1"]);
    const hecho = pendientesSst(base({ eventos: [{ ...evento, gravedad: "mortal", reportado_arl: true, reportado_eps: true, reportado_mintrabajo: true }] }));
    expect(hecho.map((p) => p.clave)).toEqual(["investigacion-e1"]);
  });
  it("un evento cerrado no genera pendientes", () => {
    expect(pendientesSst(base({ eventos: [{ ...evento, cerrado: true }] }))).toEqual([]);
  });
  it("el incidente no se reporta a la ARL pero sí se investiga", () => {
    const r = pendientesSst(base({ eventos: [{ ...evento, tipo_evento: "incidente" }] }));
    expect(r.map((p) => p.clave)).toEqual(["investigacion-e1"]);
  });
  it("sin gestión solo los eventos", () => {
    const r = pendientesSst(base({ gestion: false, autoevaluacionAnio: null, acciones: [{ fecha_compromiso: "2026-01-01", estado: "abierta" }] }));
    expect(r).toEqual([]);
  });
  it("acciones, exámenes, plan, autoevaluación, licencia y comité", () => {
    const r = pendientesSst(
      base({
        acciones: [
          { fecha_compromiso: "2026-10-01", estado: "abierta" },
          { fecha_compromiso: "2026-10-10", estado: "en_curso" },
          { fecha_compromiso: "2026-09-01", estado: "cerrada" },
        ],
        examenes: [
          { nombre: "Ana", proximo_examen: "2026-10-01" },
          { nombre: "Luis", proximo_examen: "2026-12-31" },
        ],
        planPendientes: [{ anio: 2026, mes: 9 }, { anio: 2026, mes: 10 }],
        autoevaluacionAnio: null,
        licenciaVence: "2026-11-01",
        comites: [
          { tipo: "copasst", fecha_fin: "2024-01-01" },
          { tipo: "copasst", fecha_fin: "2026-11-30" },
        ],
      }),
    );
    const por = Object.fromEntries(r.map((p) => [p.clave, p]));
    expect(por.acciones.detalle).toBe("1 vencida · 1 vence esta semana");
    expect(por.examenes).toMatchObject({ tono: "rojo" });
    expect(por.examenes.detalle).toContain("1 vencido");
    expect(por.plan.detalle).toBe("1 actividad de meses pasados");
    expect(por.autoevaluacion.detalle).toContain("Sin iniciar");
    expect(por.licencia.tono).toBe("ambar");
    expect(por["comite-copasst"].detalle).toContain("Termina el 30 nov 2026");
    expect(r[0].tono).toBe("rojo");
  });
  it("trabajando solo no pide autoevaluación ni registro", () => {
    const r = pendientesSst(base({ modo: "independiente", autoevaluacionAnio: null, registroAnual: { fecha: "2026-10-20" } }));
    expect(r).toEqual([]);
  });
  it("avisa a la vista si el año no tiene fecha de registro configurada", () => {
    const r = pendientesSst(base({ registroAnual: null }));
    expect(r.map((p) => p.clave)).toEqual(["registro-sin-fecha"]);
    expect(r[0].tono).toBe("ambar");
    expect(pendientesSst(base({ registroAnual: null, gestion: false }))).toEqual([]);
  });
  it("registro anual en la ventana de 60 días", () => {
    const r = pendientesSst(base({ registroAnual: { fecha: "2026-10-20" } }));
    expect(r[0]).toMatchObject({ clave: "registro", tono: "ambar" });
  });
});
