"use client";

import { useState } from "react";
import { dateLocalHoy, timeLocalAhora, jornadaDesdeHora } from "@/lib/medio-ambiente/fecha-local";
import { JORNADAS } from "@/lib/medio-ambiente/constantes";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";

const ITEMS_JORNADA = JORNADAS.map((j) => ({ value: j.value, label: j.label }));

// Compartido por los 4 formularios de creación de Medio Ambiente. La hora es
// opcional (en el papel a veces solo se marca la jornada, sin hora exacta);
// jornada sí es obligatoria porque es el dato que siempre está presente.
export function FechaJornadaFields() {
  const [hora, setHora] = useState(timeLocalAhora());
  const [jornada, setJornada] = useState<string>(jornadaDesdeHora(timeLocalAhora()));

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="space-y-2">
        <Label htmlFor="fecha">Fecha</Label>
        <Input id="fecha" name="fecha" type="date" required defaultValue={dateLocalHoy()} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="hora">Hora (opcional)</Label>
        <Input
          id="hora"
          name="hora"
          type="time"
          value={hora}
          onChange={(e) => {
            setHora(e.target.value);
            if (e.target.value) setJornada(jornadaDesdeHora(e.target.value));
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="jornada">Jornada</Label>
        <Combobox
          id="jornada"
          name="jornada"
          required
          items={ITEMS_JORNADA}
          value={jornada}
          onValueChange={(v) => setJornada(String(v ?? ""))}
        />
      </div>
    </div>
  );
}
