"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CitaDetalleDialog } from "../../citas/cita-detalle-dialog";
import { ESTADO_LABEL, type CitaRow } from "../../citas/tipos";
import type { Opcion } from "@/lib/forms/opciones";

// Mismo diálogo de detalle que usa la Agenda (CitaDetalleDialog) — clic en
// una fila abre exactamente el mismo flujo (Atender/Agregar tratamiento,
// lista de tratamientos de la cita, Insumos por tratamiento) sin duplicar
// nada de esa lógica aquí. Este componente solo administra qué cita está
// seleccionada, igual que ya lo hace AgendaCalendario para el calendario.
export function CitasTabla({
  citas,
  puedeEditar,
  puedeCrearTratamiento,
  pacientes,
  tiposTratamiento,
  profesionales,
  sedes,
  mediosPago,
  usuarioActualId,
  pacientesPendientes,
  insumos,
  lotes,
  puedeRegistrarConsumo,
  puedeRevertirConsumo,
  puedeEliminarArchivos,
  tieneEntitlementAnexos,
}: {
  citas: CitaRow[];
  puedeEditar: boolean;
  puedeCrearTratamiento: boolean;
  pacientes: Opcion[];
  tiposTratamiento: Opcion[];
  profesionales: Opcion[];
  sedes: Opcion[];
  mediosPago: Opcion[];
  usuarioActualId: string;
  pacientesPendientes: Set<string>;
  insumos: Opcion[];
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
  /** Anexos es sub-feature de pago dentro de Tratamientos — calculado una
   * sola vez en pacientes/[id]/page.tsx y pasado hasta CitaDetalleDialog. */
  tieneEntitlementAnexos: boolean;
}) {
  const [citaSeleccionada, setCitaSeleccionada] = useState<CitaRow | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Hora</TableHead>
            <TableHead>Tratamiento</TableHead>
            <TableHead>Profesional</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {citas.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="text-muted-foreground">{c.fecha}</TableCell>
              <TableCell className="text-muted-foreground">{c.hora_inicio.slice(0, 5)}</TableCell>
              <TableCell>{c.tipos_tratamiento?.nombre ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">
                {c.profesional?.nombre ?? "—"}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{ESTADO_LABEL[c.estado] ?? c.estado}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm" onClick={() => setCitaSeleccionada(c)}>
                  Ver detalle
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {citas.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                Sin citas registradas.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>

      {citaSeleccionada ? (
        <CitaDetalleDialog
          cita={citaSeleccionada}
          open={!!citaSeleccionada}
          onOpenChange={(open) => {
            if (!open) setCitaSeleccionada(null);
          }}
          puedeEditar={puedeEditar}
          puedeCrearTratamiento={puedeCrearTratamiento}
          pacientes={pacientes}
          tiposTratamiento={tiposTratamiento}
          profesionales={profesionales}
          sedes={sedes}
          mediosPago={mediosPago}
          usuarioActualId={usuarioActualId}
          pacientesPendientes={pacientesPendientes}
          insumos={insumos}
          lotes={lotes}
          puedeRegistrarConsumo={puedeRegistrarConsumo}
          puedeRevertirConsumo={puedeRevertirConsumo}
          puedeEliminarArchivos={puedeEliminarArchivos}
          tieneEntitlementAnexos={tieneEntitlementAnexos}
        />
      ) : null}
    </>
  );
}
