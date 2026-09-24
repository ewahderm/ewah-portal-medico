import { requireUsuario } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { UpsellPlan } from "../../_components/upsell-plan";
import { EscanearCliente } from "./escanear-cliente";

export default async function EscanearPage() {
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

  const { data: tieneEntitlement } = await supabase.rpc("has_entitlement", {
    modulo_code: "inventario",
  });

  if (!tieneEntitlement) {
    return (
      <UpsellPlan
        tituloModulo="Inventario"
        mensaje="El control de stock y costeo de insumos no está activo en tu clínica todavía. El registro de qué se aplicó a cada paciente (en Tratamientos) sigue funcionando normal — eso nunca se bloquea. Esta función se activa con el plan Pro. Pídele a tu administrador que la habilite."
      />
    );
  }

  const { data: puedeCrear } = await supabase.rpc("has_permission", {
    modulo_code: "inventario",
    permiso_code: "CREATE",
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Escanear inventario</h1>
        <p className="text-sm text-muted-foreground">
          Escanea la etiqueta de un lote (cámara o pistola) para consultarlo y registrar
          entradas o salidas sin buscarlo manualmente.
        </p>
      </div>

      <EscanearCliente puedeRegistrar={!!puedeCrear} />
    </div>
  );
}
