"use client";

import { useActionState, useState } from "react";
import { crearInsumo, editarInsumo } from "@/lib/parametros/insumos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { toItemsOpcional, type Opcion } from "@/lib/forms/opciones";
import { SIN_SELECCION } from "@/lib/forms/opcional";

type Insumo = {
  id: string;
  nombre: string;
  codigo: string | null;
  unidad_medida: string;
  proveedor_id: string | null;
  registro_sanitario: string | null;
  unidad_medida_registro_sanitario: string | null;
  fecha_vencimiento_registro_sanitario: string | null;
  referencia_reportada: string | null;
  presentacion_comercial_reportada: string | null;
  reporte_regulatorio: boolean;
};

export function InsumoDialog({
  proveedores,
  agenciaRegulatoria,
  editando,
  trigger,
}: {
  proveedores: Opcion[];
  /** "INVIMA" hoy — vive en `clinicas.agencia_regulatoria` para que una
   * clínica en otro país (FDA, COFEPRIS...) vea su propia agencia sin
   * tocar código. */
  agenciaRegulatoria: string;
  editando?: Insumo;
  trigger: React.ReactElement;
}) {
  const accion = editando ? editarInsumo : crearInsumo;
  const [state, formAction, pending] = useActionState(accion, null);
  const itemsProveedores = toItemsOpcional(proveedores, SIN_SELECCION, "Sin especificar");
  // Controla si se muestran los campos de reporte regulatorio — la mayoría
  // de insumos de consumo (agujas, batas) no aplican y no tiene sentido
  // pedirle a alguien que llene 4 campos que va a dejar en blanco.
  const [reporteRegulatorio, setReporteRegulatorio] = useState(
    editando?.reporte_regulatorio ?? false,
  );

  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editando ? "Editar insumo" : "Nuevo insumo"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {editando ? <input type="hidden" name="id" value={editando.id} /> : null}
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre</Label>
              <Input id="nombre" name="nombre" defaultValue={editando?.nombre} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="codigo">Código (opcional)</Label>
              <Input id="codigo" name="codigo" defaultValue={editando?.codigo ?? ""} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="unidadMedida">Unidad de medida (para el inventario)</Label>
              <Input
                id="unidadMedida"
                name="unidadMedida"
                placeholder="Unidad, ml, mg..."
                defaultValue={editando?.unidad_medida ?? "unidad"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proveedorId">Proveedor</Label>
              <Combobox
                id="proveedorId"
                name="proveedorId"
                items={itemsProveedores}
                defaultValue={editando?.proveedor_id ?? SIN_SELECCION}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              name="reporteRegulatorio"
              checked={reporteRegulatorio}
              onCheckedChange={(marcado) => setReporteRegulatorio(marcado === true)}
            />
            Este insumo requiere reporte a {agenciaRegulatoria}
          </label>

          {reporteRegulatorio ? (
            <div className="space-y-4 rounded-lg border p-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="registroSanitario">Registro {agenciaRegulatoria}</Label>
                  <Input
                    id="registroSanitario"
                    name="registroSanitario"
                    placeholder="INVIMA 2015DM-0013077"
                    defaultValue={editando?.registro_sanitario ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fechaVencimientoRegistroSanitario">
                    Vencimiento del registro
                  </Label>
                  <Input
                    id="fechaVencimientoRegistroSanitario"
                    name="fechaVencimientoRegistroSanitario"
                    type="date"
                    defaultValue={editando?.fecha_vencimiento_registro_sanitario ?? ""}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="unidadMedidaRegistroSanitario">
                  Unidad de medida reportada a {agenciaRegulatoria}
                </Label>
                <Input
                  id="unidadMedidaRegistroSanitario"
                  name="unidadMedidaRegistroSanitario"
                  placeholder="Puede ser distinta a la unidad de inventario"
                  defaultValue={editando?.unidad_medida_registro_sanitario ?? ""}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="referenciaReportada">Referencia reportada</Label>
                  <Input
                    id="referenciaReportada"
                    name="referenciaReportada"
                    placeholder="Código o referencia del fabricante"
                    defaultValue={editando?.referencia_reportada ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="presentacionComercialReportada">
                    Presentación comercial reportada
                  </Label>
                  <Input
                    id="presentacionComercialReportada"
                    name="presentacionComercialReportada"
                    placeholder="Caja x 1 jeringa"
                    defaultValue={editando?.presentacion_comercial_reportada ?? ""}
                  />
                </div>
              </div>
            </div>
          ) : null}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : editando ? "Guardar cambios" : "Crear insumo"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
