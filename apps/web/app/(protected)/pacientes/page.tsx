import { requireUsuario } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { normalizarBusqueda } from "@/lib/pacientes/normalizar";
import { nombreCompleto } from "@/lib/pacientes/nombre";
import {
  getTiposIdentificacionActivos,
  getGenerosActivos,
  getPaisesActivos,
  getCanalesCaptacionActivos,
  getCampanasActivas,
  getEpsActivos,
} from "@/lib/catalogos";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { PacienteDialog } from "./paciente-dialog";
import { ToggleActivoButton } from "./toggle-activo-button";

export default async function PacientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUsuario();
  const { q } = await searchParams;
  const supabase = await createClient();

  const { data: puedeVer } = await supabase.rpc("has_permission", {
    modulo_code: "pacientes",
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
    tiposIdentificacion,
    generos,
    paises,
    canalesCaptacion,
    campanas,
    eps,
  ] = await Promise.all([
    supabase.rpc("has_permission", { modulo_code: "pacientes", permiso_code: "CREATE" }),
    getTiposIdentificacionActivos(supabase),
    getGenerosActivos(supabase),
    getPaisesActivos(supabase),
    getCanalesCaptacionActivos(supabase),
    getCampanasActivas(supabase),
    getEpsActivos(supabase),
  ]);

  const catalogos = {
    tiposIdentificacion,
    generos,
    paises,
    canalesCaptacion,
    campanas,
    eps,
  };

  let query = supabase
    .from("pacientes")
    .select(
      "id, tipo_identificacion_id, numero_identificacion, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, fecha_nacimiento, genero_id, nacionalidad_id, pais_residencia_id, canal_captacion_id, campana_id, eps_id, email, telefono1, telefono2, activo",
    )
    .order("primer_apellido");

  if (q) {
    query = query.ilike("busqueda", `%${normalizarBusqueda(q)}%`);
  }

  const { data: pacientes } = await query;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pacientes</h1>
          <p className="text-sm text-muted-foreground">
            Registro de pacientes de tu clínica.
          </p>
        </div>
        {puedeCrear ? (
          <PacienteDialog
            catalogos={catalogos}
            trigger={<Button>Nuevo paciente</Button>}
          />
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <form method="GET" className="flex gap-2">
              <Input
                name="q"
                defaultValue={q}
                placeholder="Buscar por nombre o número de identificación..."
                className="max-w-sm text-sm font-normal"
              />
              <Button type="submit" variant="outline" size="sm">
                Buscar
              </Button>
            </form>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paciente</TableHead>
                <TableHead>Identificación</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(pacientes ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{nombreCompleto(p)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.numero_identificacion}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.telefono1 ?? p.email ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.activo ? "secondary" : "outline"}>
                      {p.activo ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="flex justify-end gap-2 text-right">
                    <Button variant="outline" size="sm" render={<Link href={`/pacientes/${p.id}`} />}>
                      Ver
                    </Button>
                    <PacienteDialog
                      catalogos={catalogos}
                      paciente={p}
                      trigger={
                        <Button variant="outline" size="sm">
                          Editar
                        </Button>
                      }
                    />
                    <ToggleActivoButton id={p.id} activo={p.activo} />
                  </TableCell>
                </TableRow>
              ))}
              {(pacientes ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    {q ? "No se encontraron pacientes." : "Todavía no hay pacientes registrados."}
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
