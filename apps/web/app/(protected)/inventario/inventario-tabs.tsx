"use client";

import { BarChart3Icon, PackagePlusIcon, ReceiptTextIcon, CalendarRangeIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InventarioActualTab } from "./inventario-actual-tab";
import { RecepcionLoteForm } from "./recepcion-lote-form";
import { MovimientosTab } from "./movimientos-tab";
import { CortesMensualesTab } from "./cortes-mensuales-tab";
import type { Opcion } from "@/lib/forms/opciones";

type LoteRow = {
  id: string;
  numero_lote: string;
  fecha_vencimiento: string | null;
  cantidad_actual: number;
  costo_unitario: number | null;
  proveedor: string | null;
  sede_id: string;
  insumo_id: string;
  activo: boolean;
  insumos: { nombre: string; unidad_medida: string } | null;
  sedes: { nombre: string } | null;
};

export function InventarioTabs({
  insumos,
  sedes,
  lotes,
  puedeCrear,
  puedeAjustar,
}: {
  insumos: Opcion[];
  sedes: Opcion[];
  lotes: LoteRow[];
  puedeCrear: boolean;
  puedeAjustar: boolean;
}) {
  return (
    <Tabs defaultValue="actual">
      <TabsList className="w-full sm:w-fit">
        <TabsTrigger value="actual">
          <BarChart3Icon /> Inventario actual
        </TabsTrigger>
        {puedeCrear ? (
          <TabsTrigger value="recepcion">
            <PackagePlusIcon /> Recepción de lotes
          </TabsTrigger>
        ) : null}
        <TabsTrigger value="movimientos">
          <ReceiptTextIcon /> Movimientos
        </TabsTrigger>
        <TabsTrigger value="cortes">
          <CalendarRangeIcon /> Cortes mensuales
        </TabsTrigger>
      </TabsList>

      <TabsContent value="actual" className="pt-4">
        <InventarioActualTab
          lotes={lotes}
          sedes={sedes}
          puedeAjustar={puedeAjustar}
          puedeTrasladar={puedeCrear}
        />
      </TabsContent>

      {puedeCrear ? (
        <TabsContent value="recepcion" className="pt-4">
          <RecepcionLoteForm insumos={insumos} sedes={sedes} />
        </TabsContent>
      ) : null}

      <TabsContent value="movimientos" className="pt-4">
        <MovimientosTab insumos={insumos} sedes={sedes} lotes={lotes} />
      </TabsContent>

      <TabsContent value="cortes" className="pt-4">
        <CortesMensualesTab sedes={sedes} />
      </TabsContent>
    </Tabs>
  );
}
