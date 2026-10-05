import Link from "next/link";
import { CheckIcon, ImageIcon, PencilIcon, ShieldCheckIcon, XIcon } from "lucide-react";
import { requireUsuario, esAdministrador } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { REGISTRO_MODULOS } from "@/lib/modulos/registro";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SolicitarPlanDialog } from "./solicitar-plan-dialog";
import { MarcaDialog } from "./marca-dialog";

type Plan = {
  id: string;
  codigo: string;
  nombre: string;
  precio_mensual: number | null;
  limite_pacientes: number | null;
};

export default async function SuscripcionPage() {
  const usuario = await requireUsuario();
  const supabase = await createClient();

  const [{ data: puedeVer }, { data: esSuperAdmin }] = await Promise.all([
    supabase.rpc("has_permission", { modulo_code: "suscripcion", permiso_code: "VIEW" }),
    supabase.rpc("es_super_admin"),
  ]);

  if (!puedeVer) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No tienes permiso para ver esta página.</AlertDescription>
      </Alert>
    );
  }

  const [
    { data: clinica },
    { data: planes },
    { data: plan_modulos },
    { data: plan_features },
    { count: totalPacientes },
  ] = await Promise.all([
    supabase
      .from("clinicas")
      .select(
        "nombre, nombre_comercial, logo_storage_path, correo_notificaciones, telefono_contacto, plan_id, planes(id, codigo, nombre, precio_mensual, limite_pacientes)",
      )
      .eq("id", usuario.clinica_id)
      .single(),
    supabase
      .from("planes")
      .select("id, codigo, nombre, precio_mensual, limite_pacientes")
      .order("precio_mensual"),
    supabase.from("plan_modulos").select("plan_id, modulo_id, incluido, modulos(codigo)"),
    supabase.from("plan_features").select("plan_id, modulo_id, feature_codigo, incluido, modulos(codigo)"),
    supabase.from("pacientes").select("id", { count: "exact", head: true }).eq("activo", true),
  ]);

  const planActual = clinica?.planes as unknown as Plan | null;
  const todosLosPlanes = (planes ?? []) as Plan[];
  const logoUrl = clinica?.logo_storage_path
    ? supabase.storage.from("clinica-logos").getPublicUrl(clinica.logo_storage_path).data.publicUrl
    : null;
  const pacientesUsados = totalPacientes ?? 0;

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

      {esSuperAdmin ? (
        <Alert className="border-primary/30 bg-primary/5">
          <ShieldCheckIcon className="text-primary" />
          <AlertTitle>Super administrador de EWAH Tech</AlertTitle>
          <AlertDescription>
            Esta es la suscripción de tu propia clínica. Para activar un plan de forma provisional o
            desactivar cualquier clínica, usa el panel de Plataforma.
          </AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/plataforma" />}>
              Ir a Plataforma
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Marca y notificaciones</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Logo de la clínica" className="size-full object-contain" />
              ) : (
                <ImageIcon className="size-6 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="text-lg font-semibold">{clinica?.nombre_comercial || clinica?.nombre}</p>
              <p className="text-sm text-muted-foreground">
                {clinica?.correo_notificaciones || "Sin correo de notificaciones configurado"}
                {clinica?.telefono_contacto ? ` · ${clinica.telefono_contacto}` : ""}
              </p>
            </div>
          </div>
          {esAdministrador(usuario) ? (
            <MarcaDialog
              trigger={
                <Button variant="outline" size="sm">
                  <PencilIcon /> Editar
                </Button>
              }
              nombreLegal={clinica?.nombre ?? ""}
              nombreComercial={clinica?.nombre_comercial ?? null}
              correoNotificaciones={clinica?.correo_notificaciones ?? null}
              telefonoContacto={clinica?.telefono_contacto ?? null}
              logoUrl={logoUrl}
            />
          ) : null}
        </CardContent>
      </Card>

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
          {planActual?.limite_pacientes ? (
            <div className="text-right">
              <p
                className={`text-sm font-medium ${
                  pacientesUsados >= planActual.limite_pacientes ? "text-destructive" : ""
                }`}
              >
                {pacientesUsados} de {planActual.limite_pacientes} pacientes
              </p>
              <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full ${
                    pacientesUsados >= planActual.limite_pacientes ? "bg-destructive" : "bg-primary"
                  }`}
                  style={{
                    width: `${Math.min(100, (pacientesUsados / planActual.limite_pacientes) * 100)}%`,
                  }}
                />
              </div>
              {pacientesUsados >= planActual.limite_pacientes ? (
                <p className="mt-1 text-xs text-destructive">Límite alcanzado — solicita Pro para seguir.</p>
              ) : null}
            </div>
          ) : null}
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
                <li className="flex items-center gap-2">
                  <CheckIcon className="size-4 text-primary" />
                  <span>
                    {plan.limite_pacientes
                      ? `Hasta ${plan.limite_pacientes} pacientes`
                      : "Pacientes ilimitados"}
                  </span>
                </li>
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
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
