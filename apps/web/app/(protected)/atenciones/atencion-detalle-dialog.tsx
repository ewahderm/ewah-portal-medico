"use client";

import { useEffect, useState } from "react";
import { PencilIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { obtenerAtencion, type AtencionDetalle as AtencionDetalleTipo } from "@/lib/atenciones/actions";
import {
  listarTratamientosDeAtencion,
  listarTratamientosDelPaciente,
  type TratamientoDeAtencion,
  type TratamientoDePaciente,
} from "@/lib/tratamientos/actions";
import { listarEvolucionesDeAtencion, type EvolucionDeAtencion } from "@/lib/pacientes/evoluciones";
import {
  obtenerAnamnesisDeAtencion,
  obtenerUltimaAnamnesisPaciente,
  type AnamnesisDeAtencion,
} from "@/lib/pacientes/anamnesis";
import { nombreCompleto } from "@/lib/pacientes/nombre";
import { formatoMoneda } from "@/lib/format";
import { TratamientoDialog } from "../tratamientos/tratamiento-dialog";
import { AnularDialog } from "../tratamientos/anular-dialog";
import { RevertirAnulacionButton } from "../tratamientos/revertir-anulacion-button";
import { InsumosDialog } from "../tratamientos/insumos-dialog";
import { FotosDialog } from "../tratamientos/fotos-dialog";
import { AnexosDialog } from "../tratamientos/anexos-dialog";
import { ConsentimientoDialog } from "../tratamientos/consentimiento-dialog";
import { EvolucionDialog } from "../pacientes/[id]/evolucion-dialog";
import { AnamnesisDialog } from "../pacientes/[id]/anamnesis-dialog";
import type { Opcion } from "@/lib/forms/opciones";

const TIPO_EVOLUCION_LABEL: Record<string, string> = {
  epicrisis_atencion: "Epicrisis de esta atención",
  epicrisis_general: "Epicrisis general",
};

export function AtencionDetalleDialog({
  atencionId,
  open,
  onOpenChange,
  tiposTratamiento,
  profesionales,
  sedes,
  mediosPago,
  usuarioActualId,
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
  onCambio,
}: {
  atencionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  puedeCrearTratamiento: boolean;
  puedeAnularTratamiento: boolean;
  /** Solo administrador — mismo criterio que /tratamientos: ver tratamientos
   * anulados y poder revertir su anulación. */
  puedeVerAnulados: boolean;
  puedeRegistrarConsumo: boolean;
  puedeRevertirConsumo: boolean;
  puedeEliminarArchivos: boolean;
  tieneEntitlementAnexos: boolean;
  /** Mismo Set que ya usa el resto del proyecto (pacientes con información
   * obligatoria pendiente) — bloquea Tratamiento/Anamnesis/Evolución igual
   * que en cualquier otro punto de entrada. */
  pacientesPendientes?: Set<string>;
  /** Se dispara al guardar cualquier cosa dentro (tratamiento, evolución,
   * anamnesis) — para que quien embebe este diálogo (ej. una fila de la
   * Agenda) pueda refrescar su propio estado sin cerrar/reabrir. */
  onCambio?: () => void;
}) {
  const [atencion, setAtencion] = useState<AtencionDetalleTipo | null>(null);
  const [tratamientos, setTratamientos] = useState<TratamientoDeAtencion[] | null>(null);
  const [tratamientosPaciente, setTratamientosPaciente] = useState<TratamientoDePaciente[]>([]);
  const [evoluciones, setEvoluciones] = useState<EvolucionDeAtencion[] | null>(null);
  const [anamnesis, setAnamnesis] = useState<AnamnesisDeAtencion | null>(null);
  const [ultimaAnamnesis, setUltimaAnamnesis] = useState<AnamnesisDeAtencion | null>(null);

  // El diálogo se desmonta al cerrarse (mismo criterio del resto del
  // proyecto: solo cierra con X), así que cada apertura es un montaje
  // fresco — no hace falta resetear el estado a mano.
  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    obtenerAtencion(atencionId).then((data) => {
      if (cancelado || !data) return;
      setAtencion(data);
      listarTratamientosDelPaciente(data.paciente_id).then((t) => {
        if (!cancelado) setTratamientosPaciente(t);
      });
      obtenerUltimaAnamnesisPaciente(data.paciente_id).then((u) => {
        if (!cancelado) setUltimaAnamnesis(u);
      });
    });
    listarTratamientosDeAtencion(atencionId).then((data) => {
      if (!cancelado) setTratamientos(data);
    });
    listarEvolucionesDeAtencion(atencionId).then((data) => {
      if (!cancelado) setEvoluciones(data);
    });
    obtenerAnamnesisDeAtencion(atencionId).then((data) => {
      if (!cancelado) setAnamnesis(data);
    });
    return () => {
      cancelado = true;
    };
  }, [open, atencionId]);

  function refrescarTratamientos() {
    listarTratamientosDeAtencion(atencionId).then(setTratamientos);
    if (atencion) listarTratamientosDelPaciente(atencion.paciente_id).then(setTratamientosPaciente);
    onCambio?.();
  }
  function refrescarEvoluciones() {
    listarEvolucionesDeAtencion(atencionId).then(setEvoluciones);
    onCambio?.();
  }
  function refrescarAnamnesis() {
    obtenerAnamnesisDeAtencion(atencionId).then(setAnamnesis);
    onCambio?.();
  }

  const tratamientosVisibles = puedeVerAnulados
    ? (tratamientos ?? [])
    : (tratamientos ?? []).filter((t) => !t.anulado);
  const hayAnulados = tratamientosVisibles.some((t) => t.anulado);
  const totalTratamientos = tratamientosVisibles
    .filter((t) => !t.anulado)
    .reduce((suma, t) => suma + (t.costo ?? 0), 0);

  // Todos los tratamientos vigentes del paciente, no solo los de esta
  // atención: en un control se hace seguimiento a lo realizado antes.
  const tratamientosParaEvolucion: Opcion[] = tratamientosPaciente.map((t) => ({
    id: t.id,
    nombre: `${t.fecha} — ${t.tipos_tratamiento?.nombre ?? "Tratamiento"}`,
  }));

  const paciente = atencion?.paciente;
  const pacienteOpcion: Opcion[] =
    atencion && paciente ? [{ id: atencion.paciente_id, nombre: nombreCompleto(paciente) }] : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atención{atencion ? ` — ${atencion.fecha}` : ""}</DialogTitle>
        </DialogHeader>

        {!atencion ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : (
          <>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paciente</span>
                <span className="font-medium">{paciente ? nombreCompleto(paciente) : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Profesional</span>
                <span className="font-medium">{atencion.profesional?.nombre ?? "—"}</span>
              </div>
              {atencion.cita ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cita</span>
                  <span className="font-medium">
                    {atencion.cita.hora_inicio.slice(0, 5)} – {atencion.cita.hora_fin.slice(0, 5)}
                    {atencion.cita.consultorios ? ` · ${atencion.cita.consultorios.nombre}` : ""}
                  </span>
                </div>
              ) : (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Origen</span>
                  <Badge variant="outline">Atención sin cita</Badge>
                </div>
              )}
              {atencion.motivo ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Motivo</span>
                  <span className="font-medium">{atencion.motivo}</span>
                </div>
              ) : null}
            </div>

            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Anamnesis</span>
                {!anamnesis && puedeCrearTratamiento ? (
                  <AnamnesisDialog
                    pacienteId={atencion.paciente_id}
                    atencionId={atencion.id}
                    profesionales={profesionales}
                    usuarioActualId={usuarioActualId}
                    ultimaAnamnesis={ultimaAnamnesis}
                    onGuardado={refrescarAnamnesis}
                    trigger={
                      <Button size="sm" variant="outline">
                        Registrar anamnesis
                      </Button>
                    }
                  />
                ) : null}
              </div>
              {anamnesis ? (
                <p className="whitespace-normal break-words text-sm">{anamnesis.motivo_consulta}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Sin anamnesis registrada en esta atención.</p>
              )}
            </div>

            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Tratamientos</span>
                {puedeCrearTratamiento ? (
                  <TratamientoDialog
                    pacientes={pacienteOpcion}
                    tiposTratamiento={tiposTratamiento}
                    profesionales={profesionales}
                    sedes={sedes}
                    mediosPago={mediosPago}
                    usuarioActualId={usuarioActualId}
                    pacientesPendientes={pacientesPendientes}
                    desdeAtencion={{
                      id: atencion.id,
                      paciente_id: atencion.paciente_id,
                      profesional_id: atencion.profesional_id,
                      tipo_tratamiento_id: null,
                      fecha: atencion.fecha,
                    }}
                    onGuardado={refrescarTratamientos}
                    trigger={<Button size="sm">Agregar tratamiento</Button>}
                  />
                ) : null}
              </div>
              {tratamientosVisibles.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todavía no hay tratamientos en esta atención.</p>
              ) : (
                <>
                  <div className="space-y-1">
                    {tratamientosVisibles.map((t) => (
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
                          <span className={t.anulado ? "text-muted-foreground line-through" : "font-medium"}>
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
                          <ConsentimientoDialog tratamientoId={t.id} tieneConsentimiento={t.tieneConsentimiento} />
                          {!t.anulado && puedeCrearTratamiento && puedeAnularTratamiento ? (
                            <TratamientoDialog
                              pacientes={pacienteOpcion}
                              tiposTratamiento={tiposTratamiento}
                              profesionales={profesionales}
                              sedes={sedes}
                              mediosPago={mediosPago}
                              usuarioActualId={usuarioActualId}
                              pacientesPendientes={pacientesPendientes}
                              editando={{
                                id: t.id,
                                paciente_id: t.paciente_id,
                                tipo_tratamiento_id: t.tipo_tratamiento_id,
                                profesional_id: t.profesional_id,
                                sede_id: t.sede_id,
                                medio_pago_id: t.medio_pago_id,
                                fecha: t.fecha,
                                costo: t.costo,
                                notas: t.notas,
                                cufe: t.cufe,
                              }}
                              onGuardado={refrescarTratamientos}
                              trigger={
                                <Button variant="outline" size="icon-sm" aria-label="Editar">
                                  <PencilIcon />
                                </Button>
                              }
                            />
                          ) : null}
                          {!t.anulado && puedeAnularTratamiento ? <AnularDialog id={t.id} /> : null}
                          {t.anulado && puedeCrearTratamiento ? (
                            <TratamientoDialog
                              pacientes={pacienteOpcion}
                              tiposTratamiento={tiposTratamiento}
                              profesionales={profesionales}
                              sedes={sedes}
                              mediosPago={mediosPago}
                              usuarioActualId={usuarioActualId}
                              pacientesPendientes={pacientesPendientes}
                              corrigiendo={{
                                id: t.id,
                                paciente_id: t.paciente_id,
                                tipo_tratamiento_id: t.tipo_tratamiento_id,
                                profesional_id: t.profesional_id,
                                sede_id: t.sede_id,
                                medio_pago_id: t.medio_pago_id,
                                fecha: t.fecha,
                                costo: t.costo,
                                notas: t.notas,
                                cufe: t.cufe,
                              }}
                              onGuardado={refrescarTratamientos}
                              trigger={
                                <Button variant="outline" size="icon-sm" aria-label="Corregir">
                                  <PencilIcon />
                                </Button>
                              }
                            />
                          ) : null}
                          {t.anulado && puedeVerAnulados ? <RevertirAnulacionButton id={t.id} /> : null}
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

            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Evoluciones</span>
                {puedeCrearTratamiento ? (
                  <div className="flex gap-2">
                    <EvolucionDialog
                      pacienteId={atencion.paciente_id}
                      atencionId={atencion.id}
                      profesionales={profesionales}
                      usuarioActualId={usuarioActualId}
                      tratamientos={tratamientosParaEvolucion}
                      onGuardado={refrescarEvoluciones}
                      trigger={
                        <Button size="sm" variant="outline">
                          Nueva evolución
                        </Button>
                      }
                    />
                    <EvolucionDialog
                      pacienteId={atencion.paciente_id}
                      atencionId={atencion.id}
                      profesionales={profesionales}
                      usuarioActualId={usuarioActualId}
                      tratamientos={tratamientosParaEvolucion}
                      tipo="epicrisis_atencion"
                      onGuardado={refrescarEvoluciones}
                      trigger={
                        <Button size="sm" variant="outline">
                          Epicrisis de la atención
                        </Button>
                      }
                    />
                    <EvolucionDialog
                      pacienteId={atencion.paciente_id}
                      atencionId={atencion.id}
                      profesionales={profesionales}
                      usuarioActualId={usuarioActualId}
                      tratamientos={tratamientosParaEvolucion}
                      tipo="epicrisis_general"
                      onGuardado={refrescarEvoluciones}
                      trigger={
                        <Button size="sm" variant="outline">
                          Epicrisis general
                        </Button>
                      }
                    />
                  </div>
                ) : null}
              </div>
              {!evoluciones || evoluciones.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin evoluciones registradas en esta atención.</p>
              ) : (
                <div className="space-y-2">
                  {evoluciones.map((e) => (
                    <div key={e.id} className="text-sm">
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>{e.fecha}</span>
                        <div className="flex items-center gap-2">
                          {e.tipo !== "seguimiento" ? (
                            <Badge variant="outline" className="text-amber-600">
                              {TIPO_EVOLUCION_LABEL[e.tipo] ?? e.tipo}
                            </Badge>
                          ) : null}
                          <span>{e.profesional?.nombre ?? "—"}</span>
                        </div>
                      </div>
                      <p className="whitespace-normal break-words">{e.evolucion}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
