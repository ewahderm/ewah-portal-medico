import { CameraIcon, PaperclipIcon } from "lucide-react";
import { requireUsuario } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { nombreCompleto } from "@/lib/pacientes/nombre";
import { formatoMoneda } from "@/lib/format";
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
import { TratamientoDialog } from "./tratamiento-dialog";
import { AnularDialog } from "./anular-dialog";
import { FotosDialog } from "./fotos-dialog";
import { AnexosDialog } from "./anexos-dialog";
import { InsumosDialog } from "./insumos-dialog";

type TratamientoRow = {
  id: string;
  fecha: string;
  edad_paciente: number | null;
  costo: number | null;
  notas: string | null;
  cufe: string | null;
  anulado: boolean;
  anulado_motivo: string | null;
  corrige_a: string | null;
  paciente_id: string;
  tipo_tratamiento_id: string;
  profesional_id: string;
  sede_id: string;
  medio_pago_id: string;
  pacientes: {
    primer_nombre: string;
    segundo_nombre: string | null;
    primer_apellido: string;
    segundo_apellido: string | null;
  } | null;
  tipos_tratamiento: { nombre: string } | null;
  profesional: { nombre: string } | null;
  sedes: { nombre: string } | null;
};

export default async function TratamientosPage() {
  const usuario = await requireUsuario();
  const supabase = await createClient();

  const { data: puedeVer } = await supabase.rpc("has_permission", {
    modulo_code: "tratamientos",
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
    { data: puedeAnular },
    { data: puedeRegistrarConsumo },
    { data: pacientesData },
    { data: tiposTratamiento },
    { data: profesionales },
    { data: sedes },
    { data: mediosPago },
    { data: insumosData },
    { data: lotesData },
    { data: fotosData },
    { data: anexosData },
    { data: tratamientos },
  ] = await Promise.all([
    supabase.rpc("has_permission", { modulo_code: "tratamientos", permiso_code: "CREATE" }),
    supabase.rpc("has_permission", { modulo_code: "tratamientos", permiso_code: "VOID" }),
    supabase.rpc("has_permission", { modulo_code: "inventario", permiso_code: "CREATE" }),
    supabase
      .from("pacientes")
      .select("id, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido")
      .eq("activo", true)
      .order("primer_apellido"),
    supabase
      .from("tipos_tratamiento")
      .select("id, nombre")
      .eq("activo", true)
      .order("orden"),
    supabase.from("usuarios").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("sedes").select("id, nombre").eq("activo", true).order("orden"),
    supabase.from("medios_pago").select("id, nombre").eq("activo", true).order("orden"),
    supabase.from("insumos").select("id, nombre").eq("activo", true).order("orden"),
    supabase
      .from("lotes")
      .select("id, insumo_id, sede_id, numero_lote, cantidad_actual")
      .eq("activo", true),
    supabase.from("tratamiento_fotos").select("tratamiento_id"),
    supabase.from("tratamiento_anexos").select("tratamiento_id"),
    supabase
      .from("tratamientos")
      .select(
        `id, fecha, edad_paciente, costo, notas, cufe, anulado, anulado_motivo, corrige_a,
         paciente_id, tipo_tratamiento_id, profesional_id, sede_id, medio_pago_id,
         pacientes(primer_nombre, segundo_nombre, primer_apellido, segundo_apellido),
         tipos_tratamiento(nombre),
         sedes(nombre),
         profesional:usuarios!tratamientos_profesional_id_fkey(nombre)`,
      )
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const historial = (tratamientos ?? []) as unknown as TratamientoRow[];
  const pacientes = (pacientesData ?? []).map((p) => ({ id: p.id, nombre: nombreCompleto(p) }));
  const insumos = insumosData ?? [];
  const lotes = lotesData ?? [];
  const tratamientosConFotos = new Set((fotosData ?? []).map((f) => f.tratamiento_id));
  const tratamientosConAnexos = new Set((anexosData ?? []).map((a) => a.tratamiento_id));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tratamientos</h1>
          <p className="text-sm text-muted-foreground">
            Historia clínica de tratamientos realizados. Un registro guardado no se
            edita: se anula (con motivo) y se corrige con uno nuevo.
          </p>
        </div>
        {puedeCrear ? (
          <TratamientoDialog
            pacientes={pacientes}
            tiposTratamiento={tiposTratamiento ?? []}
            profesionales={profesionales ?? []}
            sedes={sedes ?? []}
            mediosPago={mediosPago ?? []}
            usuarioActualId={usuario.id}
            trigger={<Button>Nuevo tratamiento</Button>}
          />
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Historial</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Tratamiento</TableHead>
                <TableHead>Sede</TableHead>
                <TableHead>Profesional</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Observaciones</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {historial.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-muted-foreground">{t.fecha}</TableCell>
                  <TableCell className="font-medium">
                    {t.pacientes ? nombreCompleto(t.pacientes) : "—"}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      {t.tipos_tratamiento?.nombre ?? "—"}
                      {tratamientosConFotos.has(t.id) ? (
                        <CameraIcon
                          className="size-3.5 text-muted-foreground"
                          aria-label="Tiene fotos"
                        />
                      ) : null}
                      {tratamientosConAnexos.has(t.id) ? (
                        <PaperclipIcon
                          className="size-3.5 text-muted-foreground"
                          aria-label="Tiene anexos"
                        />
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{t.sedes?.nombre ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.profesional?.nombre ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatoMoneda(t.costo)}
                  </TableCell>
                  <TableCell className="max-w-xs text-muted-foreground">
                    {t.notas ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant={t.anulado ? "outline" : "secondary"}>
                        {t.anulado ? "Anulado" : "Vigente"}
                      </Badge>
                      {t.anulado && t.anulado_motivo ? (
                        <span className="text-xs text-muted-foreground">
                          {t.anulado_motivo}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="flex justify-end gap-2 text-right">
                    <InsumosDialog
                      tratamientoId={t.id}
                      sedeId={t.sede_id}
                      insumos={insumos}
                      lotes={lotes}
                      puedeRegistrar={!!puedeRegistrarConsumo}
                    />
                    <FotosDialog
                      tratamientoId={t.id}
                      puedeSubir={!!puedeCrear}
                      puedeEliminar={!!usuario.roles && usuario.roles.nivel === 1}
                    />
                    <AnexosDialog
                      tratamientoId={t.id}
                      puedeSubir={!!puedeCrear}
                      puedeEliminar={!!usuario.roles && usuario.roles.nivel === 1}
                    />
                    {!t.anulado && puedeAnular ? <AnularDialog id={t.id} /> : null}
                    {t.anulado && puedeCrear ? (
                      <TratamientoDialog
                        pacientes={pacientes}
                        tiposTratamiento={tiposTratamiento ?? []}
                        profesionales={profesionales ?? []}
                        sedes={sedes ?? []}
                        mediosPago={mediosPago ?? []}
                        usuarioActualId={usuario.id}
                        corrigiendo={{
                          id: t.id,
                          paciente_id: t.paciente_id,
                          tipo_tratamiento_id: t.tipo_tratamiento_id,
                          profesional_id: t.profesional_id,
                          sede_id: t.sede_id,
                          medio_pago_id: t.medio_pago_id,
                          fecha: t.fecha,
                          costo: t.costo,
                          notas: t.notas,
                          cufe: t.cufe,
                        }}
                        trigger={
                          <Button variant="outline" size="sm">
                            Corregir
                          </Button>
                        }
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              {historial.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    Todavía no hay tratamientos registrados.
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
