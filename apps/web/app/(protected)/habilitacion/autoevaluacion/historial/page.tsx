import Link from "next/link";
import { ArrowLeftIcon, HistoryIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUsuario } from "@/lib/auth/session";
import { getAccesoHabilitacion, getAutoevaluaciones } from "@/lib/habilitacion/consultas";
import { MOTIVOS_AUTOEVALUACION, etiquetaDe } from "@/lib/habilitacion/constantes";
import { fechaColombiaDe, fechaLegible } from "@/lib/habilitacion/ruta";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UpsellPlan } from "../../../_components/upsell-plan";

const fechaDeCierre = (instante: string) => fechaLegible(fechaColombiaDe(instante));

// HU-4.6: las autoevaluaciones cerradas, la más reciente arriba. Pocas por
// clínica (una o dos al año): sin paginación.
export default async function HistorialAutoevaluacionesPage() {
  await requireUsuario();
  const acceso = await getAccesoHabilitacion();
  if (!acceso.puedeVer) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No tienes permiso para ver esta página.</AlertDescription>
      </Alert>
    );
  }
  if (!acceso.gestion) {
    return (
      <UpsellPlan
        tituloModulo="Historial de autoevaluaciones — plan Pro"
        mensaje="Guarda cada autoevaluación cerrada como una foto que no cambia, con su evidencia, y descárgala en Excel o PDF. Disponible en el plan Pro."
      />
    );
  }

  const supabase = await createClient();
  const lista = await getAutoevaluaciones(supabase);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/habilitacion/autoevaluacion" />}>
        <ArrowLeftIcon /> Volver a la autoevaluación
      </Button>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Autoevaluaciones cerradas</CardTitle>
          <p className="text-sm text-muted-foreground">
            Cada cierre es una foto de ese día: el texto de la norma, el estado y la evidencia quedan como estaban.
          </p>
        </CardHeader>
        <CardContent>
          {lista === null ? (
            <Alert>
              <AlertDescription>El historial se está terminando de instalar en tu cuenta. Vuelve a intentarlo en unos minutos.</AlertDescription>
            </Alert>
          ) : lista.length === 0 ? (
            <div className="space-y-2 py-6 text-center">
              <HistoryIcon className="mx-auto size-8 text-muted-foreground" />
              <p className="font-medium">Todavía no has cerrado ninguna autoevaluación</p>
              <p className="text-sm text-muted-foreground">
                Cuando termines de evaluar, usa «Cerrar autoevaluación» para guardar la foto que declaras en el REPS.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="hidden md:table-cell">Motivo</TableHead>
                  <TableHead>Cerrada</TableHead>
                  <TableHead className="hidden sm:table-cell">Cumplimiento</TableHead>
                  <TableHead className="hidden md:table-cell">Declarada en el REPS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((a) => {
                  const t = a.resumen?.totales;
                  const base = t ? t.cumple + t.no_cumple + t.pendientes : 0;
                  return (
                    <TableRow key={a.id} className={a.anulado ? "opacity-60" : undefined}>
                      <TableCell className="font-medium">
                        <Link href={`/habilitacion/autoevaluacion/historial/${a.id}`} className="text-primary underline-offset-4 hover:underline">
                          {a.nombre}
                        </Link>
                        <span className="mt-1 flex flex-wrap gap-1">
                          {a.anulado ? <Badge variant="secondary">Anulada</Badge> : null}
                          {a.servicios_no_aptos.length > 0 ? (
                            <Badge variant="destructive">
                              {a.servicios_no_aptos.length} servicio{a.servicios_no_aptos.length === 1 ? "" : "s"} no apto{a.servicios_no_aptos.length === 1 ? "" : "s"}
                            </Badge>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{etiquetaDe(MOTIVOS_AUTOEVALUACION, a.motivo)}</TableCell>
                      <TableCell className="whitespace-nowrap">{fechaDeCierre(a.fecha_cierre)}</TableCell>
                      <TableCell className="hidden sm:table-cell">{base === 0 ? "—" : `${Math.round(((t?.cumple ?? 0) / base) * 100)} %`}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {a.fecha_declaracion_reps ? fechaLegible(a.fecha_declaracion_reps) : <span className="text-muted-foreground">Sin registrar</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
