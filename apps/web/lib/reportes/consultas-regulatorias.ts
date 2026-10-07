import "server-only";

// Lecturas de los reportes regulatorios (INVIMA y comisiones de nómina).
// No validan acceso: quien las llama (acción del servidor o Route Handler)
// ya pasó por lib/reportes/acceso.ts, y cada llamador exige cosas
// distintas (la descarga en Excel, además, es solo de Administrador).
// Se pagina de a 500 porque PostgREST corta en 1.000 filas sin avisar y un
// reporte regulatorio incompleto es peor que uno lento.

import { createClient } from "@/lib/supabase/server";
import { construirReporteInvima, type InsumoInvima, type InsumoRegulatorioFuente } from "./invima";
import type { ComisionFuente } from "./nomina";

const TAMANO_PAGINA = 500;

export async function cargarReporteInvima(clinicaId: string): Promise<InsumoInvima[]> {
  const supabase = await createClient();
  const filas: InsumoRegulatorioFuente[] = [];
  let desde = 0;

  while (true) {
    const { data, error } = await supabase
      .from("insumos")
      .select("codigo,nombre,unidad_medida,registro_sanitario,unidad_medida_registro_sanitario,fecha_vencimiento_registro_sanitario,referencia_reportada,presentacion_comercial_reportada,reporte_regulatorio,activo")
      .eq("clinica_id", clinicaId)
      .eq("reporte_regulatorio", true)
      .order("nombre", { ascending: true })
      .range(desde, desde + TAMANO_PAGINA - 1);

    if (error) {
      console.error("[reportes] cargarReporteInvima", error);
      throw new Error("No se pudo consultar el inventario marcado para reporte regulatorio.");
    }
    const pagina = (data ?? []) as InsumoRegulatorioFuente[];
    filas.push(...pagina);
    if (pagina.length < TAMANO_PAGINA) break;
    desde += TAMANO_PAGINA;
  }

  return construirReporteInvima(filas);
}

// Solo comprobantes aprobados y no anulados: un borrador todavía se puede
// recalcular o eliminar (0051), así que sus comisiones aún no son un hecho.
export async function cargarComisionesNomina(clinicaId: string, desde: string, hasta: string): Promise<ComisionFuente[]> {
  const supabase = await createClient();
  const filas: ComisionFuente[] = [];
  let inicioPagina = 0;

  while (true) {
    const { data, error } = await supabase
      .from("comprobantes_nomina")
      .select("empleado_id,tipo_periodo,fecha_inicio,fecha_fin,comisiones,anulado,empleados!inner(nombre)")
      .eq("clinica_id", clinicaId)
      .eq("empleados.clinica_id", clinicaId)
      .eq("aprobado", true)
      .eq("anulado", false)
      .gte("fecha_fin", desde)
      .lte("fecha_inicio", hasta)
      .order("fecha_inicio", { ascending: true })
      .range(inicioPagina, inicioPagina + TAMANO_PAGINA - 1);

    if (error) {
      console.error("[reportes] cargarComisionesNomina", error);
      throw new Error("No se pudieron consultar las comisiones registradas en nómina.");
    }
    const pagina = data ?? [];
    for (const fila of pagina) {
      const relacion = fila.empleados;
      const empleado = Array.isArray(relacion) ? relacion[0] : relacion;
      if (!empleado?.nombre) {
        throw new Error("Un comprobante de nómina no tiene un empleado asociado con nombre.");
      }
      filas.push({
        empleadoId: fila.empleado_id,
        empleadoNombre: empleado.nombre,
        tipoPeriodo: fila.tipo_periodo,
        fechaInicio: fila.fecha_inicio,
        fechaFin: fila.fecha_fin,
        comisiones: fila.comisiones,
        anulado: fila.anulado,
      });
    }
    if (pagina.length < TAMANO_PAGINA) break;
    inicioPagina += TAMANO_PAGINA;
  }

  return filas;
}
