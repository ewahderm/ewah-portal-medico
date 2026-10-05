"use client";

import { useActionState, useState } from "react";
import { crearAtencionSinCita } from "@/lib/atenciones/actions";
import { useCerrarAlExito } from "@/lib/forms/cerrarAlExito";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { toItems, type Opcion } from "@/lib/forms/opciones";
import { hoy } from "@/lib/format";
import { AtencionDetalleDialog } from "./atencion-detalle-dialog";

// Un paciente llega sin cita agendada y se le atiende igual — este
// formulario crea la atención (sin cita_id) y abre de inmediato su
// detalle, donde ya se puede agregar tratamiento/evolución/anamnesis.
export function AtencionSinCitaDialog({
  pacientes,
  profesionales,
  usuarioActualId,
  tiposTratamiento,
  sedes,
  mediosPago,
  insumos,
  lotes,
  puedeCrearTratamiento,
  puedeAnularTratamiento,
  puedeVerAnulados,
  puedeRegistrarConsumo,
  puedeRevertirConsumo,
  puedeEliminarArchivos,
  tieneEntitlementAnexos,
  pacientesPendientes = new Set(),
  pacienteFijo,
  trigger,
}: {
  pacientes: Opcion[];
  profesionales: Opcion[];
  usuarioActualId: string;
  tiposTratamiento: Opcion[];
  sedes: Opcion[];
  mediosPago: Opcion[];
  insumos: { id: string; nombre: string }[];
  lotes: {
    id: string;
    insumo_id: string;
    sede_id: string;
    numero_lote: string | null;
    cantidad_actual: number;
  }[];
  puedeCrearTratamiento: boolean;
  puedeAnularTratamiento: boolean;
  puedeVerAnulados: boolean;
  puedeRegistrarConsumo: boolean;
  puedeRevertirConsumo: boolean;
  puedeEliminarArchivos: boolean;
  tieneEntitlementAnexos: boolean;
  pacientesPendientes?: Set<string>;
  /** Si ya se sabe qué paciente es (ej. desde su propia ficha), fija el
   * combobox en vez de dejarlo elegir — igual criterio que TratamientoDialog. */
  pacienteFijo?: { id: string };
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(crearAtencionSinCita, null);
  const [pacienteId, setPacienteId] = useState(pacienteFijo?.id ?? "");
  const [atencionCreada, setAtencionCreada] = useState<string | null>(null);
  const pacientePendiente = pacientesPendientes.has(pacienteId);

  useCerrarAlExito(pending, !state?.error, () => {
    setOpen(false);
    if (state?.atencionId) setAtencionCreada(state.atencionId);
  });

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={trigger} />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atención sin cita</DialogTitle>
          </DialogHeader>

          <form action={formAction} className="space-y-5">
            {state?.error ? (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="pacienteId">Paciente</Label>
              <Combobox
                id="pacienteId"
                name="pacienteId"
                required
                disabled={Boolean(pacienteFijo)}
                items={toItems(pacientes)}
                value={pacienteId}
                onValueChange={(valor) => setPacienteId(String(valor ?? ""))}
                placeholder="Selecciona un paciente"
              />
              {pacientePendiente ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    Este paciente tiene información obligatoria pendiente. Complétala en su
                    ficha antes de registrar una atención.
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="profesionalId">Profesional</Label>
                <Combobox
                  id="profesionalId"
                  name="profesionalId"
                  required
                  items={toItems(profesionales)}
                  defaultValue={usuarioActualId}
                  placeholder="Selecciona"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fecha">Fecha</Label>
                <Input id="fecha" name="fecha" type="date" required defaultValue={hoy()} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="motivo">Motivo (opcional)</Label>
              <Input id="motivo" name="motivo" placeholder="Ej: Control sin cita, urgencia..." />
            </div>

            <Button type="submit" className="w-full" disabled={pending || pacientePendiente}>
              {pending ? "Creando..." : "Crear atención"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {atencionCreada ? (
        <AtencionDetalleDialog
          atencionId={atencionCreada}
          open={Boolean(atencionCreada)}
          onOpenChange={(next) => {
            if (!next) setAtencionCreada(null);
          }}
          tiposTratamiento={tiposTratamiento}
          profesionales={profesionales}
          sedes={sedes}
          mediosPago={mediosPago}
          usuarioActualId={usuarioActualId}
          insumos={insumos}
          lotes={lotes}
          puedeCrearTratamiento={puedeCrearTratamiento}
          puedeAnularTratamiento={puedeAnularTratamiento}
          puedeVerAnulados={puedeVerAnulados}
          puedeRegistrarConsumo={puedeRegistrarConsumo}
          puedeRevertirConsumo={puedeRevertirConsumo}
          puedeEliminarArchivos={puedeEliminarArchivos}
          tieneEntitlementAnexos={tieneEntitlementAnexos}
          pacientesPendientes={pacientesPendientes}
        />
      ) : null}
    </>
  );
}
