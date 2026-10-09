"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  LightbulbIcon,
  ListChecksIcon,
  SkipForwardIcon,
  WandSparklesIcon,
} from "lucide-react";
import { estadoModulo, type ModuloConfiguracion, type Punto, type ResumenConfiguracion } from "@/lib/configuracion/lista";
import { CLAVE_OMITIDOS, guardarOmitidos, leerOmitidos, olvidarVolver, recordarVolver, RUTA_ASISTENTE } from "@/lib/configuracion/volver";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Lee los módulos omitidos sin desajustar el render del servidor.
function suscribirOmitidos(aviso: () => void) {
  const alCambiar = (e: StorageEvent) => e.key === CLAVE_OMITIDOS && aviso();
  window.addEventListener("storage", alCambiar);
  window.addEventListener("ewah-omitidos", aviso);
  return () => {
    window.removeEventListener("storage", alCambiar);
    window.removeEventListener("ewah-omitidos", aviso);
  };
}
function snapshotOmitidos() {
  try {
    return localStorage.getItem(CLAVE_OMITIDOS) ?? "[]";
  } catch {
    return "[]";
  }
}

export function AsistenteConfiguracion({ modulos, resumen, paso }: { modulos: ModuloConfiguracion[]; resumen: ResumenConfiguracion; paso: number }) {
  const omitidosTexto = useSyncExternalStore(suscribirOmitidos, snapshotOmitidos, () => "[]");
  const omitidos = new Set<string>(JSON.parse(omitidosTexto) as string[]);
  const avance = resumen.obligatorios ? Math.round((resumen.listos / resumen.obligatorios) * 100) : 100;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <WandSparklesIcon className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold">Configura tu clínica</h1>
            <p className="text-sm text-muted-foreground">
              Te guiamos módulo por módulo. Puedes omitir lo que quieras y volver después: aquí siempre verás qué falta y qué deja de funcionar.
            </p>
          </div>
        </div>
        {paso === 0 ? (
          <Button nativeButton={false} render={<Link href={`${RUTA_ASISTENTE}?paso=${primerPasoPendiente(modulos)}`} />} className="shrink-0">
            {resumen.listos === 0 ? "Empezar paso a paso" : "Continuar paso a paso"} <ArrowRightIcon />
          </Button>
        ) : (
          <Button variant="outline" nativeButton={false} render={<Link href={RUTA_ASISTENTE} />} className="shrink-0">
            <ListChecksIcon /> Ver toda la lista
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="space-y-2 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">
              {resumen.faltan === 0 ? "Lo esencial está listo" : `${resumen.listos} de ${resumen.obligatorios} cosas esenciales listas`}
            </span>
            <span className="text-muted-foreground">
              {resumen.faltan > 0 ? `Faltan ${resumen.faltan}` : null}
              {resumen.faltan > 0 && resumen.recomendados > 0 ? " · " : null}
              {resumen.recomendados > 0 ? `${resumen.recomendados} ${resumen.recomendados === 1 ? "sugerencia" : "sugerencias"}` : null}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={avance} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de la configuración">
            <div className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${avance}%` }} />
          </div>
        </CardContent>
      </Card>

      {paso === 0 ? <Resumen modulos={modulos} omitidos={omitidos} /> : <Paso modulos={modulos} paso={paso} omitidos={omitidos} />}
    </div>
  );
}

function primerPasoPendiente(modulos: ModuloConfiguracion[]): number {
  const i = modulos.findIndex((m) => estadoModulo(m) !== "completo");
  return i < 0 ? 1 : i + 1;
}

function ChipModulo({ modulo, omitido }: { modulo: ModuloConfiguracion; omitido: boolean }) {
  const estado = estadoModulo(modulo);
  const faltan = modulo.puntos.filter((p) => p.tipo === "obligatorio" && p.estado === "pendiente").length;
  if (estado === "completo") return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Completo</Badge>;
  if (estado === "faltan")
    return (
      <span className="flex flex-wrap gap-1">
        <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400">
          {faltan === 1 ? "Falta 1" : `Faltan ${faltan}`}
        </Badge>
        {omitido ? <Badge variant="outline">Omitido</Badge> : null}
      </span>
    );
  return <Badge variant="outline">Sugerencias</Badge>;
}

function Resumen({ modulos, omitidos }: { modulos: ModuloConfiguracion[]; omitidos: Set<string> }) {
  return (
    <div className="space-y-4">
      {modulos.map((m, i) => (
        <Card key={m.codigo}>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold">
                <Link href={`${RUTA_ASISTENTE}?paso=${i + 1}`} className="hover:underline">
                  {m.titulo}
                </Link>
              </CardTitle>
              <p className="text-sm text-muted-foreground">{m.paraQue}</p>
            </div>
            <ChipModulo modulo={m} omitido={omitidos.has(m.codigo)} />
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {m.puntos.map((p) => (
                <FilaPunto key={p.id} punto={p} paso={i + 1} compacta />
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Paso({ modulos, paso, omitidos }: { modulos: ModuloConfiguracion[]; paso: number; omitidos: Set<string> }) {
  const router = useRouter();
  const m = modulos[paso - 1];
  const ultimo = paso === modulos.length;
  const siguiente = ultimo ? RUTA_ASISTENTE : `${RUTA_ASISTENTE}?paso=${paso + 1}`;
  const pendientesEsenciales = m.puntos.filter((p) => p.tipo === "obligatorio" && p.estado === "pendiente");

  function omitir() {
    const nuevos = leerOmitidos();
    nuevos.add(m.codigo);
    guardarOmitidos(nuevos);
    window.dispatchEvent(new Event("ewah-omitidos"));
    router.push(siguiente);
  }

  function avanzar() {
    if (pendientesEsenciales.length === 0) {
      const nuevos = leerOmitidos();
      if (nuevos.delete(m.codigo)) {
        guardarOmitidos(nuevos);
        window.dispatchEvent(new Event("ewah-omitidos"));
      }
    }
    if (ultimo) olvidarVolver();
    router.push(siguiente);
  }

  return (
    <div className="space-y-4">
      <nav aria-label="Pasos de la configuración" className="flex gap-2 overflow-x-auto pb-1">
        {modulos.map((x, i) => {
          const estado = estadoModulo(x);
          const actual = i + 1 === paso;
          return (
            <Link
              key={x.codigo}
              href={`${RUTA_ASISTENTE}?paso=${i + 1}`}
              aria-current={actual ? "step" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                actual ? "border-primary bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-muted/70",
              )}
            >
              {estado === "completo" ? <CircleCheckIcon className="size-3.5 text-emerald-600" /> : estado === "faltan" ? <CircleAlertIcon className="size-3.5 text-amber-600" /> : <LightbulbIcon className="size-3.5" />}
              {i + 1}. {x.titulo}
            </Link>
          );
        })}
      </nav>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Paso {paso} de {modulos.length}
            </p>
            <CardTitle className="text-lg font-semibold">{m.titulo}</CardTitle>
            <p className="text-sm text-muted-foreground">{m.paraQue}</p>
          </div>
          <ChipModulo modulo={m} omitido={omitidos.has(m.codigo)} />
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {m.puntos.map((p) => (
              <FilaPunto key={p.id} punto={p} paso={paso} />
            ))}
          </ul>
        </CardContent>
      </Card>

      {pendientesEsenciales.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Si omites este paso, lo verás pendiente en la lista y te recordaremos qué partes de {m.titulo.toLowerCase()} no funcionarán completas.
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" nativeButton={false} render={<Link href={paso > 1 ? `${RUTA_ASISTENTE}?paso=${paso - 1}` : RUTA_ASISTENTE} />}>
          <ArrowLeftIcon /> {paso > 1 ? "Anterior" : "Volver a la lista"}
        </Button>
        <div className="flex flex-col gap-2 sm:flex-row">
          {pendientesEsenciales.length > 0 ? (
            <Button variant="outline" onClick={omitir}>
              <SkipForwardIcon /> Omitir por ahora
            </Button>
          ) : null}
          <Button onClick={avanzar}>
            {ultimo ? "Terminar y ver la lista" : "Siguiente"} <ArrowRightIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}

function FilaPunto({ punto: p, paso, compacta = false }: { punto: Punto; paso: number; compacta?: boolean }) {
  const listo = p.estado === "listo";
  const esencial = p.tipo === "obligatorio";
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
      <span className="mt-0.5 shrink-0" aria-hidden>
        {listo ? (
          <CircleCheckIcon className="size-5 text-emerald-600" />
        ) : esencial ? (
          <CircleAlertIcon className="size-5 text-amber-600" />
        ) : (
          <LightbulbIcon className="size-5 text-muted-foreground" />
        )}
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("text-sm font-medium", listo && "text-muted-foreground")}>{p.titulo}</span>
          <span className="sr-only">{listo ? "(listo)" : esencial ? "(esencial, pendiente)" : "(recomendado)"}</span>
          {!listo ? (
            <Badge variant="outline" className={cn("text-[11px]", esencial ? "border-amber-300 text-amber-700 dark:text-amber-400" : "")}>
              {esencial ? "Esencial" : "Recomendado"}
            </Badge>
          ) : null}
          {p.detalle ? <span className="text-xs text-muted-foreground">{p.detalle}</span> : null}
        </span>
        {!compacta || !listo ? <span className="block text-xs text-muted-foreground">{p.queEs}</span> : null}
        {!listo ? (
          <span className={cn("block rounded-md px-2 py-1.5 text-xs", esencial ? "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" : "bg-muted/60 text-muted-foreground")}>
            <span className="font-medium">{esencial ? "Si no lo configuras: " : "Por qué conviene: "}</span>
            {p.impacto}
          </span>
        ) : null}
      </span>
      {!listo || !compacta ? (
        <Button
          size="sm"
          variant={!listo && esencial ? "default" : "outline"}
          className="shrink-0 self-start"
          nativeButton={false} render={<Link href={p.href} onClick={() => recordarVolver(paso)} />}
        >
          {listo ? "Revisar" : p.accion}
        </Button>
      ) : null}
    </li>
  );
}
