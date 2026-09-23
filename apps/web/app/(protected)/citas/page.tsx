import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, format } from "date-fns";
import { requireUsuario, esAdministrador } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CitaDialog } from "./cita-dialog";
import { BloqueoDialog } from "./bloqueo-dialog";
import { FiltrosAgenda } from "./filtros-agenda";
import { AgendaCalendario } from "./agenda-calendario";
import { nombreCompleto, type CitaRow } from "./tipos";
import { getSedesActivas, getMediosPagoActivos, getTiposTratamientoActivos } from "@/lib/catalogos";
import { tieneInfoPendiente } from "@/lib/pacientes/completitud";

type Vista = "day" | "week" | "month";

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

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
  const fechaISO = fechaParam || hoyISO();
  const fecha = parsearFechaISO(fechaISO);
  const vista: Vista = vistaParam === "week" || vistaParam === "month" ? vistaParam : "day";
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
    { data: puedeRegistrarConsumo },
    { data: puedeRevertirConsumo },
    { data: pacientesData },
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
    supabase.rpc("has_permission", { modulo_code: "inventario", permiso_code: "CREATE" }),
    supabase.rpc("has_permission", { modulo_code: "inventario", permiso_code: "VOID" }),
    supabase
      .from("pacientes")
      .select(
        "id, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, tipo_identificacion_id, numero_identificacion, email, telefono1",
      )
      .eq("activo", true)
      .order("primer_apellido"),
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
       tratamientos(count)`,
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
  const citas = (citasData ?? []).map((c) => {
    const fila = c as unknown as CitaRow & { tratamientos?: { count: number }[] };
    return { ...fila, tratamientos_count: fila.tratamientos?.[0]?.count ?? 0 };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Agenda</h1>
          <p className="text-sm text-muted-foreground">
            Citas, bloqueos de horario y su enlace con Tratamientos.
          </p>
        </div>
        <div className="flex gap-2">
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
        </div>
      </div>

      <FiltrosAgenda sedes={sedes} profesionales={profesionales} />

      <AgendaCalendario
        citas={citas}
        vista={vista}
        fecha={fecha}
        puedeEditar={!!puedeEditar}
        puedeCrear={!!puedeCrear}
        puedeCrearTratamiento={!!puedeCrearTratamiento}
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
      />
    </div>
  );
}
