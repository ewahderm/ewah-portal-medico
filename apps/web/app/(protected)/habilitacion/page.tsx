import Link from "next/link";
import {
  Building2Icon,
  CalendarClockIcon,
  ListChecksIcon,
  SparklesIcon,
  StethoscopeIcon,
  UsersRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { createClient } from "@/lib/supabase/server";
import { requireUsuario } from "@/lib/auth/session";
import {
  contarCriteriosSede,
  getAccesoHabilitacion,
  getPerfilPrestador,
  getSedesConServicios,
  getProgresoAutoevaluacion,
  hoyColombia,
} from "@/lib/habilitacion/consultas";
import { indicadoresDeProgreso } from "@/lib/habilitacion/estado-criterio";
import {
  calcularRuta,
  diasHasta,
  faltanteServicio,
  fechaLegible,
  nivelVencimientoReps,
  perfilCompleto,
} from "@/lib/habilitacion/ruta";
import { DESCRIPCION_GRUPO, USOS_EDIFICACION, etiquetaDe } from "@/lib/habilitacion/constantes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RutaPasos } from "./_components/ruta-pasos";

const fmt = (n: number) => new Intl.NumberFormat("es-CO").format(n);

export default async function HabilitacionResumenPage() {
  await requireUsuario();
  const acceso = await getAccesoHabilitacion();
  if (!acceso.puedeVer) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No tienes permiso para ver esta página.</AlertDescription>
      </Alert>
    );
  }

  const supabase = await createClient();
  const [perfil, { sedes, serviciosSinSede }, progreso] = await Promise.all([
    getPerfilPrestador(supabase),
    getSedesConServicios(supabase),
    acceso.gestion ? getProgresoAutoevaluacion(supabase) : Promise.resolve(null),
  ]);

  // Criterios por sede (motor SQL, 0065) — solo con gestión: es la parte de
  // pago. Solo sedes con servicios (sin servicios el motor devuelve 0).
  const sedesConServicios = sedes.filter((s) => s.servicios.length > 0);
  const conteos = acceso.gestion
    ? await Promise.all(sedesConServicios.map((s) => contarCriteriosSede(supabase, s.id)))
    : [];
  const motorDisponible = conteos.every((c) => c.motorDisponible);
  const totalCriterios = conteos.reduce((a, c) => a + (c.total ?? 0), 0);
  const totalEvaluables = conteos.reduce((a, c) => a + (c.evaluables ?? 0), 0);

  const pasos = calcularRuta({
    perfil,
    sedes,
    serviciosSinSede: serviciosSinSede.length,
    gestion: acceso.gestion,
    autoevaluacion: progreso ? indicadoresDeProgreso(progreso) : null,
  });
  const todosServicios = [...sedes.flatMap((s) => s.servicios), ...serviciosSinSede];
  const incompletos = todosServicios.filter((s) => faltanteServicio(s) !== null).length;

  const hoy = hoyColombia();
  const diasReps = perfil?.fecha_vencimiento_reps ? diasHasta(perfil.fecha_vencimiento_reps, hoy) : null;
  const nivelReps = diasReps === null ? null : nivelVencimientoReps(diasReps);

  return (
    <div className="space-y-6">
      {!perfilCompleto(perfil) ? (
        <Card className="border-primary/40 bg-accent/40">
          <CardContent className="flex flex-col gap-4 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-semibold">Completa tu perfil para ver tu ruta</p>
              <p className="text-sm text-muted-foreground">
                Con tu tipo de prestador y tu situación en el REPS calculamos qué documentos, criterios y
                reportes te aplican. Empieza respondiendo: <strong>¿ya estás inscrito en el REPS?</strong>
              </p>
            </div>
            {acceso.puedeEditar ? (
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                <Button nativeButton={false} render={<Link href="/habilitacion/perfil?reps=inscrito" />}>
                  Sí, ya estoy inscrito
                </Button>
                <Button variant="outline" nativeButton={false} render={<Link href="/habilitacion/perfil?reps=no_inscrito" />}>
                  Todavía no
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Tu ruta de habilitación</CardTitle>
          <p className="text-sm text-muted-foreground">
            Seis pasos, en orden: cada uno alimenta al siguiente.
          </p>
        </CardHeader>
        <CardContent>
          <RutaPasos pasos={pasos} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icono={ListChecksIcon}
          titulo="Criterios que te aplican"
          href={acceso.gestion ? "/habilitacion/sedes" : undefined}
          valor={
            !acceso.gestion
              ? null
              : !motorDisponible
                ? "—"
                : fmt(totalCriterios)
          }
          detalle={
            !acceso.gestion
              ? "Disponible en el plan Pro."
              : !motorDisponible
                ? "Cálculo disponible pronto."
                : sedesConServicios.length === 0
                  ? "Declara tus servicios para calcularlos."
                  : `${fmt(totalEvaluables)} para evaluar a mano · de 3.976 de la norma`
          }
          pro={!acceso.gestion}
        />
        <Kpi
          icono={StethoscopeIcon}
          titulo="Servicios declarados"
          href={acceso.gestion ? "/habilitacion/sedes" : undefined}
          valor={fmt(todosServicios.length)}
          detalle={
            todosServicios.length === 0
              ? "Todavía no hay servicios declarados."
              : incompletos > 0
                ? `${incompletos} por completar.`
                : "Todos completos."
          }
          tono={incompletos > 0 ? "alerta" : undefined}
        />
        <Kpi
          icono={CalendarClockIcon}
          titulo="Vencimiento de tu inscripción REPS"
          href="/habilitacion/perfil"
          valor={diasReps === null ? "—" : diasReps < 0 ? "Vencida" : `${fmt(diasReps)} días`}
          detalle={
            perfil?.fecha_vencimiento_reps
              ? `${diasReps !== null && diasReps < 0 ? "Venció" : "Vence"} el ${fechaLegible(perfil.fecha_vencimiento_reps)}.`
              : perfil?.estado_reps === "inscrito"
                ? "Registra la fecha en tu perfil."
                : "Aplica cuando estés inscrito."
          }
          tono={nivelReps === "rojo" ? "rojo" : nivelReps === "ambar" ? "alerta" : undefined}
        />
        <Kpi
          icono={UsersRoundIcon}
          titulo="Grupo Supersalud"
          href="/habilitacion/perfil"
          valor={
            perfil?.tipo_prestador === "profesional_independiente" ? "No aplica" : (perfil?.grupo_supersalud ?? "—")
          }
          detalle={
            perfil?.tipo_prestador === "profesional_independiente"
              ? "Los profesionales independientes no tienen grupo."
              : perfil?.grupo_supersalud
                ? DESCRIPCION_GRUPO[perfil.grupo_supersalud]
                : "Usa el asistente en tu perfil."
          }
        />
      </div>

      {acceso.gestion && sedesConServicios.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Criterios por sede</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {sedesConServicios.map((s, i) => {
              const c = conteos[i];
              return (
                <Link
                  key={s.id}
                  href={`/habilitacion/sedes#sede-${s.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Building2Icon className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{s.nombre}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.servicios.length} servicio{s.servicios.length === 1 ? "" : "s"} ·{" "}
                        {s.uso_edificacion ? etiquetaDe(USOS_EDIFICACION, s.uso_edificacion) : "Sin tipo de edificación"}
                      </p>
                    </div>
                  </div>
                  <p className="shrink-0 text-right">
                    <span className="text-lg font-semibold">{c?.total === null ? "—" : fmt(c?.total ?? 0)}</span>
                    <span className="block text-xs text-muted-foreground">criterios</span>
                  </p>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {!acceso.gestion ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col gap-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <SparklesIcon className="size-5 text-accent-foreground" />
              </div>
              <div>
                <p className="font-semibold">Gestiona tu habilitación completa con el plan Pro</p>
                <p className="text-sm text-muted-foreground">
                  Declara tus servicios por sede y descubre exactamente qué criterios de la Resolución 3100 te
                  aplican; pronto también documentos, autoevaluación con evidencias y alertas por correo.
                </p>
              </div>
            </div>
            <Button variant="outline" className="shrink-0" nativeButton={false} render={<Link href="/suscripcion" />}>
              Ver planes
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Kpi({
  icono: Icono,
  titulo,
  valor,
  detalle,
  href,
  tono,
  pro,
}: {
  icono: LucideIcon;
  titulo: string;
  valor: string | null;
  detalle: string;
  href?: string;
  tono?: "alerta" | "rojo";
  pro?: boolean;
}) {
  const contenido = (
    <Card className={cn("h-full transition-colors", href && "hover:bg-muted/50")}>
      <CardContent className="flex items-start gap-3">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            tono === "rojo" ? "bg-destructive/10 text-destructive" : tono === "alerta" ? "bg-amber-50 text-amber-700" : "bg-primary/10 text-accent-foreground",
          )}
        >
          <Icono className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{titulo}</p>
          {pro ? (
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
              <SparklesIcon className="size-3" /> Plan Pro
            </p>
          ) : (
            <p className={cn("text-2xl font-semibold", tono === "rojo" && "text-destructive", tono === "alerta" && "text-amber-700")}>
              {valor}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{detalle}</p>
        </div>
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      {contenido}
    </Link>
  ) : (
    contenido
  );
}
