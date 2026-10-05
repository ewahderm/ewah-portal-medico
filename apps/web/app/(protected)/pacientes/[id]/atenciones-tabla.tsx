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
import { AtencionDetalleDialog } from "../../atenciones/atencion-detalle-dialog";
import type { Opcion } from "@/lib/forms/opciones";

export type AtencionRow = {
  id: string;
  fecha: string;
  motivo: string | null;
  cita_id: string | null;
  profesional: { nombre: string } | null;
  tratamientos_count: number;
  evoluciones_count: number;
  anamnesis_count: number;
};

// Una fila por atención (con o sin cita), cada una abre el mismo
// AtencionDetalleDialog que usa Agenda — mismo criterio que CitasTabla:
// este componente solo administra cuál está seleccionada.
export function AtencionesTabla({
  atenciones,
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
}: {
  atenciones: AtencionRow[];
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
  puedeVerAnulados: boolean;
  puedeRegistrarConsumo: boolean;
  puedeRevertirConsumo: boolean;
  puedeEliminarArchivos: boolean;
  pacientesPendientes?: Set<string>;
  tieneEntitlementAnexos: boolean;
}) {
  const [seleccionada, setSeleccionada] = useState<string | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Origen</TableHead>
            <TableHead className="hidden md:table-cell">Profesional</TableHead>
            <TableHead className="hidden md:table-cell">Resumen</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {atenciones.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="text-muted-foreground">{a.fecha}</TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{a.cita_id ? "Cita" : "Sin cita"}</Badge>
                  {a.motivo ? (
                    <span className="text-sm text-muted-foreground">{a.motivo}</span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {a.profesional?.nombre ?? "—"}
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {[
                  a.tratamientos_count > 0
                    ? `${a.tratamientos_count} tratamiento${a.tratamientos_count > 1 ? "s" : ""}`
                    : null,
                  a.evoluciones_count > 0
                    ? `${a.evoluciones_count} evolución${a.evoluciones_count > 1 ? "es" : ""}`
                    : null,
                  a.anamnesis_count > 0 ? "anamnesis" : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm" onClick={() => setSeleccionada(a.id)}>
                  Ver detalle
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {atenciones.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                Sin atenciones registradas.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>

      {seleccionada ? (
        <AtencionDetalleDialog
          atencionId={seleccionada}
          open={!!seleccionada}
          onOpenChange={(open) => {
            if (!open) setSeleccionada(null);
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
