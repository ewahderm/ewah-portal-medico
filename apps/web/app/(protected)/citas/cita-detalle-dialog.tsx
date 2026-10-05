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
  puedeAnularTratamiento,
  puedeVerAnulados,
  tiposTratamiento,
  profesionales,
  sedes,
  mediosPago,
  usuarioActualId,
  pacientesPendientes = new Set(),
  insumos,
  lotes,
  puedeRegistrarConsumo,
  puedeRevertirConsumo,
  puedeEliminarArchivos,
  tieneEntitlementAnexos,
}: {
  cita: CitaRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  puedeEditar: boolean;
  puedeCrearTratamiento: boolean;
  puedeAnularTratamiento: boolean;
  puedeVerAnulados: boolean;
  tiposTratamiento: { id: string; nombre: string }[];
  profesionales: { id: string; nombre: string }[];
  sedes: { id: string; nombre: string }[];
  mediosPago: { id: string; nombre: string }[];
  usuarioActualId: string;
  pacientesPendientes?: Set<string>;
  insumos: { id: string; nombre: string }[];
  lotes: { id: string; insumo_id: string; sede_id: string; numero_lote: string | null; cantidad_actual: number }[];
  puedeRegistrarConsumo: boolean;
  puedeRevertirConsumo: boolean;
  /** Solo administrador — mismo criterio que /tratamientos y la pestaña
   * Atenciones del paciente (eliminar fotos/anexos ya lo exige RLS). */
  puedeEliminarArchivos: boolean;
  /** Anexos es sub-feature de pago dentro de Tratamientos — calculado una
   * sola vez en la página que renderiza este diálogo (citas/page.tsx o
   * pacientes/[id]/page.tsx) y pasado hacia abajo hasta aquí. */
  tieneEntitlementAnexos: boolean;
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
                <span className="flex items-center gap-2 font-medium">
                  {cita.pacientes ? nombreCompleto(cita.pacientes) : "—"}
                  {cita.paciente_id && pacientesPendientes.has(cita.paciente_id) ? (
                    <Badge variant="outline" className="text-amber-600">
                      Información pendiente
                    </Badge>
                  ) : null}
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
              puedeAnularTratamiento={puedeAnularTratamiento}
              puedeVerAnulados={puedeVerAnulados}
              tiposTratamiento={tiposTratamiento}
              profesionales={profesionales}
              sedes={sedes}
              mediosPago={mediosPago}
              usuarioActualId={usuarioActualId}
              insumos={insumos}
              lotes={lotes}
              puedeRegistrarConsumo={puedeRegistrarConsumo}
              puedeRevertirConsumo={puedeRevertirConsumo}
              puedeEliminarArchivos={puedeEliminarArchivos}
              tieneEntitlementAnexos={tieneEntitlementAnexos}
              pacientesPendientes={pacientesPendientes}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
