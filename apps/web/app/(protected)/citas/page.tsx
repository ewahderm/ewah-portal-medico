import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, format } from "date-fns";
import { requireUsuario } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CitaDialog } from "./cita-dialog";
import { BloqueoDialog } from "./bloqueo-dialog";
import { FiltrosAgenda } from "./filtros-agenda";
import { AgendaCalendario } from "./agenda-calendario";
import { nombreCompleto, type CitaRow } from "./tipos";

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
    { data: pacientesData },
    { data: profesionalesData },
    { data: consultoriosData },
    { data: sedesData },
    { data: tiposTratamientoData },
  ] = await Promise.all([
    supabase.rpc("has_permission", { modulo_code: "citas", permiso_code: "CREATE" }),
    supabase.rpc("has_permission", { modulo_code: "citas", permiso_code: "EDIT" }),
    supabase.rpc("has_permission", { modulo_code: "tratamientos", permiso_code: "CREATE" }),
    supabase
      .from("pacientes")
      .select("id, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido")
      .eq("activo", true)
      .order("primer_apellido"),
    supabase.from("usuarios").select("id, nombre").eq("activo", true).order("nombre"),
    supabase
      .from("consultorios")
      .select("id, nombre")
      .eq("activo", true)
      .order("orden"),
    supabase.from("sedes").select("id, nombre").eq("activo", true).order("orden"),
    supabase
      .from("tipos_tratamiento")
      .select("id, nombre")
      .eq("activo", true)
      .order("orden"),
  ]);

  let query = supabase
    .from("citas")
    .select(
      `id, fecha, hora_inicio, hora_fin, estado, es_bloqueo, motivo,
       paciente_id, profesional_id, tipo_tratamiento_id,
       pacientes(primer_nombre, segundo_nombre, primer_apellido, segundo_apellido),
       tipos_tratamiento(nombre),
       consultorios!inner(nombre, sedes(nombre)),
       profesional:usuarios!citas_profesional_id_fkey(nombre)`,
    )
    .gte("fecha", format(desde, "yyyy-MM-dd"))
    .lte("fecha", format(hasta, "yyyy-MM-dd"))
    .order("hora_inicio");

  if (sedeId) query = query.eq("consultorios.sede_id", sedeId);
  if (profesionalId) query = query.eq("profesional_id", profesionalId);

  const { data: citasData } = await query;

  const pacientes = (pacientesData ?? []).map((p) => ({ id: p.id, nombre: nombreCompleto(p) }));
  const profesionales = profesionalesData ?? [];
  const consultorios = consultoriosData ?? [];
  const sedes = sedesData ?? [];
  const tiposTratamiento = tiposTratamientoData ?? [];
  const citas = (citasData ?? []) as unknown as CitaRow[];

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
              fechaSeleccionada={fechaISO}
              trigger={<Button variant="outline">Bloquear horario</Button>}
            />
          ) : null}
          {puedeCrear ? (
            <CitaDialog
              pacientes={pacientes}
              profesionales={profesionales}
              consultorios={consultorios}
              tiposTratamiento={tiposTratamiento}
              fechaSeleccionada={fechaISO}
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
        usuarioActualId={usuario.id}
      />
    </div>
  );
}
