// Qué documentos de inscripción le aplican a la clínica (HU-3.1, §3.3).
// Puro: evalúa los códigos de condición CERRADOS de hab_documentos_catalogo
// sobre lo ya leído de la BD. Solo decide PRESENTACIÓN (no crea alertas ni
// decide permisos). Ante la duda (dato que falta) el documento aparece como
// "por confirmar": de más, nunca de menos (regla R1 del diseño).

import type { DocumentoCatalogo, TipoPrestadorCatalogo } from "@/lib/habilitacion/tipos";

type TipoPrestador = TipoPrestadorCatalogo["codigo"];

export type ServicioContexto = {
  id: string;
  nombre: string;
  clave: string | null; // numeral de la norma (11.2.2…)
  estado: string;
  modalidades: string[];
  telemedicina_roles: string[];
};

export type SedeContexto = {
  id: string;
  nombre: string;
  uso_edificacion: "exclusivo_salud" | "mixto" | null;
  fecha_construccion: string | null; // "YYYY-MM-DD"
  servicios: ServicioContexto[];
};

export type ContextoDocumentos = {
  tipoPrestador: TipoPrestador | null;
  personaJuridica: boolean | null; // de Datos básicos (tipo de persona)
  naturaleza: "privada" | "publica" | "mixta" | null;
  esEsal: boolean | null;
  esCooperacionInternacional: boolean | null;
  tieneSedesOtrosDepartamentos: boolean | null;
  esIpsNueva: boolean | null;
  sedes: SedeContexto[];
};

export type Aplicacion = "si" | "por_confirmar";

export type RenglonEsperado = {
  catalogo: DocumentoCatalogo;
  sede: { id: string; nombre: string } | null;
  servicio: { id: string; nombre: string } | null;
  aplica: Aplicacion;
  motivo: string | null; // por qué está "por confirmar"
};

// Servicios cuyos equipos generan radiaciones ionizantes (rayos X,
// medicina nuclear, radioterapia, fluoroscopia de hemodinamia). 11.3.4
// genérico entra por la duda (puede ser ionizante o no).
const RADIACIONES = new Set(["11.3.3", "11.3.4", "11.3.4.1", "11.3.5", "11.3.6", "11.3.9"]);
const URGENCIAS_CIRUGIA_UCI = new Set(["11.6.1", "11.5.1", "11.4.5", "11.4.7", "11.4.9"]);
const VEHICULOS = new Set(["11.6.2", "11.6.3"]);

type Resultado = { aplica: boolean | "duda"; motivo?: string };

const SI: Resultado = { aplica: true };
const NO: Resultado = { aplica: false };
const duda = (motivo: string): Resultado => ({ aplica: "duda", motivo });

function activos(s: SedeContexto) {
  return s.servicios.filter((x) => x.estado !== "cerrado");
}

function antesDe(fecha: string | null, limite: string): boolean | null {
  if (!fecha) return null;
  return fecha.slice(0, 10) < limite;
}

// Condición a nivel de clínica (no depende de la sede).
function condicionClinica(c: string, ctx: ContextoDocumentos): Resultado {
  const servicios = ctx.sedes.flatMap(activos);
  const bool = (v: boolean | null, motivo: string) => (v === null ? duda(motivo) : v ? SI : NO);
  switch (c) {
    case "persona_juridica":
      return bool(ctx.personaJuridica, "Indica en Datos básicos si eres persona natural o jurídica.");
    case "persona_natural":
      return bool(ctx.personaJuridica === null ? null : !ctx.personaJuridica, "Indica en Datos básicos si eres persona natural o jurídica.");
    // En transporte especial depende de la persona; para los demás tipos no restringe.
    case "tep_solo_persona_juridica":
      return ctx.tipoPrestador !== "transporte_especial"
        ? SI
        : bool(ctx.personaJuridica, "Indica en Datos básicos si eres persona natural o jurídica.");
    case "tep_solo_persona_natural":
      return ctx.tipoPrestador !== "transporte_especial"
        ? SI
        : bool(ctx.personaJuridica === null ? null : !ctx.personaJuridica, "Indica en Datos básicos si eres persona natural o jurídica.");
    case "entidad_publica":
      return ctx.naturaleza === null ? duda("Indica en tu perfil si eres entidad pública o privada.") : ctx.naturaleza === "publica" ? SI : NO;
    case "esal":
      return bool(ctx.esEsal, "Indica en tu perfil si eres entidad sin ánimo de lucro.");
    case "cooperacion_internacional":
      return ctx.esCooperacionInternacional ? SI : NO;
    case "sedes_otros_departamentos":
      return ctx.tieneSedesOtrosDepartamentos ? SI : NO;
    case "ips_nueva":
      return bool(ctx.esIpsNueva, "Indica en tu perfil si eres una IPS nueva.");
    case "telemedicina":
      return servicios.some((s) => s.modalidades.includes("telemedicina")) ? SI : NO;
    case "telemedicina_remisor":
      return servicios.some((s) => s.modalidades.includes("telemedicina") && s.telemedicina_roles.includes("prestador_remisor"))
        ? SI
        : NO;
    case "radiaciones_ionizantes":
      return servicios.some((s) => s.clave && RADIACIONES.has(s.clave)) ? SI : NO;
    case "vehiculos":
      return ctx.tipoPrestador === "transporte_especial" || servicios.some((s) => s.clave && VEHICULOS.has(s.clave)) ? SI : NO;
    default:
      // Condición de sede: se resuelve aparte; a nivel clínica no restringe.
      return SI;
  }
}

// Condición evaluada para UNA sede (edificación y servicios de esa sede).
function condicionSede(c: string, sede: SedeContexto, ctx: ContextoDocumentos): Resultado {
  const servicios = activos(sede);
  const fechaFaltante = `Completa la fecha de construcción de ${sede.nombre} en Sedes y servicios.`;
  switch (c) {
    case "edificacion_pre_1996_12_02": {
      const a = antesDe(sede.fecha_construccion, "1996-12-02");
      return a === null ? duda(fechaFaltante) : a ? SI : NO;
    }
    case "edificacion_pre_2005_05": {
      const a = antesDe(sede.fecha_construccion, "2005-05-01");
      return a === null ? duda(fechaFaltante) : a ? SI : NO;
    }
    case "edificacion_post_1996_mixta": {
      if (sede.uso_edificacion === "exclusivo_salud") return NO;
      const a = antesDe(sede.fecha_construccion, "1996-12-02");
      if (sede.uso_edificacion === null) return duda(`Indica si la edificación de ${sede.nombre} es de uso exclusivo o mixto.`);
      return a === null ? duda(fechaFaltante) : a ? NO : SI;
    }
    case "edificacion_pre_2010_con_urgencias_cirugia_uci": {
      if (!servicios.some((s) => s.clave && URGENCIAS_CIRUGIA_UCI.has(s.clave))) return NO;
      const a = antesDe(sede.fecha_construccion, "2010-01-01");
      return a === null ? duda(fechaFaltante) : a ? SI : NO;
    }
    case "telemedicina":
      return servicios.some((s) => s.modalidades.includes("telemedicina")) ? SI : NO;
    case "radiaciones_ionizantes":
      return servicios.some((s) => s.clave && RADIACIONES.has(s.clave)) ? SI : NO;
    default:
      return condicionClinica(c, ctx);
  }
}

function combinar(resultados: Resultado[]): Resultado {
  if (resultados.some((r) => r.aplica === false)) return NO;
  const dudas = resultados.filter((r) => r.aplica === "duda");
  if (dudas.length > 0) return duda(dudas.map((d) => d.motivo).join(" "));
  return SI;
}

export function documentosAplicables(catalogo: DocumentoCatalogo[], ctx: ContextoDocumentos): RenglonEsperado[] {
  if (!ctx.tipoPrestador) return [];
  const tipo = ctx.tipoPrestador;
  const renglones: RenglonEsperado[] = [];
  const sedesConServicios = ctx.sedes.filter((s) => activos(s).length > 0);

  for (const d of [...catalogo].sort((a, b) => a.orden - b.orden)) {
    // No verificados (aplica_a vacío) nunca se exigen.
    if (!d.verificado || !d.aplica_a.includes(tipo)) continue;
    const empujar = (r: Resultado, sede: SedeContexto | null, servicio: ServicioContexto | null) => {
      if (r.aplica === false) return;
      renglones.push({
        catalogo: d,
        sede: sede ? { id: sede.id, nombre: sede.nombre } : null,
        servicio: servicio ? { id: servicio.id, nombre: servicio.nombre } : null,
        aplica: r.aplica === "duda" ? "por_confirmar" : "si",
        motivo: r.aplica === "duda" ? (r.motivo ?? null) : null,
      });
    };

    if (d.uno_por_servicio) {
      const clinica = combinar(d.condiciones.map((c) => condicionClinica(c, ctx)));
      for (const sede of sedesConServicios) for (const s of activos(sede)) empujar(clinica, sede, s);
    } else if (d.por_sede) {
      for (const sede of sedesConServicios) empujar(combinar(d.condiciones.map((c) => condicionSede(c, sede, ctx))), sede, null);
    } else {
      // Condición de edificación en un documento de clínica: aplica si
      // alguna sede la cumple.
      const r = combinar(
        d.condiciones.map((c) => {
          if (!c.startsWith("edificacion_")) return condicionClinica(c, ctx);
          const porSede = sedesConServicios.map((s) => condicionSede(c, s, ctx));
          if (porSede.some((x) => x.aplica === true)) return SI;
          const dudas = porSede.filter((x) => x.aplica === "duda");
          return dudas.length ? duda(dudas.map((x) => x.motivo).join(" ")) : NO;
        }),
      );
      empujar(r, null, null);
    }
  }
  return renglones;
}

// Clave estable de un renglón (catálogo + sede + servicio) para cruzar lo
// esperado con lo que ya existe en hab_documentos_clinica.
export function claveRenglon(catalogoId: string | null, sedeId: string | null, servicioId: string | null) {
  return `${catalogoId ?? "-"}|${sedeId ?? "-"}|${servicioId ?? "-"}`;
}
