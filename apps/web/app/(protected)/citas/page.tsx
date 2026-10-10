import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, format } from "date-fns";
import { requireUsuario, esAdministrador } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CitaDialog } from "./cita-dialog";
import { BloqueoDialog } from "./bloqueo-dialog";
import { FiltrosAgenda } from "./filtros-agenda";
import { AgendaCalendario } from "./agenda-calendario";
import { AtencionSinCitaDialog } from "../atenciones/atencion-sin-cita-dialog";
import { nombreCompleto, type CitaRow } from "./tipos";
import { hoy } from "@/lib/format";
import { getSedesActivas, getMediosPagoActivos, getTiposTratamientoActivos } from "@/lib/catalogos";
import { tieneInfoPendiente } from "@/lib/pacientes/completitud";
import { getPacientesActivosParaPicker } from "@/lib/pacientes/picker";
import { ExportarXlsxLink } from "../_components/exportar-xlsx-link";

type Vista = "day" | "week" | "month";

function parsearFechaISO(fechaISO: string) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function rangoConsulta(fecha: Date, vista: Vista) {
  if (vista === "day") return { desde: fecha, hasta: fecha };
  if (vista === "week") {
    return {
      desde: startOfWeek(fecha, { weekStartsOn: 1 }),
      hasta: endOfWeek(fecha, { weekStartsOn: 1 }),
    };
  }
  return {
    desde: startOfWeek(startOfMonth(fecha), { weekStartsOn: 1 }),
    hasta: endOfWeek(endOfMonth(fecha), { weekStartsOn: 1 }),
  };
}

export default async function CitasPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; vista?: string; sedeId?: string; profesionalId?: string }>;
}) {
  const usuario = await requireUsuario();
  const {
    fecha: fechaParam,
    vista: vistaParam,
    sedeId,
    profesionalId,
  } = await searchParams;
  const fechaISO = fechaParam || hoy();
  const fecha = parsearFechaISO(fechaISO);
  const vista: Vista = vistaParam === "day" || vistaParam === "month" ? vistaParam : "week";
  const supabase = await createClient();

  const { data: puedeVer } = await supabase.rpc("has_permission", {
    modulo_code: "citas",
    permiso_code: "VIEW",
  });

  if (!puedeVer) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No tienes permiso para ver esta página.</AlertDescription>
      </Alert>
    );
  }

  const { desde, hasta } = rangoConsulta(fecha, vista);

  const [
    { data: puedeCrear },
    { data: puedeEditar },
    { data: puedeCrearTratamiento },
    { data: puedeAnularTratamiento },
    { data: puedeRegistrarConsumo },
    { data: puedeRevertirConsumo },
    { data: tieneEntitlementAnexos },
    pacientesData,
    { data: profesionalesData },
    { data: consultoriosData },
    sedesData,
    tiposTratamientoData,
    mediosPagoData,
    { data: insumosData },
    { data: lotesData },
  ] = await Promise.all([
    supabase.rpc("has_permission", { modulo_code: "citas", permiso_code: "CREATE" }),
    supabase.rpc("has_permission", { modulo_code: "citas", permiso_code: "EDIT" }),
    supabase.rpc("has_permission", { modulo_code: "tratamientos", permiso_code: "CREATE" }),
    supabase.rpc("has_permission", { modulo_code: "tratamientos", permiso_code: "VOID" }),
    supabase.rpc("has_permission", { modulo_code: "inventario", permiso_code: "CREATE" }),
    supabase.rpc("has_permission", { modulo_code: "inventario", permiso_code: "VOID" }),
    supabase.rpc("has_entitlement", { modulo_code: "tratamientos", feature_code: "anexos" }),
    getPacientesActivosParaPicker(supabase),
    supabase.from("usuarios").select("id, nombre").eq("activo", true).order("nombre"),
    supabase
      .from("consultorios")
      .select("id, nombre, sede_id")
      .eq("activo", true)
      .order("orden"),
    getSedesActivas(supabase),
    getTiposTratamientoActivos(supabase),
    getMediosPagoActivos(supabase),
    supabase.from("insumos").select("id, nombre").eq("activo", true).order("orden"),
    supabase
      .from("lotes")
      .select("id, insumo_id, sede_id, numero_lote, cantidad_actual")
      .eq("activo", true),
  ]);

  // consultorio_id es opcional en un bloqueo de día completo (no depende
  // de una sala) — usar !inner (join obligatorio) los excluiría siempre
  // que no se esté filtrando por sede, así que solo se usa cuando hace
  // falta para poder filtrar por consultorios.sede_id.
  const embedConsultorio = sedeId
    ? "consultorios!inner(nombre, sede_id, sedes(nombre))"
    : "consultorios(nombre, sede_id, sedes(nombre))";

  let query = supabase
    .from("citas")
    .select(
      `id, fecha, hora_inicio, hora_fin, estado, es_bloqueo, motivo, todo_el_dia,
       paciente_id, profesional_id, tipo_tratamiento_id,
       pacientes(primer_nombre, segundo_nombre, primer_apellido, segundo_apellido),
       tipos_tratamiento(nombre),
       ${embedConsultorio},
       profesional:usuarios!citas_profesional_id_fkey(nombre),
       atenciones(id)`,
    )
    .gte("fecha", format(desde, "yyyy-MM-dd"))
    .lte("fecha", format(hasta, "yyyy-MM-dd"))
    .order("hora_inicio");

  if (sedeId) query = query.eq("consultorios.sede_id", sedeId);
  if (profesionalId) query = query.eq("profesional_id", profesionalId);

  const { data: citasData } = await query;

  const pacientes = (pacientesData ?? []).map((p) => ({ id: p.id, nombre: nombreCompleto(p) }));
  const pacientesPendientes = new Set(
    (pacientesData ?? []).filter(tieneInfoPendiente).map((p) => p.id),
  );
  const profesionales = profesionalesData ?? [];
  const consultorios = consultoriosData ?? [];
  const sedes = sedesData ?? [];
  const tiposTratamiento = tiposTratamientoData ?? [];
  const mediosPago = mediosPagoData ?? [];
  const insumos = insumosData ?? [];
  const lotes = lotesData ?? [];
  const puedeEliminarArchivos = esAdministrador(usuario);
  const puedeVerAnulados = esAdministrador(usuario);
  const citas = (citasData ?? []).map((c) => {
    const fila = c as unknown as CitaRow & { atenciones?: { id: string }[] };
    return { ...fila, atencion_id: fila.atenciones?.[0]?.id ?? null };
  });

  return (
    <div className="space-y-6">
      {/* En celular la agenda es la lista del día (AgendaDia) con su propia franja compacta. */}
      <div className="hidden flex-wrap items-start justify-between gap-4 md:flex">
        <div>
          <h1 className="text-2xl font-semibold">Agenda</h1>
          <p className="text-sm text-muted-foreground">
            Citas, bloqueos de horario y su enlace con Tratamientos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {esAdministrador(usuario) ? (
            <ExportarXlsxLink
              href={`/api/exportar/citas?${new URLSearchParams({
                desde: format(desde, "yyyy-MM-dd"),
                hasta: format(hasta, "yyyy-MM-dd"),
                ...(sedeId ? { sedeId } : {}),
                ...(profesionalId ? { profesionalId } : {}),
              }).toString()}`}
            />
          ) : null}
          {puedeCrear ? (
            <BloqueoDialog
              profesionales={profesionales}
              consultorios={consultorios}
              sedes={sedes}
              fechaSeleccionada={fechaISO}
              trigger={<Button variant="outline">Bloquear horario</Button>}
            />
          ) : null}
          {puedeCrear ? (
            <CitaDialog
              pacientes={pacientes}
              profesionales={profesionales}
              consultorios={consultorios}
              sedes={sedes}
              tiposTratamiento={tiposTratamiento}
              fechaSeleccionada={fechaISO}
              pacientesPendientes={pacientesPendientes}
              trigger={<Button>Nueva cita</Button>}
            />
          ) : null}
          {puedeCrearTratamiento ? (
            <AtencionSinCitaDialog
              pacientes={pacientes}
              profesionales={profesionales}
              usuarioActualId={usuario.id}
              tiposTratamiento={tiposTratamiento}
              sedes={sedes}
              mediosPago={mediosPago}
              insumos={insumos}
              lotes={lotes}
              puedeCrearTratamiento={!!puedeCrearTratamiento}
              puedeAnularTratamiento={!!puedeAnularTratamiento}
              puedeVerAnulados={puedeVerAnulados}
              puedeRegistrarConsumo={!!puedeRegistrarConsumo}
              puedeRevertirConsumo={!!puedeRevertirConsumo}
              puedeEliminarArchivos={puedeEliminarArchivos}
              tieneEntitlementAnexos={!!tieneEntitlementAnexos}
              pacientesPendientes={pacientesPendientes}
              trigger={<Button variant="outline">Atención sin cita</Button>}
            />
          ) : null}
        </div>
      </div>

      <div className="hidden md:block">
        <FiltrosAgenda sedes={sedes} profesionales={profesionales} />
      </div>

      <AgendaCalendario
        citas={citas}
        vista={vista}
        fecha={fecha}
        puedeEditar={!!puedeEditar}
        puedeCrear={!!puedeCrear}
        puedeCrearTratamiento={!!puedeCrearTratamiento}
        puedeAnularTratamiento={!!puedeAnularTratamiento}
        puedeVerAnulados={puedeVerAnulados}
        pacientes={pacientes}
        tiposTratamiento={tiposTratamiento}
        profesionales={profesionales}
        consultorios={consultorios}
        sedes={sedes}
        mediosPago={mediosPago}
        usuarioActualId={usuario.id}
        pacientesPendientes={pacientesPendientes}
        insumos={insumos}
        lotes={lotes}
        puedeRegistrarConsumo={!!puedeRegistrarConsumo}
        puedeRevertirConsumo={!!puedeRevertirConsumo}
        puedeEliminarArchivos={puedeEliminarArchivos}
        tieneEntitlementAnexos={!!tieneEntitlementAnexos}
      />
    </div>
  );
}
