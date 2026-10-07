import Link from "next/link";
import {
  Building2Icon,
  CalendarClockIcon,
  HistoryIcon,
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
  getClinicaRegulatoria,
  getDocumentosClinica,
  getObligacionesClinica,
  getOcurrenciasPendientesHasta,
  getOcurrencias,
  getEstadosDeclaracion,
  getAutoevaluaciones,
  getProgresoAutoevaluacion,
  hoyColombia,
} from "@/lib/habilitacion/consultas";
import { contarPorConfirmar, disciplinaReporte, estandaresDeProgreso, sumarProgreso } from "@/lib/habilitacion/tablero";
import { armarChecklist, contextoDocumentos, resumenChecklist } from "@/lib/habilitacion/checklist";
import { estadoOcurrencia, porConfirmar, resumenObligaciones, UMBRALES_SEMAFORO } from "@/lib/habilitacion/semaforo";
import { SemaforoBadge } from "./_components/semaforo-badge";
import { indicadoresDeProgreso } from "@/lib/habilitacion/estado-criterio";
import {
  calcularRuta,
  diasHasta,
  faltanteServicio,
  fechaLegible,
  nivelVencimientoReps,
  perfilCompleto,
  sumarDias,
} from "@/lib/habilitacion/ruta";
import { DESCRIPCION_GRUPO, USOS_EDIFICACION, etiquetaDe } from "@/lib/habilitacion/constantes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RutaPasos } from "./_components/ruta-pasos";
import { BarrasEstandar } from "./_components/barras-estandar";
import { EstadoDeclaracionBadge } from "./_components/estado-declaracion-badge";

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
  const hoy = hoyColombia();
  const [
    perfil,
    { sedes, serviciosSinSede },
    progreso,
    clinica,
    documentos,
    configObligaciones,
    pendientes,
    estadosDeclaracion,
    autoevaluaciones,
    ultimoAnio,
  ] = await Promise.all([
    getPerfilPrestador(supabase),
    getSedesConServicios(supabase),
    acceso.gestion ? getProgresoAutoevaluacion(supabase) : Promise.resolve(null),
    acceso.gestion ? getClinicaRegulatoria(supabase) : Promise.resolve(null),
    acceso.gestion ? getDocumentosClinica(supabase) : Promise.resolve(null),
    getObligacionesClinica(supabase),
    getOcurrenciasPendientesHasta(supabase, sumarDias(hoy, UMBRALES_SEMAFORO.rojo)),
    acceso.gestion ? getEstadosDeclaracion(supabase) : Promise.resolve(null),
    acceso.gestion ? getAutoevaluaciones(supabase) : Promise.resolve(null),
    getOcurrencias(supabase, sumarDias(hoy, -365), sumarDias(hoy, -1)),
  ]);

  // Paso 3: mismo checklist que la página de Documentos.
  const checklist =
    documentos && perfilCompleto(perfil)
      ? armarChecklist(
          documentos.catalogo,
          documentos.renglones,
          contextoDocumentos(perfil, clinica?.tipo_persona?.codigo ? clinica.tipo_persona.codigo === "JURIDICA" : null, sedes),
          perfil?.fecha_planeada_radicacion ?? null,
          hoy,
          acceso.puedeEditar,
        )
      : null;
  // Lo urgente (§5.6): vencidas y ≤ 7 días de obligaciones activas y
  // confirmadas, más los documentos vencidos. Arriba de todo.
  const porObligacion = new Map((configObligaciones ?? []).map((c) => [c.obligacion_id, c]));
  const urgentes = pendientes
    .map((o) => ({ o, c: porObligacion.get(o.obligacion_id) }))
    .filter((x): x is { o: (typeof pendientes)[number]; c: NonNullable<typeof x.c> } => !!x.c && x.c.activa && !porConfirmar(x.c));
  const documentosVencidos = (checklist ?? []).filter((i) => i.aplica !== "ya_no_aplica" && i.estado.estado === "vencido");

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
    documentos: checklist ? resumenChecklist(checklist) : null,
    obligaciones: configObligaciones ? resumenObligaciones(configObligaciones, pendientes, hoy) : null,
  });
  const todosServicios = [...sedes.flatMap((s) => s.servicios), ...serviciosSinSede];
  const incompletos = todosServicios.filter((s) => faltanteServicio(s) !== null).length;

  // Indicadores de la autoevaluación y de reportes (§5.6).
  const indAuto = progreso ? indicadoresDeProgreso(progreso) : null;
  const sumas = progreso ? sumarProgreso(progreso) : null;
  const ultimaCerrada = (autoevaluaciones ?? []).find((a) => !a.anulado) ?? null;
  const disciplina = configObligaciones ? disciplinaReporte(configObligaciones, ultimoAnio, hoy) : null;
  const porConfirmarN = configObligaciones ? contarPorConfirmar(configObligaciones) : 0;
  const nombreSede = new Map(sedes.map((s) => [s.id, s.nombre]));

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

      {urgentes.length > 0 || documentosVencidos.length > 0 ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Lo urgente</CardTitle>
            <p className="text-sm text-muted-foreground">Vencido o con plazo en los próximos 7 días.</p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {urgentes.map(({ o, c }) => {
                const e = estadoOcurrencia(o, hoy);
                const cat = c.hab_obligaciones_catalogo;
                return (
                  <li key={o.id} className="flex flex-col gap-1 rounded-lg border p-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0">
                      <span className="font-medium">{cat.nombre}</span>
                      <span className="text-muted-foreground"> · {fechaLegible(o.fecha_limite)}{o.dia_no_habil ? " (día no hábil: preséntalo antes)" : ""}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <SemaforoBadge semaforo={e.semaforo} etiqueta={e.etiqueta} />
                      {cat.plataforma_url ? (
                        <a href={cat.plataforma_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline-offset-4 hover:underline">
                          Portal
                        </a>
                      ) : null}
                      <Link href="/habilitacion/obligaciones" className="text-xs text-primary underline-offset-4 hover:underline">
                        Ver
                      </Link>
                    </span>
                  </li>
                );
              })}
              {documentosVencidos.map((i) => (
                <li key={i.clave} className="flex flex-col gap-1 rounded-lg border p-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0">
                    <span className="font-medium">{i.nombre}</span>
                    {i.sede ? <span className="text-muted-foreground"> · {i.sede.nombre}</span> : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <SemaforoBadge semaforo="rojo" etiqueta="Documento vencido" />
                    <Link href="/habilitacion/documentos" className="text-xs text-primary underline-offset-4 hover:underline">
                      Ver
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
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

      {acceso.gestion && indAuto && indAuto.evaluables > 0 ? (
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Tu autoevaluación</CardTitle>
              <p className="text-sm text-muted-foreground">
                Un solo «No cumple» impide declarar el servicio en el REPS, aunque el resto esté al día.
              </p>
            </div>
            <Button variant="outline" size="sm" className="shrink-0" nativeButton={false} render={<Link href="/habilitacion/autoevaluacion/historial" />}>
              <HistoryIcon /> Historial
            </Button>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Mini titulo="Cumplimiento" valor={indAuto.porcentajeCumplimiento === null ? "—" : `${indAuto.porcentajeCumplimiento} %`} href="/habilitacion/autoevaluacion" />
              <Mini titulo="Avance de evaluación" valor={`${indAuto.porcentajeAvance ?? 0} %`} detalle={`${fmt(indAuto.evaluados)} de ${fmt(indAuto.evaluables)}`} href="/habilitacion/autoevaluacion?estado=pendiente" />
              <Mini
                titulo="Por re-verificar"
                valor={fmt(sumas?.reverificar ?? 0)}
                detalle="Verificados hace más de 12 meses"
                href="/habilitacion/autoevaluacion?reverificar=1"
                tono={(sumas?.reverificar ?? 0) > 0 ? "alerta" : undefined}
              />
              <Mini titulo="Planes de mejora abiertos" valor={fmt(sumas?.planesAbiertos ?? 0)} href="/habilitacion/autoevaluacion?estado=no_cumple" />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="space-y-2">
                <h2 className="text-sm font-semibold">Cumplimiento por estándar</h2>
                <BarrasEstandar
                  filas={estandaresDeProgreso(progreso ?? [])}
                  href={(estandar, estado) => `/habilitacion/autoevaluacion?estandar=${estandar}${estado ? `&estado=${estado}` : ""}`}
                />
              </section>
              <section className="space-y-2">
                <h2 className="text-sm font-semibold">¿Qué puedes declarar?</h2>
                {estadosDeclaracion === null ? (
                  <p className="text-sm text-muted-foreground">Disponible pronto.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {estadosDeclaracion.map((e) => (
                      <li key={`${e.sede_id}-${e.servicio_norma_id}`}>
                        <Link
                          href={`/habilitacion/autoevaluacion?sede=${e.sede_id}${e.estado === "con_incumplimientos" ? "&estado=no_cumple" : e.estado === "sin_evaluar" ? "&estado=pendiente" : ""}`}
                          className="flex flex-col gap-1 rounded-lg border p-2 text-sm transition-colors hover:bg-muted sm:flex-row sm:items-center sm:justify-between"
                        >
                          <span className="min-w-0">
                            <span className="font-medium">
                              {e.servicio_clave} {e.servicio_nombre}
                            </span>
                            {sedesConServicios.length > 1 ? <span className="text-muted-foreground"> · {nombreSede.get(e.sede_id) ?? e.sede_nombre}</span> : null}
                          </span>
                          <EstadoDeclaracionBadge estado={e.estado} noCumple={e.no_cumple} pendientes={e.pendientes} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground">
                  {ultimaCerrada ? (
                    <>
                      Último cierre:{" "}
                      <Link href={`/habilitacion/autoevaluacion/historial/${ultimaCerrada.id}`} className="text-primary underline-offset-4 hover:underline">
                        {ultimaCerrada.nombre}
                      </Link>
                      {ultimaCerrada.fecha_declaracion_reps
                        ? `, declarada en el REPS el ${fechaLegible(ultimaCerrada.fecha_declaracion_reps)}.`
                        : ", sin fecha de declaración en el REPS."}
                    </>
                  ) : (
                    "Todavía no has cerrado ninguna autoevaluación."
                  )}
                </p>
              </section>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {configObligaciones && configObligaciones.some((c) => c.activa) ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Kpi
            icono={CalendarClockIcon}
            titulo="Reportes presentados a tiempo (último año)"
            href="/habilitacion/calendario"
            valor={disciplina?.porcentaje === null || !disciplina ? "—" : `${disciplina.porcentaje} %`}
            detalle={
              !disciplina || disciplina.total === 0
                ? "Sin fechas vencidas en el último año."
                : `${fmt(disciplina.aTiempo)} de ${fmt(disciplina.total)} a tiempo.`
            }
            tono={disciplina?.porcentaje !== null && disciplina && disciplina.porcentaje < 80 ? "alerta" : undefined}
          />
          <Kpi
            icono={ListChecksIcon}
            titulo="Obligaciones por confirmar con tu asesor"
            href="/habilitacion/obligaciones"
            valor={fmt(porConfirmarN)}
            detalle={porConfirmarN > 0 ? "No te avisamos de ellas hasta que las confirmes." : "Todas confirmadas."}
            tono={porConfirmarN > 0 ? "alerta" : undefined}
          />
        </div>
      ) : null}

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
                  aplican; documentos, autoevaluación con evidencias, cierre e historial, y alertas por correo.
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

function Mini({ titulo, valor, detalle, href, tono }: { titulo: string; valor: string; detalle?: string; href: string; tono?: "alerta" }) {
  return (
    <Link href={href} className="block rounded-lg border p-3 transition-colors hover:bg-muted">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className={cn("text-xl font-semibold", tono === "alerta" && "text-amber-700")}>{valor}</p>
      {detalle ? <p className="text-xs text-muted-foreground">{detalle}</p> : null}
    </Link>
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
