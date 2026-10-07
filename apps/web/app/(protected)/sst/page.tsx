import Link from "next/link";
import { CircleCheckIcon, ChevronRightIcon, HardHatIcon, TriangleAlertIcon, UsersRoundIcon, ShieldAlertIcon, ClipboardListIcon, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { createClient } from "@/lib/supabase/server";
import { requireUsuario } from "@/lib/auth/session";
import { getAccesoSst, getInsumosTablero } from "@/lib/sst/consultas";
import { pendientesSst, type Pendiente } from "@/lib/sst/tablero";
import { hoyColombia } from "@/lib/habilitacion/consultas";
import { getDiagnostico } from "@/lib/sst/diagnostico";
import type { Diagnostico } from "@/lib/sst/grupo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PerfilSstForm } from "./perfil-form";

const FUENTE: Record<NonNullable<Diagnostico["fuenteClase"]>, string> = {
  actividad: "el código de actividad de 7 dígitos de tu ARL",
  clinica: "la clase de riesgo de la clínica (Datos básicos)",
  cargos: "el cargo de mayor riesgo de tu personal (RRHH)",
};

// F1 del SG-SST: las dos variables que deciden qué estándares mínimos te
// aplican (número de trabajadores y clase de riesgo) y lo que eso implica.
// F8: arriba, los pendientes con fecha (mismos plazos que las alertas).
export default async function SstPage() {
  await requireUsuario();
  const acceso = await getAccesoSst();
  if (!acceso.puedeVer) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No tienes permiso para ver el SG-SST.</AlertDescription>
      </Alert>
    );
  }

  const supabase = await createClient();
  const { perfil, conteo, d, errorPerfil } = await getDiagnostico(supabase);
  const pendientes = pendientesSst(
    await getInsumosTablero(supabase, {
      hoy: hoyColombia(),
      gestion: acceso.gestion,
      modo: perfil?.modo ?? "empleador",
      licenciaVence: perfil?.responsable_licencia_vence ?? null,
    }),
  );

  return (
    <div className="space-y-6">
      {errorPerfil ? (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertDescription>No pudimos leer el perfil de SG-SST de tu clínica, así que no mostramos un diagnóstico que podría ser incorrecto. Recarga la página; si sigue igual, avísanos.</AlertDescription>
        </Alert>
      ) : !conteo || !d ? (
        <Alert>
          <TriangleAlertIcon />
          <AlertDescription>El SG-SST se está terminando de instalar en tu cuenta. Vuelve a intentarlo en unos minutos.</AlertDescription>
        </Alert>
      ) : (
        <>
          <Pendientes items={pendientes} gestion={acceso.gestion} />
          <Card className={cn(d.grupo === "sin_calcular" && "border-amber-300")}>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Qué te exige la norma</CardTitle>
              <p className="text-sm text-muted-foreground">{d.motivo}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Cifra
                  icono={ClipboardListIcon}
                  titulo="Estándares mínimos"
                  valor={d.estandares ? String(d.estandares) : d.grupo === "independiente" ? "Lista básica" : "—"}
                  detalle={d.estandares ? "Res. 0312 de 2019" : d.grupo === "independiente" ? "Trabajas solo" : "Faltan datos"}
                  tono={d.grupo === "sin_calcular" ? "alerta" : undefined}
                />
                <Cifra
                  icono={UsersRoundIcon}
                  titulo="Trabajadores que cuentan"
                  valor={String(d.trabajadores)}
                  detalle={[
                    `${conteo.dependientes} con contrato laboral`,
                    `${conteo.contratistas} contratista${conteo.contratistas === 1 ? "" : "s"}${perfil?.excluye_contratistas ? " (no cuentan)" : ""}`,
                    conteo.sin_categoria ? `${conteo.sin_categoria} sin tipo de contrato` : null,
                    perfil?.otros_trabajadores ? `${perfil.otros_trabajadores} fuera de RRHH` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  href="/rrhh"
                />
                <Cifra
                  icono={ShieldAlertIcon}
                  titulo="Clase de riesgo"
                  valor={d.clase ?? "—"}
                  detalle={d.fuenteClase ? `Según ${FUENTE[d.fuenteClase]}` : "Elige tu nivel de riesgo ARL"}
                  tono={d.clase === "IV" || d.clase === "V" ? "rojo" : !d.clase ? "alerta" : undefined}
                />
                <Cifra
                  icono={HardHatIcon}
                  titulo="Comité de SST"
                  valor={d.comite.tipo === "copasst" ? "COPASST" : d.comite.tipo === "vigia" ? "Vigía" : "—"}
                  detalle={
                    d.comite.tipo === "copasst"
                      ? `${d.comite.representantesPorParte} representante${d.comite.representantesPorParte === 1 ? "" : "s"} por cada parte`
                      : d.comite.tipo === "vigia"
                        ? "Menos de 10 trabajadores"
                        : "Sin trabajadores"
                  }
                />
              </div>

              {d.clasesDistintas.length > 0 ? (
                <Alert>
                  <TriangleAlertIcon />
                  <AlertDescription>
                    Tus datos no coinciden:{" "}
                    {d.clasesDistintas.map((c) => `${FUENTE[c.fuente]} dice riesgo ${c.clase}`).join("; ")}. Usamos la
                    mayor ({d.clase}) para no quedarnos cortos. Revisa la clase de cada cargo en RRHH y la de tu afiliación.
                  </AlertDescription>
                </Alert>
              ) : null}
              {conteo.cargos_sin_clase > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {conteo.cargos_sin_clase} persona{conteo.cargos_sin_clase === 1 ? " tiene" : "s tienen"} un cargo sin clase de riesgo en RRHH.
                </p>
              ) : null}

              <ul className="space-y-1.5 text-sm">
                {d.responsable ? (
                  <li>
                    <span className="font-medium">Responsable del SG-SST:</span> {d.responsable}
                  </li>
                ) : null}
                {d.convivencia.requerido ? (
                  <li>
                    <span className="font-medium">Comité de Convivencia Laboral</span> (Res. 3461 de 2025){" "}
                    <span className="text-xs text-muted-foreground">· por confirmar con el texto oficial</span>
                  </li>
                ) : null}
                {d.grupo === "independiente" ? (
                  <li>
                    Tu lista básica: afiliación a la ARL al día, identificar tus peligros (biológico, postura, carga de trabajo),
                    vacunas, elementos de protección, evaluación médica, reportar a la ARL si te accidentas y entregar a quien te
                    contrata lo que su SG-SST te pida.
                  </li>
                ) : null}
              </ul>
              <p className="text-xs text-muted-foreground">
                Los umbrales salen de la Res. 0312 de 2019 (7 estándares hasta 10 trabajadores con riesgo I a III; 21 de 11 a 50;
                60 con más de 50 o con riesgo IV o V). Los textos de cada estándar son orientativos mientras los cotejamos con el texto
                oficial.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Tus datos</CardTitle>
              <p className="text-sm text-muted-foreground">
                Los trabajadores salen de RRHH (activos, según su tipo de contrato). Aquí completas lo que RRHH no sabe.
              </p>
            </CardHeader>
            <CardContent>
              <PerfilSstForm perfil={perfil} puedeEditar={acceso.puedeEditar} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

const TONO: Record<Pendiente["tono"], string> = {
  rojo: "bg-destructive",
  ambar: "bg-amber-500",
  info: "bg-primary",
};

function Pendientes({ items, gestion }: { items: Pendiente[]; gestion: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Pendientes</CardTitle>
        <p className="text-sm text-muted-foreground">
          Lo que vence o ya venció. Te avisamos también por correo{gestion ? "" : " (en el plan Gratis, solo los reportes e investigaciones de eventos)"}.
        </p>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleCheckIcon className="size-4 text-emerald-600" /> Nada pendiente por ahora.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {items.map((p) => (
              <li key={p.clave}>
                <Link href={p.href} className="flex items-center gap-3 p-3 transition-colors hover:bg-muted">
                  <span className={cn("size-2.5 shrink-0 rounded-full", TONO[p.tono])} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{p.titulo}</span>
                    <span className="block text-xs text-muted-foreground">{p.detalle}</span>
                  </span>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Cifra({
  icono: Icono,
  titulo,
  valor,
  detalle,
  href,
  tono,
}: {
  icono: LucideIcon;
  titulo: string;
  valor: string;
  detalle: string;
  href?: string;
  tono?: "alerta" | "rojo";
}) {
  const contenido = (
    <div className={cn("flex h-full items-start gap-3 rounded-lg border p-3", href && "transition-colors hover:bg-muted")}>
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          tono === "rojo" ? "bg-destructive/10 text-destructive" : tono === "alerta" ? "bg-amber-50 text-amber-700" : "bg-primary/10 text-accent-foreground",
        )}
      >
        <Icono className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className={cn("text-xl font-semibold", tono === "rojo" && "text-destructive", tono === "alerta" && "text-amber-700")}>{valor}</p>
        <p className="text-xs text-muted-foreground">{detalle}</p>
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-lg">
      {contenido}
    </Link>
  ) : (
    contenido
  );
}
