import { describe, expect, it } from "vitest";
import { pendientesEvento, type EventoPlazos } from "@/lib/sst/plazos";

const ev = (p: Partial<EventoPlazos>): EventoPlazos => ({
  tipo_evento: "accidente",
  gravedad: "leve",
  reportado_arl: false,
  reportado_eps: false,
  reportado_mintrabajo: false,
  fecha_limite_reporte: "2026-10-09",
  fecha_limite_investigacion: "2026-10-22",
  cerrado: false,
  ...p,
});

describe("plazos de un evento SST", () => {
  it("accidente leve: ARL, EPS e investigación, el más urgente primero", () => {
    const r = pendientesEvento(ev({}), false, "2026-10-08");
    expect(r.map((p) => p.clave)).toEqual(["arl", "eps", "investigacion"]);
    expect(r[0]).toMatchObject({ texto: "Reportar a la ARL: vence en 1 día", semaforo: "rojo" });
  });
  it("grave: también MinTrabajo; vencido se dice así", () => {
    const r = pendientesEvento(ev({ gravedad: "grave", reportado_arl: true, reportado_eps: true }), false, "2026-10-12");
    expect(r[0]).toMatchObject({ clave: "mintrabajo", texto: "Reportar a MinTrabajo: venció hace 3 días" });
  });
  it("incidente: solo investigación; cerrado: nada", () => {
    expect(pendientesEvento(ev({ tipo_evento: "incidente", gravedad: null }), false, "2026-10-08").map((p) => p.clave)).toEqual(["investigacion"]);
    expect(pendientesEvento(ev({}), true, "2026-10-08").map((p) => p.clave)).toEqual(["arl", "eps"]);
    expect(pendientesEvento(ev({ cerrado: true }), false, "2026-10-08")).toEqual([]);
  });
});
