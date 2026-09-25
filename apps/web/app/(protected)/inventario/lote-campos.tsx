"use client";

import { MOTIVOS_ENTRADA, MOTIVO_LABEL } from "@/lib/inventario/motivos";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { toItems, type Opcion } from "@/lib/forms/opciones";

const ITEMS_MOTIVO_ENTRADA = MOTIVOS_ENTRADA.map((m) => ({ value: m, label: MOTIVO_LABEL[m] }));

/**
 * Campos de "recepción de un lote" — sin <form> ni botón propio a propósito,
 * para que los use tanto la pestaña de Recepción como el diálogo que crea un
 * lote al vuelo desde un movimiento. Una sola definición de los campos evita
 * que las dos pantallas se desincronicen.
 *
 * No pide proveedor: vive en el insumo (insumos.proveedor_id), no en el lote.
 */
export function LoteCampos({
  insumos,
  sedes,
  insumoIdFijo,
  columnas = 2,
}: {
  insumos: Opcion[];
  sedes: Opcion[];
  /** Si se indica, el insumo no se puede cambiar (ya viene elegido desde el
   * movimiento) y viaja como campo oculto. */
  insumoIdFijo?: string;
  columnas?: 1 | 2;
}) {
  const grid = columnas === 2 ? "grid grid-cols-1 gap-6 sm:grid-cols-2" : "grid grid-cols-1 gap-4";

  return (
    <>
      <div className={grid}>
        {insumoIdFijo ? (
          <input type="hidden" name="insumoId" value={insumoIdFijo} />
        ) : (
          <div className="space-y-2">
            <Label htmlFor="insumoId">Insumo</Label>
            <Combobox
              id="insumoId"
              name="insumoId"
              required
              items={toItems(insumos)}
              placeholder="Selecciona"
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="sedeId">Sede</Label>
          <Combobox
            id="sedeId"
            name="sedeId"
            required
            items={toItems(sedes)}
            placeholder="Selecciona"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="numeroLote">Número de lote</Label>
          <Input id="numeroLote" name="numeroLote" required placeholder="Ej: FAA25009" />
        </div>
      </div>

      <div className={grid}>
        <div className="space-y-2">
          <Label htmlFor="fechaVencimiento">Fecha de vencimiento (opcional)</Label>
          <Input id="fechaVencimiento" name="fechaVencimiento" type="date" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cantidadRecibida">Cantidad recibida</Label>
          <Input
            id="cantidadRecibida"
            name="cantidadRecibida"
            type="number"
            min="0"
            step="1"
            required
          />
        </div>
      </div>

      <div className={grid}>
        <div className="space-y-2">
          <Label htmlFor="motivoEntrada">Motivo del ingreso</Label>
          <Combobox
            id="motivoEntrada"
            name="motivoEntrada"
            required
            items={ITEMS_MOTIVO_ENTRADA}
            placeholder="Selecciona"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="costoUnitario">Costo unitario (opcional)</Label>
          <Input id="costoUnitario" name="costoUnitario" type="number" min="0" step="1000" />
        </div>
      </div>
    </>
  );
}
