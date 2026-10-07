"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { calificarItem, cerrarAutoevaluacion, iniciarAutoevaluacion } from "@/lib/sst/estandares-acciones";
import { NIVELES_ESTANDARES, avance, porCiclo, type EstadoItem } from "@/lib/sst/estandares";
import { CICLOS } from "@/lib/sst/documentos-catalogo";
import type { AccionSst, AutoevaluacionResumen, ItemAutoevaluacion } from "@/lib/sst/consultas";
import { fechaLegible } from "@/lib/habilitacion/ruta";
import { cn } from "cn";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { BarraProgreso } from "../../habilitacion/autoevaluacion/barra-progreso";
import { PlanAccion } from "../_components/plan-accion";

type Grupo = "7" | "21" | "60";
type Usuario = { id: string; nombre: string };
type Filtro = "todos" | "pendiente" | "no_cumple";

const OPCIONES: { value: Exclude<EstadoItem, "pendiente">; label: string }[] = [
  { value: "cumple", label: "Cumple" },
  { value: "no_cumple", label: "No cumple" },
  { value: "no_aplica", label: "No aplica" },
];

const TONO_NIVEL = { rojo: "destructive", ambar: "outline", verde: "secondary" } as const;

export function EstandaresCliente(props: {
  anio: number;
  anioActual: number;
  autoevaluacion: AutoevaluacionResumen | null;
  historial: AutoevaluacionResumen[];
  items: ItemAutoevaluacion[];
  acciones: AccionSst[];
  grupoSugerido: Grupo | null;
  motivoGrupo: string | null;
  usuarios: Usuario[];
  puedeCrear: boolean;
  puedeEditar: boolean;
  puedeAprobar: boolean;
}) {
  const { anio, autoevaluacion: ae, items } = props;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="text-base font-semibold">Estándares mínimos {anio}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Cada año, antes de terminar diciembre, califica los estándares que te corresponden. Con el resultado armas el plan de
            mejoramiento y el plan de trabajo del año siguiente; los ítems que no aplican se justifican.
          </p>
          <SelectorAnio {...props} />
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert>
            <AlertDescription>
              Los textos de los estándares y su calificación son orientativos: están redactados con base en la Res. 0312 de 2019 y
              están pendientes de cotejo con el texto oficial. El reporte oficial se hace en el formato del Ministerio del Trabajo.
            </AlertDescription>
          </Alert>
          {ae ? <Resumen ae={ae} items={items} grupoSugerido={props.grupoSugerido} puedeAprobar={props.puedeAprobar} /> : <Iniciar {...props} />}
        </CardContent>
      </Card>
      {ae ? <Items {...props} ae={ae} /> : null}
    </div>
  );
}

function SelectorAnio({ anio, anioActual, historial }: { anio: number; anioActual: number; historial: AutoevaluacionResumen[] }) {
  const anios = Array.from(new Set([anioActual, ...historial.map((h) => h.anio)])).sort((a, b) => b - a);
  const porAnio = new Map(historial.map((h) => [h.anio, h]));
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {anios.map((a) => {
        const h = porAnio.get(a);
        return (
          <Link
            key={a}
            href={`/sst/estandares?anio=${a}`}
            aria-current={a === anio ? "page" : undefined}
            className={cn("rounded-md border px-2 py-1 hover:bg-muted", a === anio && "border-primary bg-primary/5 font-medium")}
          >
            {a}
            {h ? ` · ${h.estado === "cerrada" ? `${h.puntaje}%` : "en curso"}` : ""}
          </Link>
        );
      })}
      {!porAnio.has(anioActual - 1) && anio !== anioActual - 1 ? (
        <Link href={`/sst/estandares?anio=${anioActual - 1}`} className="rounded-md border border-dashed px-2 py-1 text-muted-foreground hover:bg-muted">
          {anioActual - 1}
        </Link>
      ) : null}
    </div>
  );
}

function Iniciar({ anio, grupoSugerido, motivoGrupo, puedeCrear }: { anio: number; grupoSugerido: Grupo | null; motivoGrupo: string | null; puedeCrear: boolean }) {
  const router = useRouter();
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function iniciar() {
    if (!grupoSugerido) return;
    setPendiente(true);
    setError(null);
    const r = await iniciarAutoevaluacion(anio);
    setPendiente(false);
    if (r.error) return setError(r.error);
    toast.add({ title: `Autoevaluación ${anio} iniciada`, type: "success" });
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <p className="text-sm">Todavía no hay autoevaluación de {anio}.</p>
      {motivoGrupo ? (
        <p className="text-sm text-muted-foreground">
          Según el diagnóstico: {motivoGrupo}{" "}
          <Link href="/sst" className="text-primary underline-offset-4 hover:underline">
            Revisar el diagnóstico
          </Link>
        </p>
      ) : null}
      {puedeCrear ? (
        <>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {grupoSugerido ? (
            <p className="text-sm">
              Te corresponden <span className="font-medium">{grupoSugerido} estándares</span>. El grupo lo define el número de trabajadores y la clase
              de riesgo; no se puede elegir uno menor.
            </p>
          ) : (
            <Alert>
              <AlertDescription>
                Aún no podemos saber qué grupo te corresponde. Completa el diagnóstico (trabajadores y clase de riesgo) y vuelve.
              </AlertDescription>
            </Alert>
          )}
          <Button onClick={iniciar} disabled={!grupoSugerido || pendiente}>
            {pendiente ? "Iniciando…" : "Iniciar autoevaluación"}
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No tienes permiso para iniciarla.</p>
      )}
    </div>
  );
}

function Resumen({ ae, items, grupoSugerido, puedeAprobar }: { ae: AutoevaluacionResumen; items: ItemAutoevaluacion[]; grupoSugerido: Grupo | null; puedeAprobar: boolean }) {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState(false);
  const [pendiente, setPendiente] = useState(false);
  const calificados = items.map((i) => ({ estado: i.estado, peso: i.estandar.peso, ciclo: i.estandar.ciclo }));
  const av = avance(calificados);
  const ciclos = porCiclo(calificados);
  const cerrada = ae.estado === "cerrada";
  const puntaje = cerrada && ae.puntaje !== null ? ae.puntaje : av.puntaje;
  const nivel = NIVELES_ESTANDARES[cerrada && ae.nivel ? ae.nivel : av.nivel];

  async function cerrar() {
    setPendiente(true);
    const r = await cerrarAutoevaluacion(ae.id);
    setPendiente(false);
    if (r.error) return toast.add({ title: "No se cerró", description: r.error, type: "error" });
    setConfirmar(false);
    toast.add({ title: "Autoevaluación cerrada", type: "success" });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {grupoSugerido && grupoSugerido !== ae.grupo ? (
        <Alert variant="destructive">
          <AlertDescription>
            Esta autoevaluación es de {ae.grupo} estándares, pero el diagnóstico de hoy indica {grupoSugerido}. Si cambió el número de
            trabajadores o la clase de riesgo, la del próximo año debe hacerse con el grupo nuevo.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">{cerrada ? `Resultado (cerrada el ${fechaLegible(ae.fecha_cierre?.slice(0, 10) ?? null)})` : "Si la cerraras hoy"}</p>
          <p className="text-3xl font-semibold">{puntaje}%</p>
          <Badge variant={TONO_NIVEL[nivel.tono]} className="w-fit">
            {nivel.label}
          </Badge>
          <p className="mt-2 text-xs text-muted-foreground">{nivel.que}</p>
        </div>
        <div className="space-y-3">
          <BarraProgreso valor={av.total ? (av.calificados / av.total) * 100 : 0} etiqueta={`${av.calificados} de ${av.total} ítems calificados · grupo de ${ae.grupo}`} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CICLOS.map((c) => (
              <div key={c.value} className="rounded-lg border p-2">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="text-sm font-medium">{ciclos[c.value].posible ? `${ciclos[c.value].logrado} de ${ciclos[c.value].posible}` : "—"}</p>
              </div>
            ))}
          </div>
          {!cerrada && puedeAprobar ? (
            confirmar ? (
              <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
                <p>Al cerrarla, la plataforma fija el puntaje y ya no se puede modificar. ¿La cierras?</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setConfirmar(false)} disabled={pendiente}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={cerrar} disabled={pendiente}>
                    {pendiente ? "Cerrando…" : "Cerrar autoevaluación"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                <Button size="sm" className="w-fit" onClick={() => setConfirmar(true)} disabled={av.pendientes > 0}>
                  Cerrar autoevaluación
                </Button>
                {av.pendientes > 0 ? <span className="text-xs text-muted-foreground">Faltan {av.pendientes} ítems por calificar.</span> : null}
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Items(props: { ae: AutoevaluacionResumen; items: ItemAutoevaluacion[]; acciones: AccionSst[]; usuarios: Usuario[]; puedeCrear: boolean; puedeEditar: boolean }) {
  const { ae, items } = props;
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const visibles = items.filter((i) => filtro === "todos" || i.estado === filtro);
  const accionesPorItem = new Map<string, AccionSst[]>();
  for (const a of props.acciones) if (a.origen_id) accionesPorItem.set(a.origen_id, [...(accionesPorItem.get(a.origen_id) ?? []), a]);
  const nombres = Object.fromEntries(props.usuarios.map((u) => [u.id, u.nombre]));
  const editable = ae.estado === "abierta" && props.puedeEditar;
  const conteo = (f: Filtro) => (f === "todos" ? items.length : items.filter((i) => i.estado === f).length);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base font-semibold">Ítems</CardTitle>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar ítems">
          {(
            [
              ["todos", "Todos"],
              ["pendiente", "Sin calificar"],
              ["no_cumple", "No cumple"],
            ] as const
          ).map(([f, l]) => (
            <Button key={f} size="sm" variant={filtro === f ? "default" : "outline"} aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
              {l} ({conteo(f)})
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {visibles.length === 0 ? <p className="text-sm text-muted-foreground">No hay ítems en este filtro.</p> : null}
        {CICLOS.map((c) => {
          const delCiclo = visibles.filter((i) => i.estandar.ciclo === c.value);
          if (delCiclo.length === 0) return null;
          return (
            <section key={c.value} className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{c.label}</h3>
              <ul className="space-y-3">
                {delCiclo.map((i) => (
                  <ItemCard
                    key={`${i.id}-${i.updated_at}`}
                    item={i}
                    editable={editable}
                    acciones={accionesPorItem.get(i.id) ?? []}
                    usuarios={props.usuarios}
                    nombres={nombres}
                    puedeCrear={props.puedeCrear}
                    puedeEditar={props.puedeEditar}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ItemCard({
  item,
  editable,
  acciones,
  usuarios,
  nombres,
  puedeCrear,
  puedeEditar,
}: {
  item: ItemAutoevaluacion;
  editable: boolean;
  acciones: AccionSst[];
  usuarios: Usuario[];
  nombres: Record<string, string>;
  puedeCrear: boolean;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  // Estado local congelado al montar: la key incluye updated_at, así que
  // tras guardar y refrescar el ítem se vuelve a montar con lo de la BD.
  const [estado, setEstado] = useState<EstadoItem>(item.estado);
  const [justificacion, setJustificacion] = useState(item.justificacion ?? "");
  const [observacion, setObservacion] = useState(item.observacion ?? "");
  const [pendiente, setPendiente] = useState(false);
  const e = item.estandar;
  const cambiado = estado !== item.estado || justificacion !== (item.justificacion ?? "") || observacion !== (item.observacion ?? "");
  const faltaJustificar = estado === "no_aplica" && justificacion.trim().length < 10;

  async function guardar() {
    setPendiente(true);
    const r = await calificarItem({ id: item.id, estado, justificacion, observacion });
    setPendiente(false);
    if (r.error) return toast.add({ title: "No se guardó", description: r.error, type: "error" });
    toast.add({ title: `${e.codigo}: calificación guardada`, type: "success" });
    router.refresh();
  }

  return (
    <li
      className={cn(
        "space-y-3 rounded-lg border p-3",
        item.estado === "no_cumple" && "border-destructive/40",
        item.estado === "pendiente" && "border-dashed",
      )}
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{e.codigo}</span>
          <span className="text-xs text-muted-foreground">
            {e.componente} · {e.peso} {e.peso === 1 ? "punto" : "puntos"}
          </span>
          {!editable ? (
            <Badge variant={item.estado === "no_cumple" ? "destructive" : item.estado === "pendiente" ? "outline" : "secondary"} className="w-fit">
              {OPCIONES.find((o) => o.value === item.estado)?.label ?? "Sin calificar"}
            </Badge>
          ) : null}
        </div>
        <p className="text-sm font-medium">{e.nombre}</p>
        <p className="text-xs text-muted-foreground">{e.descripcion}</p>
      </div>

      {editable ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`Calificación de ${e.codigo}`}>
            {OPCIONES.map((o) => (
              <Button
                key={o.value}
                type="button"
                size="sm"
                role="radio"
                aria-checked={estado === o.value}
                variant={estado === o.value ? (o.value === "no_cumple" ? "destructive" : "default") : "outline"}
                onClick={() => setEstado(o.value)}
              >
                {o.label}
              </Button>
            ))}
          </div>
          {estado === "no_aplica" ? (
            <Textarea
              value={justificacion}
              onChange={(ev) => setJustificacion(ev.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="¿Por qué no aplica? (al menos 10 caracteres)"
              aria-label={`Justificación de ${e.codigo}`}
            />
          ) : null}
          <Textarea
            value={observacion}
            onChange={(ev) => setObservacion(ev.target.value)}
            rows={1}
            maxLength={2000}
            placeholder="Evidencia u observación (opcional)"
            aria-label={`Observación de ${e.codigo}`}
          />
          {cambiado ? (
            <Button size="sm" onClick={guardar} disabled={pendiente || estado === "pendiente" || faltaJustificar}>
              {pendiente ? "Guardando…" : "Guardar"}
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          {item.justificacion ? <p className="text-xs">No aplica porque: {item.justificacion}</p> : null}
          {item.observacion ? <p className="text-xs text-muted-foreground">{item.observacion}</p> : null}
        </>
      )}

      {item.estado === "no_cumple" || acciones.length > 0 ? (
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium">Plan de mejoramiento</p>
          <PlanAccion
            origen="autoevaluacion"
            origenId={item.id}
            acciones={acciones}
            usuarios={usuarios}
            nombres={nombres}
            puedeCrear={puedeCrear}
            puedeEditar={puedeEditar}
          />
        </div>
      ) : null}
    </li>
  );
}
