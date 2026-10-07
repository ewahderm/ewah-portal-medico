import { describe, expect, it } from "vitest";
import { estadoOcurrencia, porConfirmar, resumenObligaciones } from "@/lib/habilitacion/semaforo";
import type { ObligacionClinica } from "@/lib/habilitacion/tipos";

const o = (fecha_limite: string, p: Partial<{ estado: "pendiente" | "presentado" | "no_aplica_periodo" | "anulado"; fecha_presentacion: string | null }> = {}) => ({
  estado: "pendiente" as const,
  fecha_limite,
  fecha_presentacion: null,
  ...p,
});

describe("estadoOcurrencia (§5.4)", () => {
  const hoy = "2026-10-06";
  it("semáforo por días: rojo ≤ 7, ámbar 8–30, verde > 30", () => {
    expect(estadoOcurrencia(o("2026-10-10"), hoy)).toMatchObject({ semaforo: "rojo", etiqueta: "Vence en 4 días" });
    expect(estadoOcurrencia(o("2026-10-20"), hoy).semaforo).toBe("ambar");
    expect(estadoOcurrencia(o("2026-12-20"), hoy).semaforo).toBe("verde");
    expect(estadoOcurrencia(o("2026-10-06"), hoy).etiqueta).toBe("Vence hoy");
  });
  it("vencida y extemporánea se calculan", () => {
    expect(estadoOcurrencia(o("2026-10-01"), hoy)).toMatchObject({ vencida: true, semaforo: "rojo", etiqueta: "Vencida hace 5 días" });
    expect(estadoOcurrencia(o("2026-10-01", { estado: "presentado", fecha_presentacion: "2026-10-03" }), hoy)).toMatchObject({ extemporanea: true, semaforo: "gris" });
    expect(estadoOcurrencia(o("2026-10-01", { estado: "presentado", fecha_presentacion: "2026-10-01" }), hoy).extemporanea).toBe(false);
  });
  it("por confirmar no se pinta de rojo", () => {
    expect(estadoOcurrencia(o("2026-10-01"), hoy, true).semaforo).toBe("por_confirmar");
  });
});

const config = (id: string, p: Partial<ObligacionClinica> & { activacion?: "auto" | "por_confirmar" | "informativa"; asesor?: boolean } = {}): ObligacionClinica => ({
  id: `c-${id}`,
  obligacion_id: id,
  aplica_segun_perfil: true,
  activa: true,
  origen: "automatica",
  confirmada: false,
  justificacion: null,
  fecha_consulta_asesor: null,
  dias_aviso: null,
  responsable_id: null,
  correo_adicional: null,
  ...p,
  hab_obligaciones_catalogo: {
    activacion_default: p.activacion ?? "auto",
    requiere_confirmacion_asesor: p.asesor ?? false,
  } as ObligacionClinica["hab_obligaciones_catalogo"],
});

describe("resumenObligaciones", () => {
  it("cuenta vencidas y próximas solo de activas y confirmadas", () => {
    const c = [config("a"), config("b", { activacion: "por_confirmar" }), config("c", { activa: false }), config("d", { asesor: true, confirmada: true })];
    const r = resumenObligaciones(
      c,
      [
        { obligacion_id: "a", ...o("2026-10-01") },
        { obligacion_id: "a", ...o("2026-10-09") },
        { obligacion_id: "b", ...o("2026-10-01") },
        { obligacion_id: "c", ...o("2026-10-01") },
        { obligacion_id: "d", ...o("2026-10-02") },
      ],
      "2026-10-06",
    );
    expect(r).toEqual({ vencidas: 2, proximas: 1, activas: 3 });
    expect(porConfirmar(c[1])).toBe(true);
    expect(porConfirmar(c[3])).toBe(false);
  });
});
