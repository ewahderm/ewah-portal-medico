"use client";

import { startTransition, useCallback, useMemo, useOptimistic, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDownIcon, SearchIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { evaluarCriterio } from "@/lib/habilitacion/autoevaluacion";
import { ESTADOS_EVALUACION, type EstadoEvaluacion } from "@/lib/habilitacion/constantes";
import {
  agruparPorServicio,
  derivarEstados,
  esEvaluable,
  FILTROS_VACIOS,
  filtrarCriterios,
  indicadoresDeFilas,
  type FiltroEstado,
  type Filtros,
} from "@/lib/habilitacion/estado-criterio";
import type { FilaCriterio, UsuarioClinica } from "@/lib/habilitacion/tipos";
import { toast } from "@/components/ui/toast";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { CriterioCard } from "./criterio-card";
import { NoAplicaDialog } from "./no-aplica-dialog";
import { EvidenciaDialog } from "./evidencia-dialog";
import { PlanMejoraDialog } from "./plan-mejora-dialog";
import { DetalleCriterioDialog } from "./detalle-criterio-dialog";

const TODOS = "__todos__";

type Dialogo =
  | { tipo: "no_aplica"; fila: FilaCriterio }
  | { tipo: "evidencia"; fila: FilaCriterio; marcarCumple: boolean }
  | { tipo: "plan"; fila: FilaCriterio; evaluacionId: string }
  | { tipo: "detalle"; fila: FilaCriterio };

type CambioOptimista = { criterioId: string; estado: EstadoEvaluacion };

function leerFiltros(q: URLSearchParams, usuarioId: string): Filtros {
  const estado = q.get("estado");
  return {
    estado: (ESTADOS_EVALUACION.some((e) => e.value === estado) ? estado : "todos") as FiltroEstado,
    servicio: q.get("servicio"),
    texto: q.get("q") ?? "",
    asignadosA: q.get("mios") === "1" ? usuarioId : null,
    reverificar: q.get("reverificar") === "1",
  };
}

export function AutoevaluacionCliente({
  sedeId,
  filas,
  usuarios,
  usuarioId,
  puedeEditar,
}: {
  sedeId: string;
  filas: FilaCriterio[];
  usuarios: UsuarioClinica[];
  usuarioId: string;
  puedeEditar: boolean;
}) {
  const searchParams = useSearchParams();
  const [filtros, setFiltros] = useState<Filtros>(() => leerFiltros(new URLSearchParams(searchParams.toString()), usuarioId));
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [ocupados, setOcupados] = useState<Set<string>>(() => new Set());

  // Escritura optimista (§5.5): el estado cambia al instante; si la action
  // falla, la transición termina y React descarta el valor optimista.
  const [optimistas, aplicar] = useOptimistic(filas, (actual: FilaCriterio[], c: CambioOptimista) =>
    actual.map((f) => (f.criterio_id === c.criterioId ? { ...f, estado: c.estado } : f)),
  );

  const nombres = useMemo(() => new Map(usuarios.map((u) => [u.id, u.nombre])), [usuarios]);
  const estados = useMemo(() => derivarEstados(optimistas), [optimistas]);
  const visibles = useMemo(() => filtrarCriterios(optimistas, filtros, estados), [optimistas, filtros, estados]);
  const servicios = useMemo(() => agruparPorServicio(optimistas).map((g) => ({ value: g.clave, label: `${g.clave} · ${g.nombre}` })), [optimistas]);

  // Conteos por estado para los chips (con los demás filtros aplicados).
  const conteos = useMemo(() => {
    const sinEstado = filtrarCriterios(optimistas, { ...filtros, estado: "todos" }, estados);
    const c: Record<string, number> = { todos: 0, pendiente: 0, cumple: 0, no_cumple: 0, no_aplica: 0 };
    for (const f of optimistas) {
      if (!esEvaluable(f) || !sinEstado.has(f.criterio_id)) continue;
      c.todos++;
      c[f.estado ?? "pendiente"]++;
    }
    return c;
  }, [optimistas, filtros, estados]);

  // Profundidad dentro del árbol visible (para la sangría).
  const porId = useMemo(() => new Map(optimistas.map((f) => [f.criterio_id, f])), [optimistas]);
  const profundidad = useCallback(
    (f: FilaCriterio) => {
      let d = 0;
      let p = f.padre_id ? porId.get(f.padre_id) : undefined;
      while (p && d < 6) {
        d++;
        p = p.padre_id ? porId.get(p.padre_id) : undefined;
      }
      return d;
    },
    [porId],
  );

  // Plegados: encabezados y grupos de servicio. Por defecto se pliegan los
  // grupos sin pendientes (§5.5).
  const [encabezadosPlegados, setEncabezadosPlegados] = useState<Set<string>>(() => new Set());
  const [gruposAbiertos, setGruposAbiertos] = useState<Record<string, boolean>>(() => {
    const abiertos: Record<string, boolean> = {};
    for (const g of agruparPorServicio(filas)) {
      abiertos[g.clave] = g.filas.some((f) => esEvaluable(f) && (f.estado ?? "pendiente") === "pendiente");
    }
    // Si todo está evaluado, al menos el primer grupo abierto.
    if (!Object.values(abiertos).some(Boolean)) {
      const primero = Object.keys(abiertos)[0];
      if (primero) abiertos[primero] = true;
    }
    return abiertos;
  });

  const plegarEncabezado = useCallback((id: string) => {
    setEncabezadosPlegados((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }, []);

  const ocultoPorPadre = (f: FilaCriterio) => {
    let p = f.padre_id ? porId.get(f.padre_id) : undefined;
    while (p) {
      if (encabezadosPlegados.has(p.criterio_id)) return true;
      p = p.padre_id ? porId.get(p.padre_id) : undefined;
    }
    return false;
  };

  // Filtros en la URL sin ida al servidor (history API, integrada con el
  // router de Next): el enlace se puede compartir y "Atrás" funciona.
  function cambiarFiltros(parcial: Partial<Filtros>) {
    const nuevos = { ...filtros, ...parcial };
    setFiltros(nuevos);
    const q = new URLSearchParams(window.location.search);
    const fijar = (k: string, v: string | null) => (v ? q.set(k, v) : q.delete(k));
    fijar("estado", nuevos.estado === "todos" ? null : nuevos.estado);
    fijar("servicio", nuevos.servicio);
    fijar("q", nuevos.texto.trim() || null);
    fijar("mios", nuevos.asignadosA ? "1" : null);
    fijar("reverificar", nuevos.reverificar ? "1" : null);
    window.history.replaceState(null, "", `?${q.toString()}`);
    // Al filtrar, abrir los grupos para que el resultado se vea.
    if (parcial.estado !== undefined || parcial.texto !== undefined || parcial.asignadosA !== undefined || parcial.reverificar !== undefined) {
      setGruposAbiertos((prev) => Object.fromEntries(Object.keys(prev).map((k) => [k, true])));
    }
  }

  const guardar = useCallback(
    (fila: FilaCriterio, estado: EstadoEvaluacion) => {
      setOcupados((s) => new Set(s).add(fila.criterio_id));
      startTransition(async () => {
        aplicar({ criterioId: fila.criterio_id, estado });
        const r = await evaluarCriterio({ sedeId, criterioId: fila.criterio_id, estado });
        setOcupados((s) => {
          const n = new Set(s);
          n.delete(fila.criterio_id);
          return n;
        });
        if (r.error) {
          toast.add({ title: "No se guardó", description: r.error, type: "error" });
          return;
        }
        // HU-4.2 AC3: "No cumple" abre directo el plan de mejora.
        if (estado === "no_cumple" && r.evaluacionId) setDialogo({ tipo: "plan", fila, evaluacionId: r.evaluacionId });
      });
    },
    [aplicar, sedeId],
  );

  const marcar = useCallback(
    (fila: FilaCriterio, estado: EstadoEvaluacion) => {
      if (estado === "no_aplica") return setDialogo({ tipo: "no_aplica", fila });
      // Cumple sin evidencia activa → primero la evidencia (se guarda con
      // la evaluación en una sola transacción).
      if (estado === "cumple" && fila.evidencias_activas === 0) return setDialogo({ tipo: "evidencia", fila, marcarCumple: true });
      guardar(fila, estado);
    },
    [guardar],
  );

  const abrirDetalle = useCallback((fila: FilaCriterio) => setDialogo({ tipo: "detalle", fila }), []);

  const grupos = useMemo(() => agruparPorServicio(optimistas.filter((f) => visibles.has(f.criterio_id))), [optimistas, visibles]);
  const hayFiltros =
    filtros.estado !== "todos" || !!filtros.servicio || !!filtros.texto.trim() || !!filtros.asignadosA || filtros.reverificar;

  const CHIPS: { value: FiltroEstado; label: string }[] = [
    { value: "todos", label: "Todos" },
    { value: "pendiente", label: "Pendientes" },
    { value: "cumple", label: "Cumple" },
    { value: "no_cumple", label: "No cumple" },
    { value: "no_aplica", label: "No aplica" },
  ];

  // La fila del diálogo siempre fresca (refleja revalidaciones).
  const filaDialogo = dialogo ? (porId.get(dialogo.fila.criterio_id) ?? dialogo.fila) : null;

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border bg-card p-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
          {CHIPS.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-pressed={filtros.estado === c.value}
              onClick={() => cambiarFiltros({ estado: c.value })}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
                filtros.estado === c.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {c.label}
              <span className={cn("text-xs", filtros.estado === c.value ? "opacity-90" : "text-muted-foreground")}>
                {conteos[c.value] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_minmax(0,18rem)]">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label="Buscar en el texto o el numeral del criterio"
              placeholder="Buscar: tarjeta profesional, 11.1.TH.3…"
              className="pl-8"
              value={filtros.texto}
              onChange={(e) => cambiarFiltros({ texto: e.target.value })}
            />
          </div>
          {servicios.length > 1 ? (
            <Combobox
              aria-label="Servicio"
              items={[{ value: TODOS, label: "Todos los servicios" }, ...servicios]}
              value={filtros.servicio ?? TODOS}
              onValueChange={(v) => cambiarFiltros({ servicio: !v || v === TODOS ? null : v })}
            />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <Switch
              id="filtro-mios"
              checked={!!filtros.asignadosA}
              onCheckedChange={(v) => cambiarFiltros({ asignadosA: v ? usuarioId : null })}
            />
            <Label htmlFor="filtro-mios">Asignados a mí</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="filtro-reverificar"
              checked={filtros.reverificar}
              onCheckedChange={(v) => cambiarFiltros({ reverificar: v })}
            />
            <Label htmlFor="filtro-reverificar">Por re-verificar</Label>
          </div>
          {hayFiltros ? (
            <button
              type="button"
              onClick={() => cambiarFiltros(FILTROS_VACIOS)}
              className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
            >
              <XIcon className="size-3.5" /> Quitar filtros
            </button>
          ) : null}
        </div>
      </div>

      {grupos.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Ningún criterio coincide con los filtros.
        </p>
      ) : null}

      {grupos.map((g) => {
        const abierto = gruposAbiertos[g.clave] ?? true;
        const ind = indicadoresDeFilas(optimistas.filter((f) => f.servicio_clave === g.clave));
        return (
          <section key={g.clave} className="space-y-2" aria-labelledby={`grupo-${g.clave}`}>
            <button
              type="button"
              id={`grupo-${g.clave}`}
              onClick={() => setGruposAbiertos((p) => ({ ...p, [g.clave]: !abierto }))}
              aria-expanded={abierto}
              className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left hover:bg-muted/60"
            >
              <ChevronDownIcon className={cn("size-4 shrink-0 transition-transform duration-150", !abierto && "-rotate-90")} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {g.clave} · {g.nombre}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {ind.evaluados} de {ind.evaluables} evaluados
                  {ind.noCumple > 0 ? ` · ${ind.noCumple} No cumple` : ""}
                  {ind.pendientes > 0 ? ` · ${ind.pendientes} pendientes` : ""}
                </span>
              </span>
            </button>
            {abierto ? (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-150 motion-reduce:animate-none">
                {g.filas.map((f) =>
                  ocultoPorPadre(f) ? null : (
                    <CriterioCard
                      key={f.criterio_id}
                      fila={f}
                      derivado={estados.get(f.criterio_id) ?? { estado: f.estado ?? "pendiente", fuente: "directo" }}
                      profundidad={profundidad(f)}
                      plegado={encabezadosPlegados.has(f.criterio_id)}
                      responsable={f.responsable_id ? (nombres.get(f.responsable_id) ?? "Usuario") : null}
                      esMio={f.responsable_id === usuarioId}
                      puedeEditar={puedeEditar}
                      ocupado={ocupados.has(f.criterio_id)}
                      onPlegar={plegarEncabezado}
                      onMarcar={marcar}
                      onDetalle={abrirDetalle}
                    />
                  ),
                )}
              </div>
            ) : null}
          </section>
        );
      })}

      {dialogo?.tipo === "no_aplica" && filaDialogo ? (
        <NoAplicaDialog
          sedeId={sedeId}
          fila={filaDialogo}
          onCerrar={() => setDialogo(null)}
          onConfirmar={(justificacion) => {
            setDialogo(null);
            setOcupados((s) => new Set(s).add(filaDialogo.criterio_id));
            startTransition(async () => {
              aplicar({ criterioId: filaDialogo.criterio_id, estado: "no_aplica" });
              const r = await evaluarCriterio({
                sedeId,
                criterioId: filaDialogo.criterio_id,
                estado: "no_aplica",
                justificacion,
              });
              setOcupados((s) => {
                const n = new Set(s);
                n.delete(filaDialogo.criterio_id);
                return n;
              });
              if (r.error) toast.add({ title: "No se guardó", description: r.error, type: "error" });
            });
          }}
        />
      ) : null}
      {dialogo?.tipo === "evidencia" && filaDialogo ? (
        <EvidenciaDialog
          sedeId={sedeId}
          fila={filaDialogo}
          marcarCumple={dialogo.marcarCumple}
          onCerrar={() => setDialogo(null)}
        />
      ) : null}
      {dialogo?.tipo === "plan" && filaDialogo ? (
        <PlanMejoraDialog
          sedeId={sedeId}
          fila={filaDialogo}
          evaluacionId={dialogo.evaluacionId}
          usuarios={usuarios}
          usuarioId={usuarioId}
          onCerrar={() => setDialogo(null)}
        />
      ) : null}
      {dialogo?.tipo === "detalle" && filaDialogo ? (
        <DetalleCriterioDialog
          sedeId={sedeId}
          fila={filaDialogo}
          usuarios={usuarios}
          puedeEditar={puedeEditar}
          onCerrar={() => setDialogo(null)}
          onAgregarEvidencia={() => setDialogo({ tipo: "evidencia", fila: filaDialogo, marcarCumple: false })}
          onNuevoPlan={(evaluacionId) => setDialogo({ tipo: "plan", fila: filaDialogo, evaluacionId })}
        />
      ) : null}
    </div>
  );
}
