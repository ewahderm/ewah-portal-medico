import { requireUsuario, esAdministrador } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { nombreCompleto } from "@/lib/pacientes/nombre";
import { formatoMoneda } from "@/lib/format";
import { getSedesActivas, getMediosPagoActivos, getTiposTratamientoActivos } from "@/lib/catalogos";
import { tieneInfoPendiente } from "@/lib/pacientes/completitud";
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
import { RevertirAnulacionButton } from "./revertir-anulacion-button";
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
    { data: puedeRevertirConsumo },
    { data: tieneEntitlementAnexos },
    { data: pacientesData },
    tiposTratamiento,
    { data: profesionales },
    sedes,
    mediosPago,
    { data: insumosData },
    { data: lotesData },
    { data: fotosData },
    { data: anexosData },
    { data: tratamientos },
  ] = await Promise.all([
    supabase.rpc("has_permission", { modulo_code: "tratamientos", permiso_code: "CREATE" }),
    supabase.rpc("has_permission", { modulo_code: "tratamientos", permiso_code: "VOID" }),
    supabase.rpc("has_permission", { modulo_code: "inventario", permiso_code: "CREATE" }),
    supabase.rpc("has_permission", { modulo_code: "inventario", permiso_code: "VOID" }),
    supabase.rpc("has_entitlement", { modulo_code: "tratamientos", feature_code: "anexos" }),
    supabase
      .from("pacientes")
      .select(
        "id, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, tipo_identificacion_id, numero_identificacion, email, telefono1",
      )
      .eq("activo", true)
      .order("primer_apellido"),
    getTiposTratamientoActivos(supabase),
    supabase.from("usuarios").select("id, nombre").eq("activo", true).order("nombre"),
    getSedesActivas(supabase),
    getMediosPagoActivos(supabase),
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

  const puedeVerAnulados = esAdministrador(usuario);
  const historialCompleto = (tratamientos ?? []) as unknown as TratamientoRow[];
  const historial = puedeVerAnulados
    ? historialCompleto
    : historialCompleto.filter((t) => !t.anulado);
  const pacientes = (pacientesData ?? []).map((p) => ({ id: p.id, nombre: nombreCompleto(p) }));
  const pacientesPendientes = new Set(
    (pacientesData ?? []).filter(tieneInfoPendiente).map((p) => p.id),
  );
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
            pacientesPendientes={pacientesPendientes}
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
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {historial.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-muted-foreground">{t.fecha}</TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      {t.pacientes ? nombreCompleto(t.pacientes) : "—"}
                      {pacientesPendientes.has(t.paciente_id) ? (
                        <Badge variant="outline" className="text-amber-600">
                          Información pendiente
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span
                        className={t.anulado ? "text-muted-foreground line-through" : ""}
                      >
                        {t.tipos_tratamiento?.nombre ?? "—"}
                      </span>
                      {t.anulado ? (
                        <span className="text-xs text-muted-foreground">
                          Anulado{t.anulado_motivo ? `: ${t.anulado_motivo}` : ""}
                        </span>
                      ) : null}
                    </div>
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
                  {/* Sin flex-wrap a propósito: en una tabla de layout "auto"
                      un <td> flex que puede envolver se encoge hasta el ancho
                      de un solo botón (el motor de columnas lo trata como
                      infinitamente comprimible), apilando los 5 botones en
                      una sola columna vertical. Sin wrap, el contenedor de
                      la tabla (overflow-x-auto) hace scroll horizontal en
                      vez de apilar. */}
                  <TableCell className="flex justify-end gap-2 text-right">
                    <InsumosDialog
                      tratamientoId={t.id}
                      sedeId={t.sede_id}
                      insumos={insumos}
                      lotes={lotes}
                      puedeRegistrar={!!puedeRegistrarConsumo}
                      puedeRevertir={!!puedeRevertirConsumo}
                    />
                    <FotosDialog
                      tratamientoId={t.id}
                      puedeSubir={!!puedeCrear}
                      puedeEliminar={!!usuario.roles && usuario.roles.nivel === 1}
                      tieneArchivos={tratamientosConFotos.has(t.id)}
                    />
                    <AnexosDialog
                      tratamientoId={t.id}
                      puedeSubir={!!puedeCrear}
                      puedeEliminar={!!usuario.roles && usuario.roles.nivel === 1}
                      tieneArchivos={tratamientosConAnexos.has(t.id)}
                      tieneEntitlement={!!tieneEntitlementAnexos}
                    />
                    {!t.anulado && puedeCrear && puedeAnular ? (
                      <TratamientoDialog
                        pacientes={pacientes}
                        tiposTratamiento={tiposTratamiento ?? []}
                        profesionales={profesionales ?? []}
                        sedes={sedes ?? []}
                        mediosPago={mediosPago ?? []}
                        usuarioActualId={usuario.id}
                        pacientesPendientes={pacientesPendientes}
                        editando={{
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
                            Editar
                          </Button>
                        }
                      />
                    ) : null}
                    {!t.anulado && puedeAnular ? <AnularDialog id={t.id} /> : null}
                    {t.anulado && puedeCrear ? (
                      <TratamientoDialog
                        pacientes={pacientes}
                        tiposTratamiento={tiposTratamiento ?? []}
                        profesionales={profesionales ?? []}
                        sedes={sedes ?? []}
                        mediosPago={mediosPago ?? []}
                        usuarioActualId={usuario.id}
                        pacientesPendientes={pacientesPendientes}
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
                    {t.anulado && puedeVerAnulados ? (
                      <RevertirAnulacionButton id={t.id} />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              {historial.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
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
