import Link from "next/link";
import { Building2Icon, ClipboardCheckIcon, TriangleAlertIcon } from "lucide-react";
import { cn } from "cn";
import { createClient } from "@/lib/supabase/server";
import { requireUsuario } from "@/lib/auth/session";
import {
  getAccesoHabilitacion,
  getCriteriosEstandar,
  getProgresoAutoevaluacion,
  getSedesConServicios,
  getUsuariosClinica,
} from "@/lib/habilitacion/consultas";
import { ESTANDARES, type CodigoEstandar } from "@/lib/habilitacion/constantes";
import { indicadoresDeProgreso } from "@/lib/habilitacion/estado-criterio";
import type { FilaProgreso } from "@/lib/habilitacion/tipos";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UpsellPlan } from "../../_components/upsell-plan";
import { AutoevaluacionCliente } from "./autoevaluacion-cliente";
import { BarraProgreso } from "./barra-progreso";

const fmt = (n: number) => new Intl.NumberFormat("es-CO").format(n);

// §5.5: una sede a la vez y un estándar a la vez (pestañas). La página trae
// el estándar activo (≤ ~250 filas) y los contadores agregados de todo; los
// filtros finos (estado, servicio, texto, asignados, re-verificar) corren
// en el cliente, sin ida al servidor.
export default async function AutoevaluacionPage({
  searchParams,
}: {
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
    return (
      <UpsellPlan
        tituloModulo="Autoevaluación — plan Pro"
        mensaje="Evalúa uno por uno los criterios de la Resolución 3100 que te aplican, con evidencias, responsables y planes de mejora, y llega a la visita de verificación con todo en orden. Disponible en el plan Pro."
      />
    );
  }

  const params = await searchParams;
  const supabase = await createClient();
  const [{ sedes }, progreso, usuarios] = await Promise.all([
    getSedesConServicios(supabase),
    getProgresoAutoevaluacion(supabase),
    getUsuariosClinica(supabase),
  ]);

  if (progreso === null) {
    return (
      <Alert>
        <TriangleAlertIcon />
        <AlertDescription>
          La autoevaluación se está terminando de instalar en tu cuenta. Vuelve a intentarlo en unos minutos.
        </AlertDescription>
      </Alert>
    );
  }

  const porSede = new Map<string, FilaProgreso[]>();
  for (const f of progreso) porSede.set(f.sede_id, [...(porSede.get(f.sede_id) ?? []), f]);
  const sedesConCriterios = sedes.filter((s) => porSede.has(s.id));

  if (sedesConCriterios.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-2 py-4 text-center">
          <ClipboardCheckIcon className="mx-auto size-8 text-muted-foreground" />
          <p className="font-medium">Todavía no hay criterios para evaluar</p>
          <p className="text-sm text-muted-foreground">
            Declara en cada sede los servicios que prestas, con su complejidad y modalidades. Con eso calculamos qué
            criterios de la norma te aplican.
          </p>
          <Button variant="outline" nativeButton={false} render={<Link href="/habilitacion/sedes" />}>
            Ir a Sedes y servicios
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Sede: la pedida, o la primera con pendientes, o la primera.
  const pedida = typeof params.sede === "string" ? params.sede : null;
  const sede =
    sedesConCriterios.find((s) => s.id === pedida) ??
    sedesConCriterios.find((s) => (porSede.get(s.id) ?? []).some((f) => f.sin_evaluar > 0)) ??
    sedesConCriterios[0];
  const filasSede = porSede.get(sede.id) ?? [];

  const porEstandar = new Map<string, FilaProgreso[]>();
  for (const f of filasSede) porEstandar.set(f.estandar_codigo, [...(porEstandar.get(f.estandar_codigo) ?? []), f]);
  const estandares = ESTANDARES.filter((e) => porEstandar.has(e.value));

  const pedido = typeof params.estandar === "string" ? params.estandar : null;
  const estandar: CodigoEstandar =
    estandares.find((e) => e.value === pedido)?.value ??
    estandares.find((e) => (porEstandar.get(e.value) ?? []).some((f) => f.sin_evaluar > 0))?.value ??
    estandares[0]?.value ??
    "talento_humano";

  const criterios = await getCriteriosEstandar(supabase, sede.id, estandar);

  const total = filasSede.reduce((n, f) => n + f.total, 0);
  const autorresueltos = filasSede.reduce((n, f) => n + f.autorresueltos, 0);
  const encabezados = filasSede.reduce((n, f) => n + f.encabezados, 0);
  const ind = indicadoresDeProgreso(filasSede);
  const href = (cambios: Record<string, string>) => {
    const q = new URLSearchParams({ sede: sede.id, estandar, ...cambios });
    return `/habilitacion/autoevaluacion?${q.toString()}`;
  };

  return (
    <div className="space-y-4">
      {/* Cabecera fija: el número real baja la ansiedad (§5.5). */}
      <div className="sticky top-0 z-20 -mx-1 space-y-3 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:p-4">
        {sedesConCriterios.length > 1 ? (
          <nav aria-label="Sede" className="flex gap-1.5 overflow-x-auto pb-1">
            {sedesConCriterios.map((s) => (
              <Link
                key={s.id}
                href={href({ sede: s.id })}
                aria-current={s.id === sede.id ? "page" : undefined}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
                  s.id === sede.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                <Building2Icon className="size-3.5" /> {s.nombre}
              </Link>
            ))}
          </nav>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm">
              <span className="font-medium">{sede.nombre}</span>: tienes <strong>{fmt(total)}</strong> criterios;{" "}
              <strong>{fmt(autorresueltos)}</strong> se responden solos por remisión a 11.1 y{" "}
              <strong>{fmt(encabezados)}</strong> son encabezados. Te quedan{" "}
              <strong>{fmt(ind.evaluables)}</strong> para evaluar.
            </p>
            <p className="text-xs text-muted-foreground">
              Evaluados {fmt(ind.evaluados)} de {fmt(ind.evaluables)}
              {ind.porcentajeCumplimiento !== null ? ` · Cumplimiento ${ind.porcentajeCumplimiento} %` : ""}
              {ind.noCumple > 0 ? ` · ${fmt(ind.noCumple)} No cumple` : ""}
            </p>
          </div>
          <div className="w-full sm:w-56">
            <BarraProgreso valor={ind.porcentajeAvance ?? 0} etiqueta={`Avance de evaluación: ${ind.porcentajeAvance ?? 0} %`} />
          </div>
        </div>
      </div>

      {/* Estándares como pestañas, en el orden de la norma. */}
      <nav aria-label="Estándar" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {estandares.map((e) => {
          const filas = porEstandar.get(e.value) ?? [];
          const i = indicadoresDeProgreso(filas);
          const activo = e.value === estandar;
          return (
            <Link
              key={e.value}
              href={href({ estandar: e.value })}
              aria-current={activo ? "page" : undefined}
              scroll={false}
              className={cn(
                "w-40 shrink-0 space-y-1.5 rounded-lg border px-3 py-2 text-left transition-colors",
                activo ? "border-primary bg-accent" : "hover:bg-muted",
              )}
            >
              <span className="flex items-center justify-between gap-2 text-sm font-medium">
                <span className="truncate">{e.label}</span>
                {i.noCumple > 0 ? (
                  <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 text-xs text-destructive" title="No cumple">
                    {i.noCumple}
                  </span>
                ) : null}
              </span>
              <span className="block text-xs text-muted-foreground">
                {fmt(i.evaluados)}/{fmt(i.evaluables)} evaluados
              </span>
              <BarraProgreso valor={i.porcentajeAvance ?? 0} delgada />
            </Link>
          );
        })}
      </nav>

      {criterios === null ? (
        <Alert variant="destructive">
          <AlertDescription>No se pudieron cargar los criterios. Recarga la página.</AlertDescription>
        </Alert>
      ) : (
        <AutoevaluacionCliente
          key={`${sede.id}-${estandar}`}
          sedeId={sede.id}
          filas={criterios}
          usuarios={usuarios}
          usuarioId={usuario.id}
          puedeEditar={acceso.puedeEditar}
        />
      )}
    </div>
  );
}
