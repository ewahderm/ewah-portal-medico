import { createClient } from "@/lib/supabase/server";
import { listarClinicasPlataforma } from "@/lib/plataforma/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClinicaFilaAcciones } from "./clinica-fila-acciones";

export default async function PlataformaPage() {
  const supabase = await createClient();
  const { data: esSuperAdmin } = await supabase.rpc("es_super_admin");

  if (!esSuperAdmin) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No tienes permiso para ver esta página.</AlertDescription>
      </Alert>
    );
  }

  const [clinicas, { data: planes }] = await Promise.all([
    listarClinicasPlataforma(),
    supabase.from("planes").select("id, codigo, nombre, limite_pacientes").order("precio_mensual"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Plataforma</h1>
        <p className="text-sm text-muted-foreground">
          Panel de EWAH Tech — activa planes de forma provisional (sin pago) y desactiva clínicas.
          Solo visible para el equipo de EWAH Tech.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Clínicas ({clinicas.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Clínica</TableHead>
                <TableHead>NIT</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Pacientes</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clinicas.map((clinica) => (
                <TableRow key={clinica.id}>
                  <TableCell className="font-medium">
                    {clinica.nombre_comercial || clinica.nombre}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{clinica.nit}</TableCell>
                  <TableCell>{clinica.planes?.nombre ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{clinica.total_pacientes}</TableCell>
                  <TableCell>
                    {clinica.activo ? (
                      <Badge>Activa</Badge>
                    ) : (
                      <Badge variant="destructive">Desactivada</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <ClinicaFilaAcciones
                      clinicaId={clinica.id}
                      planCodigoActual={clinica.planes?.codigo ?? ""}
                      activo={clinica.activo}
                      planes={(planes ?? []).map((p) => ({ value: p.codigo, label: p.nombre }))}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {clinicas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    Sin clínicas registradas todavía.
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
