"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { actualizarEdificacionSede } from "@/lib/habilitacion/sedes-servicios";
import { useCerrarAlExito } from "@/lib/forms/cerrarAlExito";
import { SIN_SELECCION } from "@/lib/forms/opcional";
import { USOS_EDIFICACION } from "@/lib/habilitacion/constantes";
import type { SedeHabilitacion } from "@/lib/habilitacion/tipos";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TarjetasRadio } from "../_components/opciones-tarjeta";

// HU-2.1: uso de la edificación + fecha de construcción o última
// intervención (las reglas cortan en 2-dic-1996 y mayo-2005). Quien no
// sabe la fecha exacta puede dar solo el año.
export function EdificacionDialog({ sede, trigger }: { sede: SedeHabilitacion; trigger: React.ReactElement }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(actualizarEdificacionSede, null);
  const [uso, setUso] = useState<string>(sede.uso_edificacion ?? SIN_SELECCION);
  const [modo, setModo] = useState<string>(sede.fecha_construccion_es_aproximada ? "anio" : "exacta");

  useCerrarAlExito(pending, !state?.error, () => {
    setOpen(false);
    router.refresh();
    toast.add({ title: "Edificación guardada", type: "success" });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edificación de {sede.nombre}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Decide qué criterios de infraestructura y qué documentos (licencia de construcción, RETIE, vulnerabilidad
            estructural) te aplican.
          </p>
        </DialogHeader>
        <form action={formAction} className="space-y-5">
          <input type="hidden" name="sedeId" value={sede.id} />
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <p className="text-sm font-medium">¿Cómo se usa la edificación?</p>
            <TarjetasRadio
              legend="Uso de la edificación"
              name="usoEdificacion"
              columnas={1}
              valor={uso}
              onCambio={setUso}
              opciones={[
                ...USOS_EDIFICACION,
                { value: SIN_SELECCION, label: "No lo sé todavía", ayuda: "Te mostraremos los criterios de ambos tipos." },
              ]}
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">¿Cuándo se construyó o se amplió/remodeló por última vez? (opcional)</p>
            <TarjetasRadio
              legend="Precisión de la fecha"
              name="modoFecha"
              valor={modo}
              onCambio={setModo}
              opciones={[
                { value: "exacta", label: "Sé la fecha" },
                { value: "anio", label: "Solo sé el año" },
              ]}
            />
            {modo === "anio" ? (
              <div className="space-y-1 sm:w-1/2">
                <Label htmlFor="anioConstruccion">Año</Label>
                <Input
                  id="anioConstruccion"
                  name="anioConstruccion"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="Ej. 2004"
                  defaultValue={sede.fecha_construccion_intervencion?.slice(0, 4) ?? ""}
                />
              </div>
            ) : (
              <div className="space-y-1 sm:w-1/2">
                <Label htmlFor="fechaConstruccion">Fecha</Label>
                <Input
                  id="fechaConstruccion"
                  name="fechaConstruccion"
                  type="date"
                  defaultValue={sede.fecha_construccion_es_aproximada ? "" : (sede.fecha_construccion_intervencion ?? "")}
                />
              </div>
            )}
          </div>

          <div className="space-y-1 sm:w-1/2">
            <Label htmlFor="codigoSedeReps">Código de la sede en el REPS (opcional)</Label>
            <Input id="codigoSedeReps" name="codigoSedeReps" maxLength={50} defaultValue={sede.codigo_sede_reps ?? ""} />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : "Guardar edificación"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
