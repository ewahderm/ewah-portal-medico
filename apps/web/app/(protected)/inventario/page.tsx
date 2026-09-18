import { PackageIcon } from "lucide-react";
import { requireUsuario } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InventarioTabs } from "./inventario-tabs";

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

export default async function InventarioPage() {
  await requireUsuario();
  const supabase = await createClient();

  const { data: puedeVer } = await supabase.rpc("has_permission", {
    modulo_code: "inventario",
    permiso_code: "VIEW",
  });

  if (!puedeVer) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No tienes permiso para ver esta página.</AlertDescription>
      </Alert>
    );
  }

  const [
    { data: puedeCrear },
    { data: puedeAjustar },
    { data: insumosData },
    { data: sedesData },
    { data: lotesData },
  ] = await Promise.all([
    supabase.rpc("has_permission", { modulo_code: "inventario", permiso_code: "CREATE" }),
    supabase.rpc("has_permission", { modulo_code: "inventario", permiso_code: "VOID" }),
    supabase.from("insumos").select("id, nombre").eq("activo", true).order("orden"),
    supabase.from("sedes").select("id, nombre").eq("activo", true).order("orden"),
    supabase
      .from("lotes")
      .select(
        `id, numero_lote, fecha_vencimiento, cantidad_actual, costo_unitario, proveedor, activo, sede_id, insumo_id,
         insumos(nombre, unidad_medida), sedes(nombre)`,
      )
      .eq("activo", true)
      .order("fecha_vencimiento", { ascending: true, nullsFirst: false }),
  ]);

  const insumos = insumosData ?? [];
  const sedes = sedesData ?? [];
  const lotes = (lotesData ?? []) as unknown as LoteRow[];

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <PackageIcon className="size-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Inventario</h1>
          <p className="text-sm text-muted-foreground">
            Control de existencias y movimientos de insumos por sede y de toda la clínica.
          </p>
        </div>
      </div>

      <InventarioTabs
        insumos={insumos}
        sedes={sedes}
        lotes={lotes}
        puedeCrear={!!puedeCrear}
        puedeAjustar={!!puedeAjustar}
      />
    </div>
  );
}
