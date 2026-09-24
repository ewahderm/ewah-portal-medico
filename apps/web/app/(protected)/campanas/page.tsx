import { MegaphoneIcon, UsersIcon, PhoneCallIcon, CalendarCheckIcon, SyringeIcon, WalletIcon } from "lucide-react";
import { requireUsuario } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listarFunnelCampana } from "@/lib/campanas/actions";
import { formatoMoneda } from "@/lib/format";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UpsellPlan } from "../_components/upsell-plan";
import { CampanaDialog } from "./campana-dialog";
import { ToggleActivoCampanaButton } from "./toggle-activo-campana-button";

type CampanaRow = {
  id: string;
  nombre: string;
  canal_captacion_id: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  presupuesto: number | null;
  objetivo: string | null;
  activo: boolean;
  canales_captacion: { nombre: string } | null;
};

function EtapaFunnel({
  icon: Icon,
  valor,
  etiqueta,
}: {
  icon: typeof UsersIcon;
  valor: string;
  etiqueta: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 rounded-lg bg-muted/50 px-3 py-3 text-center">
      <Icon className="size-4 text-primary" />
      <p className="text-lg font-semibold leading-none">{valor}</p>
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
    </div>
  );
}

export default async function CampanasPage() {
  await requireUsuario();
  const supabase = await createClient();

  const { data: puedeVer } = await supabase.rpc("has_permission", {
    modulo_code: "campanas",
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
    modulo_code: "campanas",
  });

  if (!tieneEntitlement) {
    return (
      <UpsellPlan
        tituloModulo="Campañas"
        mensaje="Campañas no está activo en tu clínica todavía. Aquí se mide el embudo de captación: leads, contactados, citas agendadas y tratamientos convertidos. Esta función se activa con el plan Pro. Pídele a tu administrador que la habilite — no perderás nada de lo que ya tienes guardado en Pacientes ni en Tratamientos."
      />
    );
  }

  const [{ data: puedeCrear }, { data: puedeEditar }, { data: canalesCaptacionData }, { data: campanasData }] =
    await Promise.all([
      supabase.rpc("has_permission", { modulo_code: "campanas", permiso_code: "CREATE" }),
      supabase.rpc("has_permission", { modulo_code: "campanas", permiso_code: "EDIT" }),
      supabase.from("canales_captacion").select("id, nombre").eq("activo", true).order("orden"),
      supabase
        .from("campanas")
        .select(
          `id, nombre, canal_captacion_id, fecha_inicio, fecha_fin, presupuesto, objetivo, activo,
           canales_captacion(nombre)`,
        )
        .order("created_at", { ascending: false }),
    ]);

  const canalesCaptacion = canalesCaptacionData ?? [];
  const campanas = (campanasData ?? []) as unknown as CampanaRow[];

  const funnels = await Promise.all(campanas.map((c) => listarFunnelCampana(c.id)));

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <MegaphoneIcon className="size-6" />
        </div>
        <div className="flex-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">Campañas</h1>
              <p className="text-sm text-muted-foreground">
                Crea campañas de marketing y sigue su embudo: pacientes captados,
                contactados, con cita agendada y convertidos en tratamiento.
              </p>
            </div>
            {puedeCrear ? (
              <CampanaDialog
                canalesCaptacion={canalesCaptacion}
                trigger={<Button>Nueva campaña</Button>}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {campanas.map((c, i) => {
          const funnel = funnels[i];
          return (
            <Card key={c.id}>
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base font-medium">
                    {c.nombre}
                    <Badge variant={c.activo ? "secondary" : "outline"}>
                      {c.activo ? "Activa" : "Inactiva"}
                    </Badge>
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {c.canales_captacion?.nombre ?? "Sin canal"}
                    {c.fecha_inicio ? ` · desde ${c.fecha_inicio}` : ""}
                    {c.fecha_fin ? ` hasta ${c.fecha_fin}` : ""}
                    {c.presupuesto ? ` · presupuesto ${formatoMoneda(c.presupuesto)}` : ""}
                  </p>
                  {c.objetivo ? (
                    <p className="mt-1 text-sm text-muted-foreground">{c.objetivo}</p>
                  ) : null}
                </div>
                {puedeEditar ? (
                  <div className="flex shrink-0 gap-2">
                    <CampanaDialog
                      canalesCaptacion={canalesCaptacion}
                      campana={c}
                      trigger={
                        <Button variant="outline" size="sm">
                          Editar
                        </Button>
                      }
                    />
                    <ToggleActivoCampanaButton id={c.id} activo={c.activo} />
                  </div>
                ) : null}
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                  <EtapaFunnel icon={UsersIcon} valor={String(funnel.leads)} etiqueta="Leads" />
                  <EtapaFunnel
                    icon={PhoneCallIcon}
                    valor={String(funnel.contactados)}
                    etiqueta="Contactados"
                  />
                  <EtapaFunnel
                    icon={CalendarCheckIcon}
                    valor={String(funnel.agendaronCita)}
                    etiqueta="Agendaron cita"
                  />
                  <EtapaFunnel
                    icon={SyringeIcon}
                    valor={String(funnel.convertidos)}
                    etiqueta="Convertidos"
                  />
                  <EtapaFunnel
                    icon={WalletIcon}
                    valor={formatoMoneda(funnel.ingresos)}
                    etiqueta="Ingresos"
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
        {campanas.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Todavía no hay campañas registradas.
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
