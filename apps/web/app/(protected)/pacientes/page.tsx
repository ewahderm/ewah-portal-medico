import { requireUsuario, esAdministrador } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { normalizarBusqueda } from "@/lib/texto";
import { nombreCompleto } from "@/lib/pacientes/nombre";
import { tieneInfoPendiente, camposFaltantes } from "@/lib/pacientes/completitud";
import {
  paginaDesde,
  rangoPagina,
  totalPaginas as calcularTotalPaginas,
  esRangoFueraDeLimite,
} from "@/lib/pagination";
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
import { ImportarPacientesDialog } from "./importar-pacientes-dialog";
import { Pagination } from "@/components/ui/pagination";
import { ExportarXlsxLink } from "../_components/exportar-xlsx-link";

export default async function PacientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const usuario = await requireUsuario();
  const { q, page } = await searchParams;
  const pagina = paginaDesde(page);
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
      "id, tipo_identificacion_id, numero_identificacion, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, fecha_nacimiento, genero_id, nacionalidad_id, pais_residencia_id, canal_captacion_id, campana_id, eps_id, email, telefono1, telefono2, direccion, contacto_emergencia_nombre, contacto_emergencia_telefono, activo",
      { count: "exact" },
    )
    .order("primer_apellido");

  if (q) {
    query = query.ilike("busqueda", `%${normalizarBusqueda(q)}%`);
  }

  const { data: pacientes, count, error: errorPacientes } = await query.range(...rangoPagina(pagina));

  // Misma corrección que en Tratamientos: una página que ya no existe
  // (ej. una búsqueda que redujo el resultado) da error de rango en vez de
  // lista vacía — se vuelve a page=1 conservando la búsqueda en vez de
  // mostrar "no se encontraron pacientes" de forma engañosa.
  if (esRangoFueraDeLimite(errorPacientes) && pagina > 1) {
    redirect(q ? `/pacientes?q=${encodeURIComponent(q)}` : "/pacientes");
  }

  const paginas = calcularTotalPaginas(count ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Pacientes</h1>
          <p className="text-sm text-muted-foreground">
            Registro de pacientes de tu clínica.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {esAdministrador(usuario) ? (
            <>
              <ExportarXlsxLink href={`/api/exportar/pacientes${q ? `?q=${encodeURIComponent(q)}` : ""}`} />
              <ImportarPacientesDialog />
            </>
          ) : null}
          {puedeCrear ? (
            <PacienteDialog
              catalogos={catalogos}
              trigger={<Button>Nuevo paciente</Button>}
            />
          ) : null}
        </div>
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
                <TableHead className="hidden md:table-cell">Identificación</TableHead>
                <TableHead className="hidden md:table-cell">Contacto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(pacientes ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="max-w-[45vw] font-medium md:max-w-none">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">{nombreCompleto(p)}</span>
                      {tieneInfoPendiente(p) ? (
                        <Badge
                          variant="outline"
                          className="shrink-0 text-amber-600"
                          title={`Falta: ${camposFaltantes(p).join(", ")}`}
                        >
                          <span className="md:hidden">Pendiente</span>
                          <span className="hidden md:inline">Información pendiente</span>
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {p.numero_identificacion ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {p.telefono1 ?? p.email ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.activo ? "secondary" : "outline"}>
                      {p.activo ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="flex justify-end gap-2 text-right">
                    <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/pacientes/${p.id}`} />}>
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
          <Pagination
            pagina={pagina}
            totalPaginas={paginas}
            basePath="/pacientes"
            parametros={{ q }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
