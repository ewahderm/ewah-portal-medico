import Link from "next/link";
import { Building2Icon, PencilIcon, PlusIcon, Settings2Icon, TriangleAlertIcon } from "lucide-react";
import { cn } from "cn";
import { createClient } from "@/lib/supabase/server";
import { requireUsuario } from "@/lib/auth/session";
import {
  contarCriteriosSede,
  getAccesoHabilitacion,
  getPracticasConNumerales,
  getSedesConServicios,
} from "@/lib/habilitacion/consultas";
import {
  COMPLEJIDADES,
  ESTADOS_SERVICIO,
  MODALIDADES,
  USOS_EDIFICACION,
  etiquetaDe,
} from "@/lib/habilitacion/constantes";
import { faltanteServicio, fechaLegible } from "@/lib/habilitacion/ruta";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UpsellPlan } from "../../_components/upsell-plan";
import { EdificacionDialog } from "./edificacion-dialog";
import { ServicioSedeDialog } from "./servicio-sede-dialog";

const fmt = (n: number) => new Intl.NumberFormat("es-CO").format(n);

export default async function HabilitacionSedesPage() {
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
        tituloModulo="Sedes y servicios — plan Pro"
        mensaje="Declara qué servicios prestas en cada sede, con su complejidad y modalidades, y el sistema te dice exactamente cuántos y cuáles criterios de la Resolución 3100 te aplican. Disponible en el plan Pro."
      />
    );
  }

  const supabase = await createClient();
  const [{ sedes, serviciosSinSede }, practicas] = await Promise.all([
    getSedesConServicios(supabase),
    getPracticasConNumerales(supabase),
  ]);
  const conteos = await Promise.all(
    sedes.map((s) => (s.servicios.length > 0 ? contarCriteriosSede(supabase, s.id) : Promise.resolve(null))),
  );
  const nombrePractica = new Map(practicas.map((p) => [p.id, p.nombre]));

  if (sedes.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-2 py-4 text-center">
          <Building2Icon className="mx-auto size-8 text-muted-foreground" />
          <p className="font-medium">Todavía no hay sedes registradas</p>
          <p className="text-sm text-muted-foreground">
            Crea tus sedes en Parámetros; luego vuelve aquí para declarar los servicios de cada una.
          </p>
          <Button variant="outline" nativeButton={false} render={<Link href="/parametros" />}>
            Ir a Parámetros
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Por cada sede: el tipo de edificación y los servicios que prestas allí. Con eso calculamos qué criterios de la
        norma te aplican. El código de habilitación de cada servicio y las sedes se administran en{" "}
        <Link href="/parametros" className="underline underline-offset-4">
          Parámetros → Datos básicos
        </Link>
        .
      </p>

      {serviciosSinSede.length > 0 ? (
        <Alert>
          <TriangleAlertIcon />
          <AlertDescription>
            {serviciosSinSede.length === 1 ? "Un servicio" : `${serviciosSinSede.length} servicios`} sin sede (
            {serviciosSinSede.map((s) => s.practicas_medicas?.nombre ?? nombrePractica.get(s.practica_medica_id)).join(", ")}
            ) {serviciosSinSede.length === 1 ? "no cuenta" : "no cuentan"} para los criterios.{" "}
            {serviciosSinSede.length === 1 ? "Asígnale" : "Asígnales"} una sede en Parámetros → Datos básicos.
          </AlertDescription>
        </Alert>
      ) : null}

      {sedes.map((sede, i) => {
        const conteo = conteos[i];
        const enSede = new Set(sede.servicios.map((s) => s.practica_medica_id));
        return (
          <Card key={sede.id} id={`sede-${sede.id}`} className="scroll-mt-6">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-accent-foreground">
                  <Building2Icon className="size-5" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-base font-semibold">{sede.nombre}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {sede.uso_edificacion ? etiquetaDe(USOS_EDIFICACION, sede.uso_edificacion) : "Sin tipo de edificación"}
                    {sede.fecha_construccion_intervencion
                      ? ` · Construida o intervenida ${
                          sede.fecha_construccion_es_aproximada
                            ? `en ${sede.fecha_construccion_intervencion.slice(0, 4)}`
                            : `el ${fechaLegible(sede.fecha_construccion_intervencion)}`
                        }`
                      : ""}
                    {sede.codigo_sede_reps ? ` · Código de sede REPS ${sede.codigo_sede_reps}` : ""}
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-left sm:text-right">
                {conteo ? (
                  conteo.motorDisponible && conteo.total !== null ? (
                    <>
                      <p className="text-2xl font-semibold">{fmt(conteo.total)}</p>
                      <p className="text-xs text-muted-foreground">
                        criterios aplicables{conteo.evaluables !== null ? ` · ${fmt(conteo.evaluables)} para evaluar` : ""}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Cálculo de criterios disponible pronto.</p>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground">Sin servicios: 0 criterios.</p>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!sede.uso_edificacion && sede.servicios.length > 0 ? (
                <Alert>
                  <TriangleAlertIcon />
                  <AlertDescription>
                    Completa el tipo de edificación de esta sede: mientras no lo sepamos te mostramos los criterios de
                    edificaciones exclusivas <em>y</em> mixtas (de más, nunca de menos).
                  </AlertDescription>
                </Alert>
              ) : null}

              {sede.servicios.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Servicio</TableHead>
                      <TableHead className="hidden md:table-cell">Complejidad</TableHead>
                      <TableHead className="hidden md:table-cell">Modalidades</TableHead>
                      <TableHead className="hidden sm:table-cell">Estado</TableHead>
                      <TableHead className="w-12 text-right">
                        <span className="sr-only">Acciones</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sede.servicios.map((s) => {
                      const falta = faltanteServicio(s);
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="whitespace-normal">
                            <p className="font-medium">{s.practicas_medicas?.nombre ?? "—"}</p>
                            <p className="text-xs text-muted-foreground">
                              {s.hab_servicios_norma
                                ? `${s.hab_servicios_norma.clave} · ${s.hab_servicios_norma.nombre}`
                                : "Sin numeral de la norma"}
                              {s.codigo_habilitacion ? ` · Código ${s.codigo_habilitacion}` : ""}
                            </p>
                            {falta ? (
                              <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                                <TriangleAlertIcon className="size-3.5" /> {falta}
                              </p>
                            ) : null}
                            <p className="mt-1 text-xs text-muted-foreground md:hidden">
                              {[
                                s.complejidad ? etiquetaDe(COMPLEJIDADES, s.complejidad) : null,
                                s.modalidades.map((m) => etiquetaDe(MODALIDADES, m)).join(", ") || null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {s.complejidad ? etiquetaDe(COMPLEJIDADES, s.complejidad) : "—"}
                          </TableCell>
                          <TableCell className="hidden whitespace-normal md:table-cell">
                            {s.modalidades.length > 0 ? s.modalidades.map((m) => etiquetaDe(MODALIDADES, m)).join(", ") : "—"}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge
                              variant={s.estado === "habilitado" ? "default" : s.estado === "cerrado" ? "outline" : "secondary"}
                              className={cn(s.estado === "cierre_temporal" && "bg-amber-50 text-amber-700")}
                            >
                              {etiquetaDe(ESTADOS_SERVICIO, s.estado)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {acceso.puedeEditar ? (
                              <ServicioSedeDialog
                                sede={{ id: sede.id, nombre: sede.nombre }}
                                practicas={practicas}
                                servicio={s}
                                trigger={
                                  <Button
                                    variant={falta ? "default" : "ghost"}
                                    size="icon-sm"
                                    aria-label={`Configurar ${s.practicas_medicas?.nombre ?? "servicio"}`}
                                  >
                                    <Settings2Icon />
                                  </Button>
                                }
                              />
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Todavía no hay servicios declarados en esta sede.
                </p>
              )}

              {acceso.puedeEditar ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <ServicioSedeDialog
                    sede={{ id: sede.id, nombre: sede.nombre }}
                    practicas={practicas}
                    practicasEnSede={[...enSede]}
                    trigger={
                      <Button size="sm">
                        <PlusIcon /> Declarar un servicio
                      </Button>
                    }
                  />
                  <EdificacionDialog
                    sede={sede}
                    trigger={
                      <Button size="sm" variant="outline">
                        <PencilIcon /> {sede.uso_edificacion ? "Editar edificación" : "Completar edificación"}
                      </Button>
                    }
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
