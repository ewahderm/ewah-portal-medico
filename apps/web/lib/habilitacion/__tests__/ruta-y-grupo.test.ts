import { describe, expect, it } from "vitest";
import { parsePesos, pesosAUvt, sugerirGrupoSupersalud } from "@/lib/habilitacion/grupo-supersalud";
import {
  aniosSinFestivos,
  calcularRuta,
  diasHasta,
  faltanteServicio,
  fechaLegible,
  nivelVencimientoReps,
  sugerirVencimientoReps,
  sumarDias,
} from "@/lib/habilitacion/ruta";
import type { RespuestasGrupo, ServicioSede } from "@/lib/habilitacion/tipos";

const base: RespuestasGrupo = {
  nitEsEapb: false,
  naturaleza: "privada",
  niifGrupo: 3,
  nivelPublica: null,
  activosUvt: null,
  ingresosUvt: null,
  patrimonioUvt: null,
  serviciosAlta: 0,
  serviciosMediana: 0,
  intramuralesHospitalarios: 0,
};

describe("sugerirGrupoSupersalud", () => {
  it("B cuando el NIT es de una EAPB, aunque las cifras sean enormes", () => {
    expect(sugerirGrupoSupersalud({ ...base, nitEsEapb: true, activosUvt: 9_999_999 }).grupo).toBe("B");
  });
  it("D3 es el residual", () => {
    expect(sugerirGrupoSupersalud(base).grupo).toBe("D3");
  });
  it("privada con NIIF Grupo 2 queda como mínimo en D2", () => {
    expect(sugerirGrupoSupersalud({ ...base, niifGrupo: 2 }).grupo).toBe("D2");
  });
  it("NIIF Grupo 1 en privada es C1; en pública no cuenta", () => {
    expect(sugerirGrupoSupersalud({ ...base, niifGrupo: 1 }).grupo).toBe("C1");
    expect(sugerirGrupoSupersalud({ ...base, naturaleza: "publica", niifGrupo: 1 }).grupo).toBe("D3");
  });
  it("pública de nivel 2 es D1 y de nivel 3 es C1", () => {
    expect(sugerirGrupoSupersalud({ ...base, naturaleza: "publica", nivelPublica: 2 }).grupo).toBe("D1");
    expect(sugerirGrupoSupersalud({ ...base, naturaleza: "publica", nivelPublica: 3 }).grupo).toBe("C1");
  });
  it("umbral estricto (mayor que): exactamente el límite no sube de grupo", () => {
    expect(sugerirGrupoSupersalud({ ...base, activosUvt: 39_538 }).grupo).toBe("D3");
    expect(sugerirGrupoSupersalud({ ...base, activosUvt: 39_539 }).grupo).toBe("D2");
  });
  it("cuenta servicios: 3 de alta complejidad → D2; 13 → C2", () => {
    expect(sugerirGrupoSupersalud({ ...base, serviciosAlta: 3 }).grupo).toBe("D2");
    expect(sugerirGrupoSupersalud({ ...base, serviciosAlta: 13 }).grupo).toBe("C2");
  });
  it("explica el motivo", () => {
    const s = sugerirGrupoSupersalud({ ...base, patrimonioUvt: 400_000 });
    expect(s.grupo).toBe("D1");
    expect(s.motivos[0]).toContain("Patrimonio");
  });
});

describe("parsePesos / pesosAUvt", () => {
  it("entiende el formato es-CO", () => {
    expect(parsePesos("1.234.567,89")).toBe(1_234_567);
    expect(parsePesos("$ 2 000 000")).toBe(2_000_000);
    expect(parsePesos("")).toBeNull();
    expect(parsePesos("abc")).toBeNull();
  });
  it("convierte a UVT redondeando", () => {
    expect(pesosAUvt(100_000, 49_799)).toBe(2);
    expect(pesosAUvt(100_000, null)).toBeNull();
  });
});

describe("fechas", () => {
  it("diasHasta no se corre por zona horaria", () => {
    expect(diasHasta("2026-10-07", "2026-10-06")).toBe(1);
    expect(diasHasta("2026-10-06", "2026-10-06")).toBe(0);
    expect(diasHasta("2026-09-06", "2026-10-06")).toBe(-30);
  });
  it("semáforo del vencimiento REPS", () => {
    expect(nivelVencimientoReps(10)).toBe("rojo");
    expect(nivelVencimientoReps(30)).toBe("rojo");
    expect(nivelVencimientoReps(60)).toBe("ambar");
    expect(nivelVencimientoReps(120)).toBe("verde");
  });
  it("sugiere inscripción + 4 años, recortando el 29 de febrero si hace falta", () => {
    expect(sugerirVencimientoReps("2023-05-10")).toBe("2027-05-10");
    expect(sugerirVencimientoReps("2096-02-29")).toBe("2100-02-28");
  });
  it("fecha legible", () => {
    expect(fechaLegible("2026-10-06")).toBe("6 oct 2026");
  });
});

const servicio = (over: Partial<ServicioSede> = {}): ServicioSede => ({
  id: "s",
  sede_id: "sede",
  practica_medica_id: "p",
  servicio_norma_id: "n",
  codigo_habilitacion: null,
  complejidad: "mediana",
  modalidades: ["intramural"],
  telemedicina_categorias: [],
  telemedicina_roles: [],
  estado: "habilitado",
  fecha_habilitacion: null,
  fecha_cierre_temporal: null,
  practicas_medicas: null,
  hab_servicios_norma: null,
  ...over,
});

describe("faltanteServicio", () => {
  it("dice qué falta, en orden", () => {
    expect(faltanteServicio(servicio({ servicio_norma_id: null }))).toBe("Elige el numeral de la norma");
    expect(faltanteServicio(servicio({ modalidades: [] }))).toBe("Marca al menos una modalidad");
    expect(faltanteServicio(servicio({ modalidades: ["telemedicina"] }))).toContain("telemedicina");
    expect(faltanteServicio(servicio())).toBeNull();
  });
});

describe("calcularRuta", () => {
  const perfil = { tipo_prestador: "ips" as const, estado_reps: "inscrito" as const, fecha_vencimiento_reps: "2027-01-01" };

  it("sin perfil: paso 1 pendiente y paso 2 bloqueado", () => {
    const r = calcularRuta({ perfil: null, sedes: [], serviciosSinSede: 0, gestion: true });
    expect(r[0].estado).toBe("pendiente");
    expect(r[1].estado).toBe("bloqueado");
    expect(r[2].estado).toBe("bloqueado");
    expect(r[5].estado).toBe("actual");
  });
  it("paso 4 (autoevaluación) según el avance real", () => {
    const paso4 = (a: Parameters<typeof calcularRuta>[0]["autoevaluacion"], gestion = true) =>
      calcularRuta({ perfil, sedes: [], serviciosSinSede: 0, gestion, autoevaluacion: a })[3];
    const base = { evaluables: 391, evaluados: 0, noCumple: 0, porcentajeCumplimiento: 0 };
    expect(paso4(null).estado).toBe("proximamente");
    expect(paso4(base, false).estado).toBe("requiere_pro");
    expect(paso4({ ...base, evaluables: 0 }).estado).toBe("bloqueado");
    expect(paso4(base)).toMatchObject({ estado: "pendiente", detalle: "0 de 391 criterios evaluados." });
    expect(paso4({ ...base, evaluados: 10 }).estado).toBe("en_curso");
    expect(paso4({ ...base, evaluados: 10, noCumple: 2 })).toMatchObject({ estado: "alerta", detalle: "2 no cumplen · 10 de 391 criterios evaluados." });
    expect(paso4({ ...base, evaluados: 391, porcentajeCumplimiento: 100 })).toMatchObject({ estado: "completo", detalle: "Todo evaluado · 100 % de cumplimiento." });
    expect(calcularRuta({ perfil: null, sedes: [], serviciosSinSede: 0, gestion: true, autoevaluacion: base })[3].estado).toBe("bloqueado");
  });
  it("paso 3 (documentos) y paso 5 (obligaciones)", () => {
    const ruta = (p: Partial<Parameters<typeof calcularRuta>[0]>) => calcularRuta({ perfil, sedes: [], serviciosSinSede: 0, gestion: true, ...p });
    expect(ruta({ documentos: { total: 20, listos: 0, vencidos: 0 } })[2].estado).toBe("pendiente");
    expect(ruta({ documentos: { total: 20, listos: 5, vencidos: 1 } })[2]).toMatchObject({ estado: "alerta" });
    expect(ruta({ documentos: { total: 20, listos: 20, vencidos: 0 } })[2].estado).toBe("completo");
    expect(ruta({ gestion: false, documentos: null })[2].estado).toBe("requiere_pro");
    expect(ruta({ obligaciones: { vencidas: 2, proximas: 0, activas: 9 } })[4].estado).toBe("alerta");
    expect(ruta({ obligaciones: { vencidas: 0, proximas: 1, activas: 9 } })[4].estado).toBe("en_curso");
    expect(ruta({ obligaciones: { vencidas: 0, proximas: 0, activas: 9 } })[4].estado).toBe("completo");
    // Las obligaciones se ven en todos los planes (calendario de lectura en Gratis).
    expect(ruta({ gestion: false, obligaciones: { vencidas: 0, proximas: 0, activas: 3 } })[4].estado).toBe("completo");
  });
  it("sumarDias sin zona horaria", () => {
    expect(sumarDias("2026-12-20", 30)).toBe("2027-01-19");
    expect(sumarDias("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("inscrito sin vencimiento: perfil en curso", () => {
    const r = calcularRuta({ perfil: { ...perfil, fecha_vencimiento_reps: null }, sedes: [], serviciosSinSede: 0, gestion: true });
    expect(r[0].estado).toBe("en_curso");
  });
  it("Gratis: el paso 2 pide plan Pro", () => {
    const r = calcularRuta({ perfil, sedes: [], serviciosSinSede: 0, gestion: false });
    expect(r[1].estado).toBe("requiere_pro");
  });
  it("servicios completos pero sede sin edificación → alerta", () => {
    const r = calcularRuta({ perfil, sedes: [{ uso_edificacion: null, servicios: [servicio()] }], serviciosSinSede: 0, gestion: true });
    expect(r[1].estado).toBe("alerta");
  });
  it("servicio sin numeral → en curso; todo listo → completo", () => {
    expect(
      calcularRuta({ perfil, sedes: [{ uso_edificacion: "mixto", servicios: [servicio({ servicio_norma_id: null })] }], serviciosSinSede: 0, gestion: true })[1].estado,
    ).toBe("en_curso");
    expect(
      calcularRuta({ perfil, sedes: [{ uso_edificacion: "mixto", servicios: [servicio()] }], serviciosSinSede: 0, gestion: true })[1].estado,
    ).toBe("completo");
  });
});

describe("aniosSinFestivos (aviso del calendario)", () => {
  it("lista los años del rango sin ningún festivo cargado", () => {
    expect(aniosSinFestivos("2028-12-20", "2029-02-15", ["2028-12-25", "2028-01-01"])).toEqual([2029]);
  });
  it("vacío si todos los años del rango tienen festivos", () => {
    expect(aniosSinFestivos("2026-10-01", "2026-12-31", ["2026-12-25"])).toEqual([]);
  });
  it("sin festivos cargados, todos los años del rango", () => {
    expect(aniosSinFestivos("2029-12-01", "2030-01-31", [])).toEqual([2029, 2030]);
  });
});
