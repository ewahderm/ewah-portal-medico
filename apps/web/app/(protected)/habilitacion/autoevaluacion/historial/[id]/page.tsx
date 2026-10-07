import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, CircleCheckIcon, CircleDashedIcon, CircleMinusIcon, CircleXIcon, TriangleAlertIcon } from "lucide-react";
import { cn } from "cn";
import { createClient } from "@/lib/supabase/server";
import { esAdministrador, requireUsuario } from "@/lib/auth/session";
import {
  getAccesoHabilitacion,
  getAutoevaluacion,
  getDetalleAutoevaluacion,
  getUsuariosClinica,
} from "@/lib/habilitacion/consultas";
import { ESTADOS_EVALUACION, ESTANDARES, MOTIVOS_AUTOEVALUACION, etiquetaDe } from "@/lib/habilitacion/constantes";
import { fechaColombiaDe, fechaLegible } from "@/lib/habilitacion/ruta";
import type { DetalleAutoevaluacion } from "@/lib/habilitacion/tipos";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportarXlsxLink } from "../../../../_components/exportar-xlsx-link";
import { UpsellPlan } from "../../../../_components/upsell-plan";
import { BarrasEstandar } from "../../../_components/barras-estandar";
import { EstadoDeclaracionBadge } from "../../../_components/estado-declaracion-badge";
import { AnularAutoevaluacion, DeclaracionReps } from "./acciones-autoevaluacion";

const fmt = (n: number) => new Intl.NumberFormat("es-CO").format(n);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ICONO_ESTADO = {
  cumple: [CircleCheckIcon, "text-emerald-700"],
  no_cumple: [CircleXIcon, "text-destructive"],
  no_aplica: [CircleMinusIcon, "text-muted-foreground"],
  pendiente: [CircleDashedIcon, "text-muted-foreground"],
} as const;

const FILTROS = [{ value: "todos", label: "Todos" }, ...ESTADOS_EVALUACION] as const;

// Vista de la foto (HU-4.6): lo que se declaró, sin recalcular nada. Los
// totales salen del resumen congelado; la lista, del detalle congelado.
export default async function AutoevaluacionCerradaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const usuario = await requireUsuario();
  const acceso = await getAccesoHabilitacion();
  if (!acceso.puedeVer) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No tienes permiso para ver esta página.</AlertDescription>
      </Alert>
    );
  }
  if (!acceso.gestion) {
    return <UpsellPlan tituloModulo="Historial de autoevaluaciones — plan Pro" mensaje="Disponible en el plan Pro." />;
  }
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const q = await searchParams;
  const filtro = typeof q.estado === "string" && FILTROS.some((f) => f.value === q.estado) ? q.estado : "todos";

  const supabase = await createClient();
  const [ae, detalle, usuarios] = await Promise.all([
    getAutoevaluacion(supabase, id),
    getDetalleAutoevaluacion(supabase, id),
    getUsuariosClinica(supabase),
  ]);
  if (!ae) notFound();
  const nombres = Object.fromEntries(usuarios.map((u) => [u.id, u.nombre]));
  const fechaCierre = fechaColombiaDe(ae.fecha_cierre);
  const t = ae.resumen.totales;
  const base = t.cumple + t.no_cumple + t.pendientes;
  const admin = esAdministrador(usuario);

  // Encabezados y autorresueltos se muestran pero no cuentan (igual que el
  // indicador); el filtro por estado aplica a todos.
  const visibles = detalle.filter((d) => filtro === "todos" || d.estado === filtro);
  const grupos = new Map<string, DetalleAutoevaluacion[]>();
  for (const d of visibles) {
    const clave = `${d.sede_nombre}|${d.estandar_codigo}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), d]);
  }
  const ordenEstandar = (c: string) => ESTANDARES.findIndex((e) => e.value === c);
  const clavesOrdenadas = [...grupos.keys()].sort((a, b) => {
    const [sa, ea] = a.split("|");
    const [sb, eb] = b.split("|");
    return sa.localeCompare(sb) || ordenEstandar(ea) - ordenEstandar(eb);
  });
  const variasSedes = new Set(detalle.map((d) => d.sede_id)).size > 1;
  const href = (estado: string) => `/habilitacion/autoevaluacion/historial/${id}${estado === "todos" ? "" : `?estado=${estado}`}`;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/habilitacion/autoevaluacion/historial" />}>
        <ArrowLeftIcon /> Historial
      </Button>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <CardTitle className={cn("text-lg font-semibold", ae.anulado && "line-through")}>{ae.nombre}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {etiquetaDe(MOTIVOS_AUTOEVALUACION, ae.motivo)} · cerrada el {fechaLegible(fechaCierre)}
              {nombres[ae.cerrado_por] ? ` por ${nombres[ae.cerrado_por]}` : ""} · {fmt(ae.resumen.criterios)} criterios
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ae.anulado ? <Badge variant="secondary">Anulada</Badge> : null}
              {ae.fecha_declaracion_reps ? (
                <Badge variant="outline">Declarada en el REPS el {fechaLegible(ae.fecha_declaracion_reps)}</Badge>
              ) : null}
            </div>
            {ae.anulado && ae.anulado_motivo ? <p className="text-xs text-muted-foreground">Anulada: {ae.anulado_motivo}</p> : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {admin ? (
              <>
                <ExportarXlsxLink href={`/api/exportar/habilitacion/${id}?formato=xlsx`} label="Excel" />
                <ExportarXlsxLink href={`/api/exportar/habilitacion/${id}?formato=pdf`} label="PDF" />
              </>
            ) : null}
            {acceso.puedeAnular && !ae.anulado ? <AnularAutoevaluacion id={id} /> : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!ae.anulado && !ae.fecha_declaracion_reps && acceso.puedeAprobar ? <DeclaracionReps id={id} fechaCierre={fechaCierre} /> : null}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Cifra titulo="Cumplimiento" valor={base === 0 ? "—" : `${Math.round((t.cumple / base) * 100)} %`} />
            <Cifra titulo="Cumple" valor={fmt(t.cumple)} href={href("cumple")} />
            <Cifra titulo="No cumple" valor={fmt(t.no_cumple)} href={href("no_cumple")} tono={t.no_cumple > 0 ? "rojo" : undefined} />
            <Cifra titulo="Pendiente" valor={fmt(t.pendientes)} href={href("pendiente")} />
          </div>

          {ae.servicios_no_aptos.length > 0 ? (
            <Alert variant="destructive">
              <TriangleAlertIcon />
              <AlertDescription>
                Al cerrar se confirmó que {ae.servicios_no_aptos.length === 1 ? "este servicio no se podía" : "estos servicios no se podían"} declarar:{" "}
                {ae.servicios_no_aptos.map((s) => `${s.servicio_clave} ${s.servicio} (${s.sede})${s.estado === "sin_evaluar" ? " — sin evaluar" : ""}`).join("; ")}.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Por estándar</h2>
              <BarrasEstandar filas={ae.resumen.estandares} />
            </section>
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Servicios</h2>
              <ul className="space-y-1.5">
                {ae.resumen.servicios.map((s) => (
                  <li key={`${s.sede_id}-${s.servicio_clave}`} className="flex flex-col gap-1 rounded-lg border p-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0">
                      <span className="font-medium">
                        {s.servicio_clave} {s.servicio}
                      </span>
                      <span className="text-muted-foreground"> · {s.sede}</span>
                    </span>
                    <EstadoDeclaracionBadge estado={s.estado} noCumple={s.no_cumple} pendientes={s.pendientes} />
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base font-semibold">Criterios como quedaron</CardTitle>
          <nav aria-label="Filtrar por estado" className="flex gap-1.5 overflow-x-auto pb-1">
            {FILTROS.map((f) => (
              <Link
                key={f.value}
                href={href(f.value)}
                scroll={false}
                aria-current={f.value === filtro ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-sm transition-colors",
                  f.value === filtro ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {f.label}
              </Link>
            ))}
          </nav>
        </CardHeader>
        <CardContent className="space-y-2">
          {visibles.length === 0 ? <p className="text-sm text-muted-foreground">Ningún criterio con ese estado.</p> : null}
          {clavesOrdenadas.map((clave) => {
            const filas = grupos.get(clave)!;
            const [sede, estandar] = clave.split("|");
            const noCumple = filas.filter((f) => f.estado === "no_cumple" && f.origen !== "encabezado" && f.origen !== "autorresuelto").length;
            return (
              <details key={clave} className="group rounded-lg border" open={filtro !== "todos"}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-medium">
                  <span className="min-w-0 truncate">
                    {etiquetaDe(ESTANDARES, estandar)}
                    {variasSedes ? <span className="font-normal text-muted-foreground"> · {sede}</span> : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {filas.length} criterio{filas.length === 1 ? "" : "s"}
                    {noCumple > 0 ? <span className="text-destructive"> · {noCumple} No cumple</span> : null}
                  </span>
                </summary>
                <ul className="divide-y border-t">
                  {filas.map((d) => {
                    const [Icono, color] = ICONO_ESTADO[d.estado];
                    return (
                      <li key={`${d.sede_id}-${d.criterio_id}`} className="flex gap-3 p-3 text-sm">
                        <Icono className={cn("mt-0.5 size-4 shrink-0", color)} aria-hidden />
                        <div className="min-w-0 space-y-1">
                          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-mono text-xs font-medium">{d.criterio_codigo}</span>
                            <span className={cn("text-xs font-medium", color)}>{etiquetaDe(ESTADOS_EVALUACION, d.estado)}</span>
                            {d.origen === "encabezado" ? <Badge variant="outline">Encabezado</Badge> : null}
                            {d.origen === "autorresuelto" ? <Badge variant="outline">Se cumple con 11.1</Badge> : null}
                            {d.origen === "remision" && d.remitido_desde_codigo ? (
                              <Badge variant="outline">Por remisión desde {d.remitido_desde_codigo}</Badge>
                            ) : null}
                          </p>
                          <p className="line-clamp-3 text-muted-foreground">{d.texto_literal}</p>
                          {d.justificacion ? <p className="text-xs">Justificación: {d.justificacion}</p> : null}
                          {d.fecha_verificacion ? (
                            <p className="text-xs text-muted-foreground">
                              Verificado el {fechaLegible(d.fecha_verificacion)}
                              {d.evaluado_por && nombres[d.evaluado_por] ? ` por ${nombres[d.evaluado_por]}` : ""}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function Cifra({ titulo, valor, href, tono }: { titulo: string; valor: string; href?: string; tono?: "rojo" }) {
  const contenido = (
    <div className={cn("rounded-lg border p-3", href && "transition-colors hover:bg-muted")}>
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className={cn("text-xl font-semibold", tono === "rojo" && "text-destructive")}>{valor}</p>
    </div>
  );
  return href ? (
    <Link href={href} scroll={false} className="block rounded-lg">
      {contenido}
    </Link>
  ) : (
    contenido
  );
}
