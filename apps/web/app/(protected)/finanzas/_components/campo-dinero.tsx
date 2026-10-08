"use client";

import { useState } from "react";
import { leerMonto, formatoDinero } from "@/lib/finanzas/dinero";
import type { Moneda } from "@/lib/finanzas/constantes";
import { Input } from "@/components/ui/input";

// Monto como lo escribe la gente ("12.000.000", "1.250,50"): texto libre
// que se lee con leerMonto y se muestra formateado debajo. `onValor` recibe
// null mientras no sea un número válido.
export function CampoDinero({
  id,
  moneda = "COP",
  valorInicial,
  onValor,
  ariaLabel,
  permitirNegativo = false,
  required,
}: {
  id: string;
  moneda?: Moneda;
  valorInicial?: number | null;
  onValor: (valor: number | null) => void;
  ariaLabel?: string;
  permitirNegativo?: boolean;
  required?: boolean;
}) {
  const [texto, setTexto] = useState(valorInicial === null || valorInicial === undefined ? "" : String(valorInicial).replace(".", ","));
  const valor = leerMonto(texto);
  const invalido = texto.trim() !== "" && (valor === null || (!permitirNegativo && valor < 0));
  return (
    <div className="space-y-1">
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={texto}
        aria-label={ariaLabel}
        aria-invalid={invalido || undefined}
        required={required}
        placeholder="0"
        onChange={(e) => {
          setTexto(e.target.value);
          const v = leerMonto(e.target.value);
          onValor(v === null || (!permitirNegativo && v < 0) ? null : v);
        }}
      />
      <p className={invalido ? "text-xs text-destructive" : "text-xs text-muted-foreground"} aria-live="polite">
        {invalido ? "Escribe un número, por ejemplo 1.250.000" : texto.trim() ? formatoDinero(valor, moneda) : " "}
      </p>
    </div>
  );
}
