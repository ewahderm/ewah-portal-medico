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
  registroAnual: null,
  ...p,
});

const evento = {
  id: "e1",
  fecha: "2026-10-06",
  tipo_evento: "accidente" as const,
  reportado_arl: false,
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
    expect(r.map((p) => p.clave)).toEqual(["reporte-e1", "investigacion-e1"]);
    expect(r[0]).toMatchObject({ tono: "rojo", href: "/sst/eventos/e1" });
    expect(r[0].detalle).toContain("vence en 1 día");
    expect(r[1].tono).toBe("ambar");
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
  it("registro anual en la ventana de 60 días", () => {
    const r = pendientesSst(base({ registroAnual: { fecha: "2026-10-20" } }));
    expect(r[0]).toMatchObject({ clave: "registro", tono: "ambar" });
  });
});
