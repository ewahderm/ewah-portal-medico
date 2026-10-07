import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, BiohazardIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUsuario } from "@/lib/auth/session";
import { getAcciones, getAccesoSst, getEvento, getInvestigacion, getPersonas, getSedes } from "@/lib/sst/consultas";
import { getUsuariosClinica, hoyColombia } from "@/lib/habilitacion/consultas";
import { GRAVEDADES, TIPOS_EVENTO, etiqueta } from "@/lib/sst/constantes";
import { pendientesEvento } from "@/lib/sst/plazos";
import { fechaLegible } from "@/lib/habilitacion/ruta";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SemaforoBadge } from "../../../habilitacion/_components/semaforo-badge";
import { SeguimientoForm } from "./seguimiento-form";
import { InvestigacionForm } from "./investigacion-form";
import { PlanAccion } from "../../_components/plan-accion";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EventoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUsuario();
  const acceso = await getAccesoSst();
  if (!acceso.puedeVer) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No tienes permiso para ver esta página.</AlertDescription>
      </Alert>
    );
  }
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const [{ evento, error: errorEvento }, investigacion, personas, sedes, usuarios, { data: puedeCrear }] = await Promise.all([
    getEvento(supabase, id),
    getInvestigacion(supabase, id),
    getPersonas(supabase),
    getSedes(supabase),
    getUsuariosClinica(supabase),
    supabase.rpc("has_permission", { modulo_code: "sst", permiso_code: "CREATE" }),
  ]);
  if (errorEvento) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No pudimos leer este evento. Recarga la página; si sigue igual, avísanos.</AlertDescription>
      </Alert>
    );
  }
  if (!evento) notFound();
  const acciones = investigacion ? await getAcciones(supabase, "investigacion", investigacion.id) : [];
  const hoy = hoyColombia();
  const pendientes = pendientesEvento(evento, investigacion?.estado === "cerrada", hoy);
  const persona = personas.find((p) => p.id === evento.empleado_id)?.nombre ?? "Persona retirada";
  const sede = sedes.find((s) => s.id === evento.sede_id)?.nombre;
  const nombresUsuarios = Object.fromEntries(usuarios.map((u) => [u.id, u.nombre]));

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/sst/eventos" />}>
        <ArrowLeftIcon /> Incidentes y accidentes
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            {etiqueta(TIPOS_EVENTO, evento.tipo_evento)} · {persona}
            {evento.gravedad ? (
              <Badge variant={evento.gravedad === "leve" ? "outline" : "destructive"}>{etiqueta(GRAVEDADES, evento.gravedad)}</Badge>
            ) : null}
            {evento.cerrado ? <Badge variant="secondary">Cerrado</Badge> : null}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {fechaLegible(evento.fecha)}
            {evento.hora ? ` · ${evento.hora.slice(0, 5)}` : ""}
            {sede ? ` · ${sede}` : ""}
            {evento.lugar ? ` · ${evento.lugar}` : ""}
          </p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="whitespace-pre-line">{evento.resumen}</p>
          {evento.tipo_lesion || evento.parte_cuerpo || evento.agente ? (
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr]">
              {evento.tipo_lesion ? (
                <>
                  <dt className="text-muted-foreground">Lesión</dt>
                  <dd>{evento.tipo_lesion}</dd>
                </>
              ) : null}
              {evento.parte_cuerpo ? (
                <>
                  <dt className="text-muted-foreground">Parte del cuerpo</dt>
                  <dd>{evento.parte_cuerpo}</dd>
                </>
              ) : null}
              {evento.agente ? (
                <>
                  <dt className="text-muted-foreground">Agente</dt>
                  <dd>{evento.agente}</dd>
                </>
              ) : null}
            </dl>
          ) : null}
          {evento.riesgo_biologico ? (
            <Alert>
              <BiohazardIcon />
              <AlertDescription>
                Exposición a riesgo biológico: atención inmediata, valoración del riesgo de la fuente y seguimiento serológico según
                el protocolo de tu ARL. Anota el seguimiento abajo.
              </AlertDescription>
            </Alert>
          ) : null}
          {pendientes.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {pendientes.map((p) => (
                <li key={p.clave}>
                  <SemaforoBadge semaforo={p.semaforo} etiqueta={p.texto} />
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Reportes y seguimiento</CardTitle>
          <p className="text-sm text-muted-foreground">
            Fecha límite para reportar: {evento.fecha_limite_reporte ? fechaLegible(evento.fecha_limite_reporte) : "—"} (2 días hábiles).
          </p>
        </CardHeader>
        <CardContent>
          <SeguimientoForm evento={evento} puedeEditar={acceso.puedeEditar} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Investigación</CardTitle>
          <p className="text-sm text-muted-foreground">
            Hasta el {evento.fecha_limite_investigacion ? fechaLegible(evento.fecha_limite_investigacion) : "—"} (15 días). La hacen el jefe
            inmediato, el COPASST o vigía y el responsable del SG-SST; si el accidente es grave o mortal, también un profesional con
            licencia en SST.
          </p>
        </CardHeader>
        <CardContent>
          <InvestigacionForm
            accidenteId={evento.id}
            investigacion={investigacion}
            puedeGuardar={!!puedeCrear && (!investigacion || acceso.puedeEditar)}
            grave={evento.gravedad === "grave" || evento.gravedad === "mortal"}
          />
        </CardContent>
      </Card>

      {investigacion ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Plan de acción</CardTitle>
            <p className="text-sm text-muted-foreground">Qué se hará para que no se repita, quién y para cuándo.</p>
          </CardHeader>
          <CardContent>
            <PlanAccion
              origen="investigacion"
              origenId={investigacion.id}
              acciones={acciones}
              usuarios={usuarios}
              nombres={nombresUsuarios}
              puedeCrear={!!puedeCrear}
              puedeEditar={acceso.puedeEditar}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
