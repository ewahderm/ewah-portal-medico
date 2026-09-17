import Link from "next/link";
import { requireUsuario } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CitaDialog } from "./cita-dialog";
import { BloqueoDialog } from "./bloqueo-dialog";
import { EstadoAcciones } from "./estado-acciones";

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

function sumarDias(fechaISO: string, dias: number) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

function formatoFechaLarga(fechaISO: string) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-CO", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function nombreCompleto(p: {
  primer_nombre: string;
  segundo_nombre: string | null;
  primer_apellido: string;
  segundo_apellido: string | null;
}) {
  return [p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido]
    .filter(Boolean)
    .join(" ");
}

const ESTADO_LABEL: Record<string, string> = {
  agendada: "Agendada",
  confirmada: "Confirmada",
  atendida: "Atendida",
  cancelada: "Cancelada",
  no_asistio: "No asistió",
};

const ESTADO_VARIANT: Record<string, "secondary" | "outline"> = {
  agendada: "outline",
  confirmada: "secondary",
  atendida: "secondary",
  cancelada: "outline",
  no_asistio: "outline",
};

type CitaRow = {
  id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: string;
  es_bloqueo: boolean;
  motivo: string | null;
  paciente_id: string | null;
  profesional_id: string;
  tipo_tratamiento_id: string | null;
  pacientes: {
    primer_nombre: string;
    segundo_nombre: string | null;
    primer_apellido: string;
    segundo_apellido: string | null;
  } | null;
  tipos_tratamiento: { nombre: string } | null;
  consultorios: { nombre: string } | null;
  profesional: { nombre: string } | null;
};

export default async function CitasPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const usuario = await requireUsuario();
  const { fecha: fechaParam } = await searchParams;
  const fecha = fechaParam || hoy();
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

  const [
    { data: puedeCrear },
    { data: puedeEditar },
    { data: puedeCrearTratamiento },
    { data: pacientesData },
    { data: profesionalesData },
    { data: consultoriosData },
    { data: tiposTratamientoData },
    { data: citasData },
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
    supabase
      .from("tipos_tratamiento")
      .select("id, nombre")
      .eq("activo", true)
      .order("orden"),
    supabase
      .from("citas")
      .select(
        `id, fecha, hora_inicio, hora_fin, estado, es_bloqueo, motivo,
         paciente_id, profesional_id, tipo_tratamiento_id,
         pacientes(primer_nombre, segundo_nombre, primer_apellido, segundo_apellido),
         tipos_tratamiento(nombre),
         consultorios(nombre),
         profesional:usuarios!citas_profesional_id_fkey(nombre)`,
      )
      .eq("fecha", fecha)
      .order("hora_inicio"),
  ]);

  const pacientes = (pacientesData ?? []).map((p) => ({ id: p.id, nombre: nombreCompleto(p) }));
  const profesionales = profesionalesData ?? [];
  const consultorios = consultoriosData ?? [];
  const tiposTratamiento = tiposTratamientoData ?? [];
  const citas = (citasData ?? []) as unknown as CitaRow[];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Agenda</h1>
          <p className="text-sm text-muted-foreground capitalize">
            {formatoFechaLarga(fecha)}
          </p>
        </div>
        <div className="flex gap-2">
          {puedeCrear ? (
            <BloqueoDialog
              profesionales={profesionales}
              consultorios={consultorios}
              fechaSeleccionada={fecha}
              trigger={<Button variant="outline">Bloquear horario</Button>}
            />
          ) : null}
          {puedeCrear ? (
            <CitaDialog
              pacientes={pacientes}
              profesionales={profesionales}
              consultorios={consultorios}
              tiposTratamiento={tiposTratamiento}
              fechaSeleccionada={fecha}
              trigger={<Button>Nueva cita</Button>}
            />
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          render={<Link href={`/citas?fecha=${sumarDias(fecha, -1)}`} />}
        >
          ← Día anterior
        </Button>
        <Button variant="outline" size="sm" render={<Link href={`/citas?fecha=${hoy()}`} />}>
          Hoy
        </Button>
        <Button
          variant="outline"
          size="sm"
          render={<Link href={`/citas?fecha=${sumarDias(fecha, 1)}`} />}
        >
          Día siguiente →
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Citas del día</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hora</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Tratamiento</TableHead>
                <TableHead>Profesional</TableHead>
                <TableHead>Consultorio</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {citas.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-muted-foreground">
                    {c.hora_inicio.slice(0, 5)} – {c.hora_fin.slice(0, 5)}
                  </TableCell>
                  <TableCell className="font-medium">
                    {c.es_bloqueo ? (
                      <span className="text-muted-foreground">
                        Bloqueo{c.motivo ? `: ${c.motivo}` : ""}
                      </span>
                    ) : c.pacientes ? (
                      nombreCompleto(c.pacientes)
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{c.tipos_tratamiento?.nombre ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.profesional?.nombre ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.consultorios?.nombre ?? "—"}
                  </TableCell>
                  <TableCell>
                    {c.es_bloqueo ? (
                      <Badge variant="outline">Bloqueo</Badge>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <Badge variant={ESTADO_VARIANT[c.estado]}>
                          {ESTADO_LABEL[c.estado]}
                        </Badge>
                        {(c.estado === "cancelada" || c.estado === "no_asistio") && c.motivo ? (
                          <span className="text-xs text-muted-foreground">{c.motivo}</span>
                        ) : null}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {c.es_bloqueo ? null : (
                      <EstadoAcciones
                        cita={c}
                        puedeEditar={!!puedeEditar}
                        puedeCrearTratamiento={!!puedeCrearTratamiento}
                        pacientes={pacientes}
                        tiposTratamiento={tiposTratamiento}
                        profesionales={profesionales}
                        usuarioActualId={usuario.id}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {citas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No hay citas agendadas para este día.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
