import { describe, expect, it } from "vitest";
import { documentosAplicables, type ContextoDocumentos, type SedeContexto } from "@/lib/habilitacion/reglas-documentos";
import { armarChecklist, resumenChecklist } from "@/lib/habilitacion/checklist";
import { estadoDocumento } from "@/lib/habilitacion/estado-documento";
import { indicadoresSuficiencia, parsePesosCO } from "@/lib/habilitacion/suficiencia";
import type { DocumentoCatalogo } from "@/lib/habilitacion/tipos";

let orden = 0;
function doc(codigo: string, p: Partial<DocumentoCatalogo> = {}): DocumentoCatalogo {
  return {
    id: codigo,
    codigo,
    nombre_corto: codigo,
    descripcion_literal: codigo,
    explicacion_sencilla: null,
    aplica_a: ["ips", "profesional_independiente", "transporte_especial", "objeto_social_diferente"],
    obligatorio: true,
    condicion_texto: null,
    condiciones: [],
    seccion: "radicar",
    por_sede: false,
    tiene_vencimiento: false,
    regla_vigencia: null,
    uno_por_servicio: false,
    fuente_norma: null,
    fuente_articulo: null,
    fuente_pagina: null,
    fuente_url: null,
    verificado: true,
    orden: orden++,
    es_financiero: false,
    ...p,
  };
}

// Subconjunto real del catálogo (0064) con las reglas que más cambian.
const CATALOGO = [
  doc("formulario_inscripcion_reps"),
  doc("declaracion_autoevaluacion", { uno_por_servicio: true }),
  doc("certificado_existencia_representacion_legal", { aplica_a: ["ips", "transporte_especial", "objeto_social_diferente"], condiciones: ["tep_solo_persona_juridica"], regla_vigencia: "max_30_dias_radicacion", tiene_vencimiento: true }),
  doc("documento_identificacion_persona_natural", { aplica_a: ["profesional_independiente", "transporte_especial"], condiciones: ["tep_solo_persona_natural"] }),
  doc("titulos_educacion_superior", { aplica_a: ["profesional_independiente"] }),
  doc("licencia_construccion", { aplica_a: ["ips", "objeto_social_diferente"], por_sede: true }),
  doc("plan_ajustes_instalaciones_electricas", { aplica_a: ["profesional_independiente", "objeto_social_diferente", "ips"], por_sede: true, condiciones: ["edificacion_pre_2005_05"] }),
  doc("permiso_propiedad_horizontal", { aplica_a: ["ips", "objeto_social_diferente"], por_sede: true, condiciones: ["edificacion_post_1996_mixta"] }),
  doc("estudio_vulnerabilidad_estructural", { aplica_a: ["ips"], por_sede: true, condiciones: ["edificacion_pre_2010_con_urgencias_cirugia_uci"] }),
  doc("licencia_practica_medica_radiaciones", { por_sede: true, condiciones: ["radiaciones_ionizantes"] }),
  doc("telemedicina_contrato_prestador_referencia", { condiciones: ["telemedicina_remisor"] }),
  doc("acto_personeria_juridica_esal", { aplica_a: ["ips", "objeto_social_diferente", "transporte_especial"], condiciones: ["esal"] }),
  doc("estados_financieros", { aplica_a: ["ips"], condiciones: ["ips_nueva"], seccion: "evidencia_visita", es_financiero: true }),
  doc("poliza_responsabilidad_civil", { aplica_a: [], verificado: false }),
];

const sede = (p: Partial<SedeContexto> = {}): SedeContexto => ({
  id: "s1",
  nombre: "Principal",
  uso_edificacion: "exclusivo_salud",
  fecha_construccion: "2012-03-01",
  servicios: [{ id: "v1", nombre: "Dermatología", clave: "11.2.2", estado: "habilitado", modalidades: ["intramural"], telemedicina_roles: [] }],
  ...p,
});

const base: ContextoDocumentos = {
  tipoPrestador: "ips",
  personaJuridica: true,
  naturaleza: "privada",
  esEsal: false,
  esCooperacionInternacional: false,
  tieneSedesOtrosDepartamentos: false,
  esIpsNueva: false,
  sedes: [sede()],
};

const codigos = (ctx: ContextoDocumentos) => documentosAplicables(CATALOGO, ctx).map((r) => r.catalogo.codigo);

describe("documentosAplicables (AC3 HU-3.1)", () => {
  it("IPS persona jurídica vs profesional independiente generan checklists distintos", () => {
    const ips = codigos(base);
    const pi = codigos({ ...base, tipoPrestador: "profesional_independiente", personaJuridica: false });
    expect(ips).toContain("certificado_existencia_representacion_legal");
    expect(ips).toContain("licencia_construccion");
    expect(ips).not.toContain("titulos_educacion_superior");
    expect(pi).toContain("titulos_educacion_superior");
    expect(pi).toContain("documento_identificacion_persona_natural");
    expect(pi).not.toContain("certificado_existencia_representacion_legal");
  });
  it("transporte especial: persona natural o jurídica decide", () => {
    const natural = codigos({ ...base, tipoPrestador: "transporte_especial", personaJuridica: false });
    expect(natural).toContain("documento_identificacion_persona_natural");
    expect(natural).not.toContain("certificado_existencia_representacion_legal");
    const sinDato = documentosAplicables(CATALOGO, { ...base, tipoPrestador: "transporte_especial", personaJuridica: null });
    expect(sinDato.find((r) => r.catalogo.codigo === "certificado_existencia_representacion_legal")?.aplica).toBe("por_confirmar");
  });
  it("no verificados nunca se exigen; sin tipo de prestador no hay checklist", () => {
    expect(codigos(base)).not.toContain("poliza_responsabilidad_civil");
    expect(codigos({ ...base, tipoPrestador: null })).toEqual([]);
  });
  it("uno por servicio y uno por sede", () => {
    const r = documentosAplicables(CATALOGO, { ...base, sedes: [sede(), sede({ id: "s2", nombre: "Norte", servicios: [{ id: "v2", nombre: "Pediatría", clave: "11.2.2", estado: "habilitado", modalidades: ["intramural"], telemedicina_roles: [] }] })] });
    expect(r.filter((x) => x.catalogo.codigo === "declaracion_autoevaluacion").map((x) => x.servicio?.id)).toEqual(["v1", "v2"]);
    expect(r.filter((x) => x.catalogo.codigo === "licencia_construccion").map((x) => x.sede?.id)).toEqual(["s1", "s2"]);
  });
  it("edificación: antigüedad y uso mixto; sin fecha = por confirmar", () => {
    expect(codigos({ ...base, sedes: [sede({ fecha_construccion: "2001-01-01" })] })).toContain("plan_ajustes_instalaciones_electricas");
    expect(codigos(base)).not.toContain("plan_ajustes_instalaciones_electricas");
    expect(codigos({ ...base, sedes: [sede({ uso_edificacion: "mixto", fecha_construccion: "2000-01-01" })] })).toContain("permiso_propiedad_horizontal");
    expect(codigos({ ...base, sedes: [sede({ uso_edificacion: "mixto", fecha_construccion: "1990-01-01" })] })).not.toContain("permiso_propiedad_horizontal");
    const sinFecha = documentosAplicables(CATALOGO, { ...base, sedes: [sede({ fecha_construccion: null })] });
    expect(sinFecha.find((r) => r.catalogo.codigo === "plan_ajustes_instalaciones_electricas")).toMatchObject({ aplica: "por_confirmar" });
  });
  it("vulnerabilidad estructural solo con urgencias, cirugía o UCI antes de 2010", () => {
    const urg = { id: "u", nombre: "Urgencias", clave: "11.6.1", estado: "habilitado", modalidades: ["intramural"], telemedicina_roles: [] };
    expect(codigos({ ...base, sedes: [sede({ fecha_construccion: "2008-01-01", servicios: [urg] })] })).toContain("estudio_vulnerabilidad_estructural");
    expect(codigos({ ...base, sedes: [sede({ fecha_construccion: "2008-01-01" })] })).not.toContain("estudio_vulnerabilidad_estructural");
  });
  it("radiaciones, telemedicina remisor, ESAL, IPS nueva", () => {
    const rx = { id: "r", nombre: "Rx", clave: "11.3.4.1", estado: "habilitado", modalidades: ["intramural"], telemedicina_roles: [] };
    expect(codigos({ ...base, sedes: [sede({ servicios: [rx] })] })).toContain("licencia_practica_medica_radiaciones");
    const tele = { id: "t", nombre: "Tele", clave: "11.2.2", estado: "habilitado", modalidades: ["telemedicina"], telemedicina_roles: ["prestador_remisor"] };
    expect(codigos({ ...base, sedes: [sede({ servicios: [tele] })] })).toContain("telemedicina_contrato_prestador_referencia");
    expect(codigos({ ...base, esEsal: true })).toContain("acto_personeria_juridica_esal");
    expect(codigos({ ...base, esIpsNueva: true })).toContain("estados_financieros");
    expect(codigos(base)).not.toContain("estados_financieros");
  });
  it("un servicio cerrado no cuenta", () => {
    const cerrado = sede({ servicios: [{ id: "v1", nombre: "Derma", clave: "11.2.2", estado: "cerrado", modalidades: ["intramural"], telemedicina_roles: [] }] });
    expect(codigos({ ...base, sedes: [cerrado] })).not.toContain("licencia_construccion");
  });
});

describe("estadoDocumento (HU-3.2)", () => {
  const cat = { tiene_vencimiento: false, regla_vigencia: null };
  const v = (p: Partial<{ version: number; fecha_expedicion: string | null; fecha_vencimiento: string | null }> = {}) => ({ version: 1, fecha_expedicion: null, fecha_vencimiento: null, ...p });
  it("pendiente, no aplica y cargado", () => {
    expect(estadoDocumento(cat, null, null, null, "2026-10-06").estado).toBe("pendiente");
    expect(estadoDocumento(cat, { no_aplica: true, no_aplica_justificacion: "x" }, null, null, "2026-10-06").estado).toBe("no_aplica");
    expect(estadoDocumento(cat, null, v(), null, "2026-10-06").estado).toBe("cargado");
  });
  it("vencimiento: vencido y por vencer en 30 días", () => {
    expect(estadoDocumento(cat, null, v({ fecha_vencimiento: "2026-10-01" }), null, "2026-10-06").estado).toBe("vencido");
    expect(estadoDocumento(cat, null, v({ fecha_vencimiento: "2026-10-20" }), null, "2026-10-06")).toMatchObject({ estado: "por_vencer", dias: 14 });
    expect(estadoDocumento({ tiene_vencimiento: true, regla_vigencia: null }, null, v(), null, "2026-10-06").estado).toBe("por_vencer");
  });
  it("regla de 30 días contra la fecha planeada de radicación", () => {
    const c30 = { tiene_vencimiento: true, regla_vigencia: "max_30_dias_radicacion" as const };
    expect(estadoDocumento(c30, null, v({ fecha_expedicion: "2026-10-01" }), null, "2026-10-06").estado).toBe("cargado");
    expect(estadoDocumento(c30, null, v({ fecha_expedicion: "2026-10-01" }), "2026-11-15", "2026-10-06").estado).toBe("vencido");
    expect(estadoDocumento(c30, null, v({ fecha_expedicion: "2026-09-10" }), null, "2026-10-06")).toMatchObject({ estado: "por_vencer", dias: 4 });
    expect(estadoDocumento(c30, null, v(), null, "2026-10-06").estado).toBe("por_vencer");
  });
});

describe("armarChecklist: documentos financieros sin permiso de edición (0086 · 7c)", () => {
  const ctx: ContextoDocumentos = { ...base, esIpsNueva: true };
  const financiero = () => armarChecklist(CATALOGO, [], ctx, null, "2026-10-06", false).find((i) => i.catalogo?.codigo === "estados_financieros");

  it("sin EDIT no se afirma 'Falta cargarlo': el estado es sin_permiso", () => {
    expect(financiero()?.estado.estado).toBe("sin_permiso");
  });
  it("con EDIT sigue siendo pendiente", () => {
    const i = armarChecklist(CATALOGO, [], ctx, null, "2026-10-06", true).find((x) => x.catalogo?.codigo === "estados_financieros");
    expect(i?.estado.estado).toBe("pendiente");
  });
  it("un documento no financiero sin cargar sigue pendiente aunque no haya EDIT", () => {
    const i = armarChecklist(CATALOGO, [], ctx, null, "2026-10-06", false).find((x) => x.catalogo?.codigo === "formulario_inscripcion_reps");
    expect(i?.estado.estado).toBe("pendiente");
  });
  it("los sin_permiso no cuentan ni como listos ni como faltantes del resumen", () => {
    const cat = [doc("formulario_inscripcion_reps"), doc("fin_para_radicar", { es_financiero: true })];
    const sinEdit = resumenChecklist(armarChecklist(cat, [], ctx, null, "2026-10-06", false));
    const conEdit = resumenChecklist(armarChecklist(cat, [], ctx, null, "2026-10-06", true));
    expect(conEdit.total).toBe(2);
    expect(sinEdit.total).toBe(1);
  });
});

describe("suficiencia patrimonial (8.2.1–8.2.3)", () => {
  it("cumple y no cumple", () => {
    const ok = indicadoresSuficiencia({ patrimonio_total: 600, capital: 1000, obligaciones_mercantiles_360: 10, obligaciones_laborales_360: 0, pasivo_corriente: 100 });
    expect(ok.indicadores.map((i) => i.valor)).toEqual([60, 10, 0]);
    expect(ok.cumpleTodos).toBe(true);
    const no = indicadoresSuficiencia({ patrimonio_total: 500, capital: 1000, obligaciones_mercantiles_360: 0, obligaciones_laborales_360: 0, pasivo_corriente: 100 });
    expect(no.indicadores[0].cumple).toBe(false); // 50 % no es "mayor que 50 %"
    expect(no.cumpleTodos).toBe(false);
  });
  it("división por cero = no calculable", () => {
    const r = indicadoresSuficiencia({ patrimonio_total: 1, capital: 0, obligaciones_mercantiles_360: 5, obligaciones_laborales_360: 0, pasivo_corriente: 0 });
    expect(r.indicadores.map((i) => i.valor)).toEqual([null, null, 0]);
    expect(r.cumpleTodos).toBeNull();
  });
  it("cifras en formato colombiano", () => {
    expect(parsePesosCO("1.234.567,89")).toBe(1234567.89);
    expect(parsePesosCO("$ 1.234.567")).toBe(1234567);
    expect(parsePesosCO("-25.000.000")).toBe(-25000000);
    expect(parsePesosCO("1234.5")).toBe(1234.5);
    expect(parsePesosCO("abc")).toBeNull();
    expect(parsePesosCO("1.2.3,4,5")).toBeNull();
  });
});
