// Arma el checklist de documentos (lo esperado por reglas + lo que ya hay
// en hab_documentos_clinica) y su resumen. Puro: lo usan la página de
// Documentos y el paso 3 de la ruta, con el mismo cálculo.

import {
  claveRenglon,
  documentosAplicables,
  type ContextoDocumentos,
} from "@/lib/habilitacion/reglas-documentos";
import { estadoDocumento, type EstadoDocumento } from "@/lib/habilitacion/estado-documento";
import type {
  DocumentoCatalogo,
  DocumentoClinica,
  PerfilPrestador,
  SedeConServicios,
  VersionDocumento,
} from "@/lib/habilitacion/tipos";

export type ItemChecklist = {
  clave: string;
  catalogo: DocumentoCatalogo | null;
  nombre: string;
  sede: { id: string; nombre: string } | null;
  servicio: { id: string; nombre: string } | null;
  // si / por_confirmar: lo pide la norma; ya_no_aplica: hay algo cargado
  // pero tu perfil cambió; adicional: lo agregaste tú.
  aplica: "si" | "por_confirmar" | "ya_no_aplica" | "adicional";
  motivo: string | null;
  renglon: DocumentoClinica | null;
  vigente: VersionDocumento | null;
  estado: EstadoDocumento;
};

export function contextoDocumentos(
  perfil: PerfilPrestador | null,
  personaJuridica: boolean | null,
  sedes: SedeConServicios[],
): ContextoDocumentos {
  return {
    tipoPrestador: perfil?.tipo_prestador ?? null,
    personaJuridica,
    naturaleza: perfil?.naturaleza ?? null,
    esEsal: perfil?.es_esal ?? null,
    esCooperacionInternacional: perfil?.es_cooperacion_internacional ?? null,
    tieneSedesOtrosDepartamentos: perfil?.tiene_sedes_otros_departamentos ?? null,
    esIpsNueva: perfil?.es_ips_nueva ?? null,
    sedes: sedes.map((s) => ({
      id: s.id,
      nombre: s.nombre,
      uso_edificacion: s.uso_edificacion,
      fecha_construccion: s.fecha_construccion_intervencion,
      servicios: s.servicios.map((v) => ({
        id: v.id,
        nombre: v.practicas_medicas?.nombre ?? "Servicio",
        clave: v.hab_servicios_norma?.clave ?? null,
        estado: v.estado,
        modalidades: v.modalidades,
        telemedicina_roles: v.telemedicina_roles,
      })),
    })),
  };
}

export function armarChecklist(
  catalogo: DocumentoCatalogo[],
  renglones: DocumentoClinica[],
  ctx: ContextoDocumentos,
  fechaPlaneadaRadicacion: string | null,
  hoy: string,
  // Las versiones de documentos financieros solo las lee quien tiene EDIT (RLS 0068).
  puedeVerFinanciero = true,
): ItemChecklist[] {
  const porClave = new Map(renglones.filter((r) => r.documento_catalogo_id).map((r) => [claveRenglon(r.documento_catalogo_id, r.sede_id, r.servicio_habilitado_id), r]));
  const porCatalogo = new Map(catalogo.map((c) => [c.id, c]));
  const nombreSede = new Map(ctx.sedes.map((s) => [s.id, s.nombre]));
  const nombreServicio = new Map(ctx.sedes.flatMap((s) => s.servicios.map((v) => [v.id, `${v.nombre} · ${s.nombre}`] as const)));
  const usados = new Set<string>();

  const item = (
    clave: string,
    catalogoDoc: DocumentoCatalogo | null,
    renglon: DocumentoClinica | null,
    extra: Pick<ItemChecklist, "nombre" | "sede" | "servicio" | "aplica" | "motivo">,
  ): ItemChecklist => {
    const vigente = renglon?.versiones[0] ?? null;
    return {
      clave,
      catalogo: catalogoDoc,
      renglon,
      vigente,
      estado:
        !puedeVerFinanciero && catalogoDoc?.es_financiero && !vigente && !renglon?.no_aplica
          ? { estado: "sin_permiso", detalle: "Documento financiero: solo lo ve quien tiene permiso de edición en Habilitación." }
          : estadoDocumento(catalogoDoc, renglon, vigente, fechaPlaneadaRadicacion, hoy),
      ...extra,
    };
  };

  const items: ItemChecklist[] = documentosAplicables(catalogo, ctx).map((e) => {
    const clave = claveRenglon(e.catalogo.id, e.sede?.id ?? null, e.servicio?.id ?? null);
    usados.add(clave);
    return item(clave, e.catalogo, porClave.get(clave) ?? null, {
      nombre: e.catalogo.nombre_corto,
      sede: e.sede,
      servicio: e.servicio ? { id: e.servicio.id, nombre: nombreServicio.get(e.servicio.id) ?? e.servicio.nombre } : null,
      aplica: e.aplica,
      motivo: e.motivo,
    });
  });

  for (const r of renglones) {
    if (!r.documento_catalogo_id) {
      items.push(
        item(`adicional|${r.id}`, null, r, {
          nombre: r.nombre_adicional ?? "Documento adicional",
          sede: r.sede_id ? { id: r.sede_id, nombre: nombreSede.get(r.sede_id) ?? "Sede" } : null,
          servicio: null,
          aplica: "adicional",
          motivo: null,
        }),
      );
      continue;
    }
    const clave = claveRenglon(r.documento_catalogo_id, r.sede_id, r.servicio_habilitado_id);
    if (usados.has(clave) || (r.versiones.length === 0 && !r.no_aplica)) continue;
    const c = porCatalogo.get(r.documento_catalogo_id) ?? null;
    items.push(
      item(clave, c, r, {
        nombre: c?.nombre_corto ?? "Documento",
        sede: r.sede_id ? { id: r.sede_id, nombre: nombreSede.get(r.sede_id) ?? "Sede" } : null,
        servicio: r.servicio_habilitado_id ? { id: r.servicio_habilitado_id, nombre: nombreServicio.get(r.servicio_habilitado_id) ?? "Servicio" } : null,
        aplica: "ya_no_aplica",
        motivo: "Ya no aplica a tu tipo de prestador o a lo que declaraste; lo cargado se conserva.",
      }),
    );
  }
  return items;
}

// Paso 3 de la ruta: documentos para radicar listos (cargados vigentes o
// marcados "No aplica") sobre los que pide la norma.
export function resumenChecklist(items: ItemChecklist[]) {
  // Los "sin permiso" no se pueden juzgar: no cuentan ni como listos ni como faltantes.
  const radicar = items.filter(
    (i) => (i.aplica === "si" || i.aplica === "por_confirmar") && i.catalogo?.seccion === "radicar" && i.estado.estado !== "sin_permiso",
  );
  const listos = radicar.filter((i) => ["cargado", "por_vencer", "no_aplica"].includes(i.estado.estado)).length;
  const vencidos = items.filter((i) => i.aplica !== "ya_no_aplica" && i.estado.estado === "vencido").length;
  const porVencer = items.filter((i) => i.aplica !== "ya_no_aplica" && i.estado.estado === "por_vencer").length;
  return { total: radicar.length, listos, vencidos, porVencer };
}
