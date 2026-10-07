"use client";

import { useState } from "react";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";

// Selector de mes como dos Combobox (mes + año) en vez de
// <input type="month">: ese control nativo no existe en Firefox ni en
// Safari de escritorio (cae a un texto libre sin formato) y no se parece al
// resto de los desplegables de la app. El valor que sale sigue siendo
// "aaaa-mm", el formato que esperan las server actions.

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
].map((label, indice) => ({ value: String(indice + 1).padStart(2, "0"), label }));

const ANIOS_HACIA_ATRAS = 10;

function itemsAnios() {
  const actual = new Date().getFullYear();
  return Array.from({ length: ANIOS_HACIA_ATRAS + 1 }, (_, i) => {
    const anio = String(actual - i);
    return { value: anio, label: anio };
  });
}

export function MesAnioSelect({
  id,
  name,
  onValueChange,
}: {
  id: string;
  // Si se pasa, el valor "aaaa-mm" (o "" incompleto) viaja en el formulario.
  name?: string;
  onValueChange?: (valor: string) => void;
}) {
  const [mes, setMes] = useState<string | null>(null);
  const [anio, setAnio] = useState<string | null>(null);
  const [anios] = useState(itemsAnios);
  const valor = mes && anio ? `${anio}-${mes}` : "";

  function actualizar(siguienteMes: string | null, siguienteAnio: string | null) {
    setMes(siguienteMes);
    setAnio(siguienteAnio);
    onValueChange?.(siguienteMes && siguienteAnio ? `${siguienteAnio}-${siguienteMes}` : "");
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <Combobox
        id={id}
        items={MESES}
        value={mes}
        onValueChange={(v) => actualizar(v ? String(v) : null, anio)}
        placeholder="Buscar mes..."
      />
      <div>
        <Label htmlFor={`${id}Anio`} className="sr-only">
          Año
        </Label>
        <Combobox
          id={`${id}Anio`}
          items={anios}
          value={anio}
          onValueChange={(v) => actualizar(mes, v ? String(v) : null)}
          placeholder="Año..."
        />
      </div>
      {name ? <input type="hidden" name={name} value={valor} /> : null}
    </div>
  );
}
