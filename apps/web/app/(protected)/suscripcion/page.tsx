import { CheckIcon, XIcon } from "lucide-react";
import { requireUsuario, esAdministrador } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { REGISTRO_MODULOS } from "@/lib/modulos/registro";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SolicitarPlanDialog } from "./solicitar-plan-dialog";
import { CambiarPlanPruebaButton } from "./cambiar-plan-prueba-button";

type Plan = { id: string; codigo: string; nombre: string; precio_mensual: number | null };

export default async function SuscripcionPage() {
  const usuario = await requireUsuario();
  const supabase = await createClient();

  const { data: puedeVer } = await supabase.rpc("has_permission", {
    modulo_code: "suscripcion",
    permiso_code: "VIEW",
  });

  if (!puedeVer) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No tienes permiso para ver esta página.</AlertDescription>
      </Alert>
    );
  }

  const [{ data: clinica }, { data: planes }, { data: plan_modulos }, { data: plan_features }] =
    await Promise.all([
      supabase
        .from("clinicas")
        .select("plan_id, planes(id, codigo, nombre, precio_mensual)")
        .single(),
      supabase.from("planes").select("id, codigo, nombre, precio_mensual").order("precio_mensual"),
      supabase.from("plan_modulos").select("plan_id, modulo_id, incluido, modulos(codigo)"),
      supabase.from("plan_features").select("plan_id, modulo_id, feature_codigo, incluido, modulos(codigo)"),
    ]);

  const planActual = clinica?.planes as unknown as Plan | null;
  const todosLosPlanes = (planes ?? []) as Plan[];

  function moduloIncluido(planId: string, moduloCodigo: string) {
    return (plan_modulos ?? []).some((pm) => {
      const codigo = (pm.modulos as unknown as { codigo: string } | null)?.codigo;
      return pm.plan_id === planId && codigo === moduloCodigo && pm.incluido;
    });
  }

  function featureIncluida(planId: string, moduloCodigo: string, featureCodigo: string) {
    return (plan_features ?? []).some((pf) => {
      const codigo = (pf.modulos as unknown as { codigo: string } | null)?.codigo;
      return (
        pf.plan_id === planId &&
        codigo === moduloCodigo &&
        pf.feature_codigo === featureCodigo &&
        pf.incluido
      );
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Suscripción</h1>
        <p className="text-sm text-muted-foreground">
          El plan de tu clínica determina qué módulos y funciones tienes disponibles.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tu plan actual</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div>
            <p className="text-xl font-semibold">{planActual?.nombre ?? "—"}</p>
            <p className="text-sm text-muted-foreground">
              {planActual?.precio_mensual
                ? `$${planActual.precio_mensual.toLocaleString("es-CO")} / mes`
                : "Gratis"}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {todosLosPlanes.map((plan) => (
          <Card key={plan.id} className={plan.id === planActual?.id ? "border-primary" : ""}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{plan.nombre}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {plan.precio_mensual ? `$${plan.precio_mensual.toLocaleString("es-CO")} / mes` : "Gratis"}
                </p>
              </div>
              {plan.id === planActual?.id ? <Badge>Plan actual</Badge> : null}
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-1.5 text-sm">
                {REGISTRO_MODULOS.map((modulo) => {
                  const incluido = moduloIncluido(plan.id, modulo.codigo);
                  return (
                    <li key={modulo.codigo} className="flex items-center gap-2">
                      {incluido ? (
                        <CheckIcon className="size-4 text-primary" />
                      ) : (
                        <XIcon className="size-4 text-muted-foreground" />
                      )}
                      <span className={incluido ? "" : "text-muted-foreground"}>{modulo.nombre}</span>
                    </li>
                  );
                })}
                <li className="flex items-center gap-2 pl-6">
                  {featureIncluida(plan.id, "tratamientos", "anexos") ? (
                    <CheckIcon className="size-4 text-primary" />
                  ) : (
                    <XIcon className="size-4 text-muted-foreground" />
                  )}
                  <span
                    className={
                      featureIncluida(plan.id, "tratamientos", "anexos")
                        ? "text-xs"
                        : "text-xs text-muted-foreground"
                    }
                  >
                    Anexos (exámenes, ecografías) en Tratamientos
                  </span>
                </li>
              </ul>

              {plan.id !== planActual?.id ? (
                <div className="space-y-2">
                  <SolicitarPlanDialog
                    planCodigo={plan.codigo}
                    planNombre={plan.nombre}
                    trigger={<Button className="w-full">Solicitar este plan</Button>}
                  />
                  {esAdministrador(usuario) ? (
                    <CambiarPlanPruebaButton planCodigo={plan.codigo} />
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
