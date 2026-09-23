"use client";

import { useState, useTransition } from "react";
import { confirmarCita, marcarNoAsistio, reprogramarCita } from "@/lib/citas/actions";
import { opcionesHora, sumarMinutos } from "@/lib/citas/horarios";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { CancelarDialog } from "./cancelar-dialog";
import { TratamientoDialog } from "../tratamientos/tratamiento-dialog";
import type { Opcion } from "@/lib/forms/opciones";

const OPCIONES_HORA = opcionesHora();

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
  pacientesPendientes = new Set(),
  onTratamientoGuardado,
}: {
  cita: {
    id: string;
    estado: string;
    paciente_id: string | null;
    profesional_id: string;
    tipo_tratamiento_id: string | null;
    fecha: string;
    hora_inicio?: string;
    consultorios?: { sede_id: string | null } | null;
    tratamientos_count?: number;
  };
  puedeEditar: boolean;
  puedeCrearTratamiento: boolean;
  pacientes: Opcion[];
  tiposTratamiento: Opcion[];
  profesionales: Opcion[];
  sedes: Opcion[];
  mediosPago: Opcion[];
  usuarioActualId: string;
  pacientesPendientes?: Set<string>;
  /** Se dispara al guardar un tratamiento desde "Atender"/"Agregar
   * tratamiento" — para que un detalle de cita abierto en ese momento
   * pueda refrescar su lista sin que el usuario tenga que cerrar/reabrir. */
  onTratamientoGuardado?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [conflicto, setConflicto] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [reprogramando, setReprogramando] = useState(false);
  const [nuevaFecha, setNuevaFecha] = useState(cita.fecha);
  const [nuevaHoraInicio, setNuevaHoraInicio] = useState(cita.hora_inicio ?? "09:00");
  const [nuevaHoraFin, setNuevaHoraFin] = useState(sumarMinutos(cita.hora_inicio ?? "09:00", 60));

  function handleConfirmar() {
    setError(null);
    startTransition(async () => {
      try {
        await confirmarCita(cita.id);
        toast.add({ title: "Cita confirmada", type: "success" });
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
        toast.add({ title: "Cita marcada como no asistió", type: "success" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo actualizar.");
      }
    });
  }

  function handleReprogramar(forzar = false) {
    setError(null);
    startTransition(async () => {
      try {
        const resultado = await reprogramarCita(
          cita.id,
          { fecha: nuevaFecha, horaInicio: nuevaHoraInicio, horaFin: nuevaHoraFin },
          forzar,
        );
        if ("conflicto" in resultado) {
          setConflicto(resultado.conflicto);
          return;
        }
        setConflicto(null);
        setReprogramando(false);
        toast.add({ title: "Cita reprogramada", type: "success" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo reprogramar.");
      }
    });
  }

  // "atendida" ya NO es un estado terminal para esta lista de acciones: una
  // cita puede tener varios tratamientos (esquema invertido en
  // tratamientos.cita_id), así que "Atender"/"Agregar tratamiento" debe
  // seguir disponible. Los demás sí siguen sin tener sentido una vez
  // atendida — dejamos de mostrar Confirmar/No asistió/Reprogramar/Cancelar
  // más abajo condicionando cada botón, no con un return temprano.
  if (cita.estado === "cancelada" || cita.estado === "no_asistio" || cita.estado === "reprogramada") {
    return error ? <span className="text-xs text-destructive">{error}</span> : null;
  }

  if (reprogramando) {
    return (
      <div className="flex flex-col items-end gap-2 rounded-lg border p-3">
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
        {conflicto ? (
          <div className="w-full rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            {conflicto}
          </div>
        ) : null}
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label htmlFor={`reprogramarFecha-${cita.id}`} className="text-xs">
              Fecha
            </Label>
            <Input
              id={`reprogramarFecha-${cita.id}`}
              type="date"
              value={nuevaFecha}
              onChange={(e) => {
                setNuevaFecha(e.target.value);
                setConflicto(null);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hora inicio</Label>
            <Combobox
              items={OPCIONES_HORA}
              value={nuevaHoraInicio}
              onValueChange={(v) => {
                const valor = String(v ?? "");
                setNuevaHoraInicio(valor);
                setNuevaHoraFin(sumarMinutos(valor, 60));
                setConflicto(null);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hora fin</Label>
            <Combobox
              items={OPCIONES_HORA}
              value={nuevaHoraFin}
              onValueChange={(v) => {
                setNuevaHoraFin(String(v ?? ""));
                setConflicto(null);
              }}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setReprogramando(false);
              setConflicto(null);
            }}
            disabled={pending}
          >
            Cancelar
          </Button>
          {conflicto ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleReprogramar(true)}
              disabled={pending}
            >
              {pending ? "Guardando..." : "Reprogramar de todas formas"}
            </Button>
          ) : (
            <Button size="sm" onClick={() => handleReprogramar(false)} disabled={pending}>
              {pending ? "Guardando..." : "Confirmar nueva fecha"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
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
            pacientesPendientes={pacientesPendientes}
            onGuardado={onTratamientoGuardado}
            desdeCita={{
              id: cita.id,
              paciente_id: cita.paciente_id,
              profesional_id: cita.profesional_id,
              tipo_tratamiento_id: cita.tipo_tratamiento_id,
              sede_id: cita.consultorios?.sede_id ?? undefined,
              fecha: cita.fecha,
              yaAtendida: cita.estado === "atendida",
            }}
            trigger={
              <Button size="sm" disabled={pending}>
                {cita.estado === "atendida"
                  ? `Agregar tratamiento${
                      cita.tratamientos_count ? ` · ${cita.tratamientos_count} registrados` : ""
                    }`
                  : "Atender"}
              </Button>
            }
          />
        ) : null}
        {cita.estado === "confirmada" && puedeEditar ? (
          <Button variant="ghost" size="sm" onClick={handleNoAsistio} disabled={pending}>
            No asistió
          </Button>
        ) : null}
        {cita.estado !== "atendida" && puedeEditar ? (
          <Button variant="ghost" size="sm" onClick={() => setReprogramando(true)} disabled={pending}>
            Reprogramar
          </Button>
        ) : null}
        {cita.estado !== "atendida" && puedeEditar ? <CancelarDialog id={cita.id} /> : null}
      </div>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
