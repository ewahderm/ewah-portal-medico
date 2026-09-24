"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EstadoAcciones } from "./estado-acciones";
import { ESTADO_LABEL, nombreCompleto, type CitaRow } from "./tipos";
import { listarTratamientosDeCita } from "@/lib/tratamientos/actions";
import { InsumosDialog } from "../tratamientos/insumos-dialog";
import { FotosDialog } from "../tratamientos/fotos-dialog";
import { AnexosDialog } from "../tratamientos/anexos-dialog";
import { formatoMoneda } from "@/lib/format";

type TratamientoDeCita = {
  id: string;
  costo: number | null;
  anulado: boolean;
  sede_id: string;
  tipos_tratamiento: { nombre: string } | null;
  tieneFotos: boolean;
  tieneAnexos: boolean;
};

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
  pacientes: { id: string; nombre: string }[];
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
   * Tratamientos del paciente (eliminar fotos/anexos ya lo exige RLS). */
  puedeEliminarArchivos: boolean;
  /** Anexos es sub-feature de pago dentro de Tratamientos — calculado una
   * sola vez en la página que renderiza este diálogo (citas/page.tsx o
   * pacientes/[id]/page.tsx) y pasado hacia abajo hasta aquí. */
  tieneEntitlementAnexos: boolean;
}) {
  // null = todavía cargando (o sin abrir) — distinto de un array vacío, que
  // significa "ya se consultó y de verdad no tiene tratamientos".
  const [tratamientos, setTratamientos] = useState<TratamientoDeCita[] | null>(null);

  // El diálogo se desmonta al cerrarse (Dialog de este proyecto solo
  // cierra con el botón X, nunca cambia de cita en el sitio), así que
  // cada apertura es un montaje fresco — el estado inicial `null` ya
  // sirve de "cargando" sin necesidad de resetearlo a mano aquí.
  useEffect(() => {
    if (!open || cita.es_bloqueo) return;
    let cancelado = false;
    listarTratamientosDeCita(cita.id).then((data) => {
      if (!cancelado) setTratamientos(data);
    });
    return () => {
      cancelado = true;
    };
  }, [open, cita.id, cita.es_bloqueo]);

  // Se pasa a EstadoAcciones para que, al guardar un tratamiento nuevo
  // desde "Atender"/"Agregar tratamiento" (que vive dentro de este mismo
  // diálogo), la lista se refresque sin que el usuario tenga que cerrar y
  // volver a abrir el detalle para verlo reflejado.
  function refrescarTratamientos() {
    if (cita.es_bloqueo) return;
    listarTratamientosDeCita(cita.id).then(setTratamientos);
  }

  const hayAnulados = (tratamientos ?? []).some((t) => t.anulado);
  const totalTratamientos = (tratamientos ?? [])
    .filter((t) => !t.anulado)
    .reduce((suma, t) => suma + (t.costo ?? 0), 0);

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
          <div className="space-y-2 border-t pt-4">
            <span className="text-sm font-medium">Tratamientos registrados en esta cita</span>
            {tratamientos === null ? (
              <p className="text-sm text-muted-foreground">Cargando...</p>
            ) : tratamientos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavía no hay tratamientos registrados en esta cita.
              </p>
            ) : (
              <>
                <div className="space-y-1">
                  {tratamientos.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className={t.anulado ? "text-muted-foreground line-through" : ""}>
                        {t.tipos_tratamiento?.nombre ?? "—"}
                        {t.anulado ? (
                          <Badge variant="outline" className="ml-2 text-xs">
                            Anulado
                          </Badge>
                        ) : null}
                      </span>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span
                          className={t.anulado ? "text-muted-foreground line-through" : "font-medium"}
                        >
                          {formatoMoneda(t.costo)}
                        </span>
                        {!t.anulado ? (
                          <InsumosDialog
                            tratamientoId={t.id}
                            sedeId={t.sede_id}
                            insumos={insumos}
                            lotes={lotes}
                            puedeRegistrar={puedeRegistrarConsumo}
                            puedeRevertir={puedeRevertirConsumo}
                          />
                        ) : null}
                        <FotosDialog
                          tratamientoId={t.id}
                          puedeSubir={puedeCrearTratamiento}
                          puedeEliminar={puedeEliminarArchivos}
                          tieneArchivos={t.tieneFotos}
                        />
                        <AnexosDialog
                          tratamientoId={t.id}
                          puedeSubir={puedeCrearTratamiento}
                          puedeEliminar={puedeEliminarArchivos}
                          tieneArchivos={t.tieneAnexos}
                          tieneEntitlement={tieneEntitlementAnexos}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t pt-2 text-sm font-semibold">
                  <span>Total</span>
                  <span>{formatoMoneda(totalTratamientos)}</span>
                </div>
                {hayAnulados ? (
                  <p className="text-xs text-muted-foreground">No incluye tratamientos anulados.</p>
                ) : null}
              </>
            )}
          </div>
        ) : null}

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
              pacientesPendientes={pacientesPendientes}
              onTratamientoGuardado={refrescarTratamientos}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
