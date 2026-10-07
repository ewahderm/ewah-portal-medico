"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { anularAutoevaluacion, registrarFechaDeclaracionReps } from "@/lib/habilitacion/cierre";
import { hoyColombiaCliente } from "@/lib/habilitacion/ruta";
import { PORTAL_REPS_NACIONAL } from "@/lib/habilitacion/constantes";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// AC4 HU-4.6: la fecha en que se declaró en el REPS se digita después, una
// sola vez.
export function DeclaracionReps({ id, fechaCierre }: { id: string; fechaCierre: string }) {
  const router = useRouter();
  const [fecha, setFecha] = useState(hoyColombiaCliente());
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setPendiente(true);
    setError(null);
    const r = await registrarFechaDeclaracionReps(id, fecha);
    setPendiente(false);
    if (r.error) return setError(r.error);
    toast.add({ title: "Fecha de declaración guardada", type: "success" });
    router.refresh();
  }

  return (
    <form onSubmit={guardar} className="space-y-2 rounded-lg border border-dashed p-3">
      <p className="text-sm">
        ¿Ya la declaraste en el{" "}
        <a href={PORTAL_REPS_NACIONAL} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
          REPS
        </a>
        ? Registra la fecha (solo se puede una vez).
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="fecha-declaracion">Fecha de declaración</Label>
          <Input id="fecha-declaracion" type="date" value={fecha} min={fechaCierre} max={hoyColombiaCliente()} onChange={(e) => setFecha(e.target.value)} required />
        </div>
        <Button type="submit" size="sm" disabled={pendiente}>
          {pendiente ? "Guardando…" : "Guardar fecha"}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}

export function AnularAutoevaluacion({ id }: { id: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pendiente, setPendiente] = useState(false);

  async function anular() {
    setPendiente(true);
    const r = await anularAutoevaluacion(id, motivo);
    setPendiente(false);
    if (r.error) return toast.add({ title: "No se anuló", description: r.error, type: "error" });
    toast.add({ title: "Autoevaluación anulada", type: "success" });
    router.refresh();
  }

  if (!abierto) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setAbierto(true)}>
        Anular
      </Button>
    );
  }
  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row">
      <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (mínimo 10 caracteres)" aria-label="Motivo de anulación" />
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setAbierto(false)} disabled={pendiente}>
          Cancelar
        </Button>
        <Button size="sm" variant="destructive" onClick={anular} disabled={pendiente || motivo.trim().length < 10}>
          Anular
        </Button>
      </div>
    </div>
  );
}
