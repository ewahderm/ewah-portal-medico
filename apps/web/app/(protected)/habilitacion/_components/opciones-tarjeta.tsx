"use client";

import { CheckIcon } from "lucide-react";
import { cn } from "cn";

// Selección por tarjetas grandes (en vez de un desplegable) para preguntas
// de pocas opciones cuya diferencia necesita explicación: el usuario no
// experto lee la ayuda de cada opción antes de elegir. Objetivos táctiles
// ≥ 44 px. Una sola implementación para radio (una opción) y chips
// (varias), usada por Perfil, Edificación y Servicio.

type Opcion = { value: string; label: string; ayuda?: string | null; extra?: React.ReactNode };

export function TarjetasRadio({
  name,
  opciones,
  valor,
  onCambio,
  columnas = 2,
  disabled,
  legend,
}: {
  name: string;
  opciones: readonly Opcion[];
  valor: string | null;
  onCambio: (v: string) => void;
  columnas?: 1 | 2 | 3;
  disabled?: boolean;
  legend: string;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="sr-only">{legend}</legend>
      <div
        className={cn(
          "grid grid-cols-1 gap-2",
          columnas === 2 && "sm:grid-cols-2",
          columnas === 3 && "sm:grid-cols-3",
        )}
      >
        {opciones.map((o) => {
          const elegida = valor === o.value;
          return (
            <label
              key={o.value}
              className={cn(
                "relative flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:cursor-not-allowed has-disabled:opacity-60",
                elegida ? "border-primary bg-accent/60" : "border-input hover:bg-muted/60",
              )}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={elegida}
                onChange={() => onCambio(o.value)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  elegida ? "border-primary bg-primary" : "border-foreground/30",
                )}
              >
                {elegida ? <span className="size-1.5 rounded-full bg-[var(--ewah-navy)]" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{o.label}</span>
                {o.ayuda ? <span className="block text-xs text-muted-foreground">{o.ayuda}</span> : null}
                {o.extra}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ChipsMultiples({
  opciones,
  valores,
  onCambio,
  legend,
}: {
  opciones: readonly Opcion[];
  valores: string[];
  onCambio: (v: string[]) => void;
  legend: string;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {opciones.map((o) => {
          const marcada = valores.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={marcada}
              onClick={() => onCambio(marcada ? valores.filter((v) => v !== o.value) : [...valores, o.value])}
              className={cn(
                "flex min-h-11 items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                marcada ? "border-primary bg-accent/60" : "border-input hover:bg-muted/60",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                  marcada ? "border-primary bg-primary text-primary-foreground" : "border-foreground/30",
                )}
              >
                {marcada ? <CheckIcon className="size-3 animate-in zoom-in-95 fade-in duration-150" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{o.label}</span>
                {o.ayuda ? <span className="block text-xs text-muted-foreground">{o.ayuda}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
