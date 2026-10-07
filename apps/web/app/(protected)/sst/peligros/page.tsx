import { createClient } from "@/lib/supabase/server";
import { requireUsuario } from "@/lib/auth/session";
import { getAccesoSst, getAccionesDeOrigen, getPeligros, getSedes } from "@/lib/sst/consultas";
import { getUsuariosClinica } from "@/lib/habilitacion/consultas";
import { ACEPTABILIDAD, type NivelRiesgo } from "@/lib/sst/gtc45";
import { cn } from "cn";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UpsellPlan } from "../../_components/upsell-plan";
import { NuevoPeligroBoton, PeligroCard } from "./peligros-cliente";

const NIVELES: NivelRiesgo[] = ["I", "II", "III", "IV"];

// F5: matriz de identificación de peligros y valoración de riesgos (GTC 45),
// del riesgo más alto al más bajo, con sus medidas de intervención.
export default async function PeligrosPage() {
  await requireUsuario();
  const acceso = await getAccesoSst();
  if (!acceso.puedeVer) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No tienes permiso para ver esta página.</AlertDescription>
      </Alert>
    );
  }
  if (!acceso.gestion) {
    return (
      <UpsellPlan
        tituloModulo="Matriz de peligros — plan Pro"
        mensaje="Identifica los peligros de tu clínica con plantillas del sector salud, valora el riesgo con la GTC 45 y haz seguimiento a las medidas de control. Disponible en el plan Pro."
      />
    );
  }
  const supabase = await createClient();
  const [peligros, acciones, sedes, usuarios, { data: puedeCrear }] = await Promise.all([
    getPeligros(supabase),
    getAccionesDeOrigen(supabase, "matriz"),
    getSedes(supabase),
    getUsuariosClinica(supabase),
    supabase.rpc("has_permission", { modulo_code: "sst", permiso_code: "CREATE" }),
  ]);
  const accionesPorPeligro = new Map<string, typeof acciones>();
  for (const a of acciones) if (a.origen_id) accionesPorPeligro.set(a.origen_id, [...(accionesPorPeligro.get(a.origen_id) ?? []), a]);
  const conteo = Object.fromEntries(NIVELES.map((n) => [n, peligros.filter((p) => p.nivel_riesgo === n).length])) as Record<NivelRiesgo, number>;
  const nombres = Object.fromEntries(usuarios.map((u) => [u.id, u.nombre]));
  const sinMedidas = peligros.filter((p) => (p.nivel_riesgo === "I" || p.nivel_riesgo === "II") && !(accionesPorPeligro.get(p.id)?.length)).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Matriz de peligros</CardTitle>
            <p className="text-sm text-muted-foreground">
              Identifica cada peligro por actividad, valóralo con la GTC 45 y define las medidas, de la más eficaz (eliminar) a la
              última opción (EPP). Actualízala al menos una vez al año y después de cada accidente grave.
            </p>
          </div>
          {puedeCrear ? <NuevoPeligroBoton sedes={sedes} /> : null}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {NIVELES.map((n) => (
              <div
                key={n}
                className={cn(
                  "rounded-lg border p-3",
                  ACEPTABILIDAD[n].tono === "rojo" && conteo[n] > 0 && "border-destructive/40 bg-destructive/5",
                  ACEPTABILIDAD[n].tono === "ambar" && conteo[n] > 0 && "border-amber-300 bg-amber-50",
                )}
              >
                <p className="text-xs text-muted-foreground">Nivel {n}</p>
                <p className="text-xl font-semibold">{conteo[n]}</p>
                <p className="text-xs text-muted-foreground">{ACEPTABILIDAD[n].texto}</p>
              </div>
            ))}
          </div>
          {sinMedidas > 0 ? (
            <Alert variant="destructive">
              <AlertDescription>
                {sinMedidas} peligro{sinMedidas === 1 ? "" : "s"} no aceptable{sinMedidas === 1 ? "" : "s"} sin medidas de intervención.
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {peligros.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Todavía no hay peligros. Empieza con las plantillas del sector salud: biológico, biomecánico, psicosocial y los demás.
        </p>
      ) : (
        <ul className="space-y-3">
          {peligros.map((p) => (
            <PeligroCard
              key={p.id}
              peligro={p}
              sedes={sedes}
              acciones={accionesPorPeligro.get(p.id) ?? []}
              usuarios={usuarios}
              nombres={nombres}
              puedeCrear={!!puedeCrear}
              puedeEditar={acceso.puedeEditar}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
