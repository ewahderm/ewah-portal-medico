"use client";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EstadoAcciones } from "./estado-acciones";
import { ESTADO_LABEL, nombreCompleto, type CitaRow } from "./tipos";

export function CitaDetalleDialog({
  cita,
  open,
  onOpenChange,
  puedeEditar,
  puedeCrearTratamiento,
  pacientes,
  tiposTratamiento,
  profesionales,
  sedes,
  mediosPago,
  usuarioActualId,
}: {
  cita: CitaRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  puedeEditar: boolean;
  puedeCrearTratamiento: boolean;
  pacientes: { id: string; nombre: string }[];
  tiposTratamiento: { id: string; nombre: string }[];
  profesionales: { id: string; nombre: string }[];
  sedes: { id: string; nombre: string }[];
  mediosPago: { id: string; nombre: string }[];
  usuarioActualId: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {cita.es_bloqueo ? "Bloqueo de horario" : "Detalle de la cita"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Horario</span>
            <span className="font-medium">
              {cita.hora_inicio.slice(0, 5)} – {cita.hora_fin.slice(0, 5)}
            </span>
          </div>

          {cita.es_bloqueo ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Motivo</span>
              <span className="font-medium">{cita.motivo ?? "—"}</span>
            </div>
          ) : (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paciente</span>
                <span className="font-medium">
                  {cita.pacientes ? nombreCompleto(cita.pacientes) : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tratamiento</span>
                <span className="font-medium">{cita.tipos_tratamiento?.nombre ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Estado</span>
                <Badge>{ESTADO_LABEL[cita.estado]}</Badge>
              </div>
              {(cita.estado === "cancelada" || cita.estado === "no_asistio") && cita.motivo ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Motivo</span>
                  <span className="font-medium">{cita.motivo}</span>
                </div>
              ) : null}
            </>
          )}

          <div className="flex justify-between">
            <span className="text-muted-foreground">Profesional</span>
            <span className="font-medium">{cita.profesional?.nombre ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Consultorio</span>
            <span className="font-medium">
              {cita.consultorios?.nombre ?? "—"}
              {cita.consultorios?.sedes ? ` (${cita.consultorios.sedes.nombre})` : ""}
            </span>
          </div>
        </div>

        {!cita.es_bloqueo ? (
          <div className="flex justify-end border-t pt-4">
            <EstadoAcciones
              cita={cita}
              puedeEditar={puedeEditar}
              puedeCrearTratamiento={puedeCrearTratamiento}
              pacientes={pacientes}
              tiposTratamiento={tiposTratamiento}
              profesionales={profesionales}
              sedes={sedes}
              mediosPago={mediosPago}
              usuarioActualId={usuarioActualId}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
