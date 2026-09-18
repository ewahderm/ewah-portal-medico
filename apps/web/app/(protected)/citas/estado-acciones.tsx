"use client";

import { useState, useTransition } from "react";
import { confirmarCita, marcarNoAsistio } from "@/lib/citas/actions";
import { Button } from "@/components/ui/button";
import { CancelarDialog } from "./cancelar-dialog";
import { TratamientoDialog } from "../tratamientos/tratamiento-dialog";
import type { Opcion } from "@/lib/forms/opciones";

export function EstadoAcciones({
  cita,
  puedeEditar,
  puedeCrearTratamiento,
  pacientes,
  tiposTratamiento,
  profesionales,
  sedes,
  mediosPago,
  usuarioActualId,
}: {
  cita: {
    id: string;
    estado: string;
    paciente_id: string | null;
    profesional_id: string;
    tipo_tratamiento_id: string | null;
    fecha: string;
    consultorios?: { sede_id: string | null } | null;
  };
  puedeEditar: boolean;
  puedeCrearTratamiento: boolean;
  pacientes: Opcion[];
  tiposTratamiento: Opcion[];
  profesionales: Opcion[];
  sedes: Opcion[];
  mediosPago: Opcion[];
  usuarioActualId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleConfirmar() {
    setError(null);
    startTransition(async () => {
      try {
        await confirmarCita(cita.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo confirmar.");
      }
    });
  }

  function handleNoAsistio() {
    setError(null);
    startTransition(async () => {
      try {
        await marcarNoAsistio(cita.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo actualizar.");
      }
    });
  }

  if (cita.estado === "cancelada" || cita.estado === "no_asistio" || cita.estado === "atendida") {
    return error ? <span className="text-xs text-destructive">{error}</span> : null;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex justify-end gap-2">
        {cita.estado === "agendada" && puedeEditar ? (
          <Button variant="ghost" size="sm" onClick={handleConfirmar} disabled={pending}>
            Confirmar
          </Button>
        ) : null}
        {puedeCrearTratamiento && cita.paciente_id ? (
          <TratamientoDialog
            pacientes={pacientes}
            tiposTratamiento={tiposTratamiento}
            profesionales={profesionales}
            sedes={sedes}
            mediosPago={mediosPago}
            usuarioActualId={usuarioActualId}
            desdeCita={{
              id: cita.id,
              paciente_id: cita.paciente_id,
              profesional_id: cita.profesional_id,
              tipo_tratamiento_id: cita.tipo_tratamiento_id,
              sede_id: cita.consultorios?.sede_id ?? undefined,
              fecha: cita.fecha,
            }}
            trigger={
              <Button size="sm" disabled={pending}>
                Atender
              </Button>
            }
          />
        ) : null}
        {cita.estado === "confirmada" && puedeEditar ? (
          <Button variant="ghost" size="sm" onClick={handleNoAsistio} disabled={pending}>
            No asistió
          </Button>
        ) : null}
        {puedeEditar ? <CancelarDialog id={cita.id} /> : null}
      </div>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
