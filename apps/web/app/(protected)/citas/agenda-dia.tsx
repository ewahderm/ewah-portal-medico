"use client";

import { useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { hoy } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { nombreCompleto, type CitaRow } from "./tipos";
import { ESTADOS_POR_CLAVE } from "./estados-cita";
import { colorPorProfesional } from "./colores-profesional";

// Agenda en celular: en vez del calendario, la lista de citas del día en
// orden, como tarjetas. Por defecto solo las del usuario (el médico ve sus
// pacientes); "Todos" muestra la de todos los profesionales. Los datos y
// las ventanas (detalle y nueva cita) son los mismos del calendario.
export function AgendaDia({
  citas,
  fecha,
  usuarioActualId,
  puedeCrear,
  onAbrir,
  onNueva,
  onCambiarFecha,
}: {
  citas: CitaRow[];
  fecha: string;
  usuarioActualId: string;
  puedeCrear: boolean;
  onAbrir: (id: string) => void;
  onNueva: (fecha: string) => void;
  onCambiarFecha: (fecha: string) => void;
}) {
  const [soloMias, setSoloMias] = useState(true);
  const delDia = citas
    .filter((c) => c.fecha === fecha && (!soloMias || c.profesional_id === usuarioActualId))
    .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
  const activas = delDia.filter((c) => !c.es_bloqueo && c.estado !== "cancelada").length;
  const dia = parseISO(fecha);
  const esHoy = fecha === hoy();
  const mover = (n: number) => onCambiarFecha(format(addDays(dia, n), "yyyy-MM-dd"));

  return (
    <div className="space-y-3 md:hidden">
      {/* Franja superior compacta: día y acciones en dos filas cortas. */}
      <div className="sticky top-0 z-10 -mx-4 space-y-2 border-b bg-background/95 px-4 pb-2 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Día anterior" onClick={() => mover(-1)}>
            <ChevronLeftIcon />
          </Button>
          <label className="relative min-w-0 flex-1 text-center">
            <span className="block truncate text-sm font-semibold capitalize">{format(dia, "EEEE d 'de' MMMM", { locale: es })}</span>
            <span className="block text-xs text-muted-foreground">
              {activas} {activas === 1 ? "cita" : "citas"}
              {esHoy ? " · hoy" : ""}
            </span>
            {/* Tocar la fecha abre el selector del teléfono. */}
            <input
              type="date"
              aria-label="Elegir día"
              value={fecha}
              onChange={(e) => e.target.value && onCambiarFecha(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
          <Button variant="ghost" size="icon-sm" aria-label="Día siguiente" onClick={() => mover(1)}>
            <ChevronRightIcon />
          </Button>
          {!esHoy ? (
            <Button variant="outline" size="xs" onClick={() => onCambiarFecha(hoy())}>
              Hoy
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-1 rounded-lg bg-muted p-0.5 text-xs" role="radiogroup" aria-label="De quién">
            {[
              { valor: true, texto: "Mis citas" },
              { valor: false, texto: "Todos" },
            ].map((o) => (
              <button
                key={o.texto}
                type="button"
                role="radio"
                aria-checked={soloMias === o.valor}
                onClick={() => setSoloMias(o.valor)}
                className={cn("flex-1 rounded-md px-2 py-1 font-medium transition-colors", soloMias === o.valor ? "bg-background shadow-sm" : "text-muted-foreground")}
              >
                {o.texto}
              </button>
            ))}
          </div>
          {puedeCrear ? (
            <Button size="sm" onClick={() => onNueva(fecha)}>
              <PlusIcon /> Cita
            </Button>
          ) : null}
        </div>
      </div>

      {delDia.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {soloMias ? "No tienes citas este día." : "No hay citas este día."}
          {soloMias ? (
            <button type="button" className="mt-1 block w-full font-medium text-primary" onClick={() => setSoloMias(false)}>
              Ver la agenda de todos
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-2">
          {delDia.map((c) => (
            <li key={c.id}>
              <TarjetaCita cita={c} mostrarProfesional={!soloMias} onAbrir={() => onAbrir(c.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TarjetaCita({ cita: c, mostrarProfesional, onAbrir }: { cita: CitaRow; mostrarProfesional: boolean; onAbrir: () => void }) {
  const info = ESTADOS_POR_CLAVE[c.es_bloqueo ? "bloqueo" : c.estado];
  const cancelada = c.estado === "cancelada";
  const titulo = c.es_bloqueo ? `Bloqueo${c.motivo ? `: ${c.motivo}` : ""}` : c.pacientes ? nombreCompleto(c.pacientes) : "Cita";
  const detalle = [c.tipos_tratamiento?.nombre, c.consultorios?.nombre, mostrarProfesional ? c.profesional?.nombre : null].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={cn(
        "flex w-full items-stretch gap-3 rounded-xl border bg-card p-3 text-left shadow-xs transition active:scale-[0.99] motion-reduce:transform-none",
        (cancelada || c.es_bloqueo) && "opacity-60",
      )}
      style={{ borderLeft: `5px solid ${colorPorProfesional(c.profesional_id)}` }}
    >
      <span className="w-12 shrink-0 tabular-nums">
        <span className="block text-sm font-semibold">{c.todo_el_dia ? "Día" : c.hora_inicio.slice(0, 5)}</span>
        <span className="block text-xs text-muted-foreground">{c.todo_el_dia ? "completo" : c.hora_fin.slice(0, 5)}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm font-medium", cancelada && "line-through")}>{titulo}</span>
        {detalle ? <span className="block truncate text-xs text-muted-foreground">{detalle}</span> : null}
      </span>
      {info ? (
        <span className="flex shrink-0 flex-col items-end justify-center gap-1">
          <span className="inline-flex size-6 items-center justify-center rounded-full" style={{ backgroundColor: info.bgInsignia }} aria-hidden>
            <info.Icono className="size-3.5" style={{ color: info.colorIcono }} strokeWidth={2.5} />
          </span>
          <span className="text-[10px] text-muted-foreground">{info.label}</span>
        </span>
      ) : null}
    </button>
  );
}
