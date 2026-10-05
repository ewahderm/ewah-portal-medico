"use client";

import { useState, useTransition } from "react";
import { confirmarCita, marcarNoAsistio, reprogramarCita } from "@/lib/citas/actions";
import { crearAtencionDesdeCita } from "@/lib/atenciones/actions";
import { opcionesHora, sumarMinutos } from "@/lib/citas/horarios";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { CancelarDialog } from "./cancelar-dialog";
import { AtencionDetalleDialog } from "../atenciones/atencion-detalle-dialog";
import type { Opcion } from "@/lib/forms/opciones";

const OPCIONES_HORA = opcionesHora();

export function EstadoAcciones({
  cita,
  puedeEditar,
  puedeCrearTratamiento,
  puedeAnularTratamiento,
  puedeVerAnulados,
  tiposTratamiento,
  profesionales,
  sedes,
  mediosPago,
  usuarioActualId,
  insumos,
  lotes,
  puedeRegistrarConsumo,
  puedeRevertirConsumo,
  puedeEliminarArchivos,
  tieneEntitlementAnexos,
  pacientesPendientes = new Set(),
}: {
  cita: {
    id: string;
    estado: string;
    paciente_id: string | null;
    fecha: string;
    hora_inicio?: string;
    atencion_id: string | null;
  };
  puedeEditar: boolean;
  puedeCrearTratamiento: boolean;
  puedeAnularTratamiento: boolean;
  puedeVerAnulados: boolean;
  tiposTratamiento: Opcion[];
  profesionales: Opcion[];
  sedes: Opcion[];
  mediosPago: Opcion[];
  usuarioActualId: string;
  insumos: { id: string; nombre: string }[];
  lotes: {
    id: string;
    insumo_id: string;
    sede_id: string;
    numero_lote: string | null;
    cantidad_actual: number;
  }[];
  puedeRegistrarConsumo: boolean;
  puedeRevertirConsumo: boolean;
  puedeEliminarArchivos: boolean;
  tieneEntitlementAnexos: boolean;
  pacientesPendientes?: Set<string>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [conflicto, setConflicto] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [reprogramando, setReprogramando] = useState(false);
  const [nuevaFecha, setNuevaFecha] = useState(cita.fecha);
  const [nuevaHoraInicio, setNuevaHoraInicio] = useState(cita.hora_inicio ?? "09:00");
  const [nuevaHoraFin, setNuevaHoraFin] = useState(sumarMinutos(cita.hora_inicio ?? "09:00", 60));
  // cita.estado/atencion_id vienen del server component que renderizó esta
  // fila — no se actualizan solos cuando se crea una atención desde este
  // mismo componente (Next.js no vuelve a bajar props nuevas a un client
  // component ya montado sin una navegación). Sin este estado local, tras
  // "Atender" el botón seguía diciendo "Atender" y el resto de acciones
  // (Reprogramar/Cancelar) seguían apareciendo como si la cita no se
  // hubiera atendido — obligando a cerrar y volver a abrir.
  const [atencionId, setAtencionId] = useState(cita.atencion_id);
  const [detalleAbierto, setDetalleAbierto] = useState(false);
  const atendida = cita.estado === "atendida" || !!atencionId;

  function handleAtender() {
    setError(null);
    if (atencionId) {
      setDetalleAbierto(true);
      return;
    }
    startTransition(async () => {
      try {
        const id = await crearAtencionDesdeCita(cita.id);
        setAtencionId(id);
        setDetalleAbierto(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo crear la atención.");
      }
    });
  }

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

  // "atendida" ya no es un estado terminal para esta lista de acciones:
  // una atención puede seguir recibiendo tratamientos/evoluciones nuevas,
  // así que "Atender"/"Ver atención" debe seguir disponible. Los demás sí
  // siguen sin tener sentido una vez atendida.
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
        {cita.estado === "agendada" && !atendida && puedeEditar ? (
          <Button variant="ghost" size="sm" onClick={handleConfirmar} disabled={pending}>
            Confirmar
          </Button>
        ) : null}
        {puedeCrearTratamiento && cita.paciente_id ? (
          <Button size="sm" onClick={handleAtender} disabled={pending}>
            {pending ? "Guardando..." : atendida ? "Ver atención" : "Atender"}
          </Button>
        ) : null}
        {cita.estado === "confirmada" && !atendida && puedeEditar ? (
          <Button variant="ghost" size="sm" onClick={handleNoAsistio} disabled={pending}>
            No asistió
          </Button>
        ) : null}
        {!atendida && puedeEditar ? (
          <Button variant="ghost" size="sm" onClick={() => setReprogramando(true)} disabled={pending}>
            Reprogramar
          </Button>
        ) : null}
        {!atendida && puedeEditar ? <CancelarDialog id={cita.id} /> : null}
      </div>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}

      {atencionId ? (
        <AtencionDetalleDialog
          atencionId={atencionId}
          open={detalleAbierto}
          onOpenChange={setDetalleAbierto}
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
    </div>
  );
}
