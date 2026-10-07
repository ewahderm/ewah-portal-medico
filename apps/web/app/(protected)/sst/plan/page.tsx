import { createClient } from "@/lib/supabase/server";
import { requireUsuario } from "@/lib/auth/session";
import { getAccesoSst, getComites, getInsumosIndicadores, getPlan } from "@/lib/sst/consultas";
import { getDiagnostico } from "@/lib/sst/diagnostico";
import { getUsuariosClinica, hoyColombia } from "@/lib/habilitacion/consultas";
import { indicadoresAnuales, indicadoresMensuales } from "@/lib/sst/indicadores";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { UpsellPlan } from "../../_components/upsell-plan";
import { PlanCliente } from "./plan-cliente";

// F7: plan anual de trabajo, comités (vigía/COPASST y Convivencia) e
// indicadores del Art. 30 de la Res. 0312.
export default async function PlanSstPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
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
        tituloModulo="Plan anual, comités e indicadores — plan Pro"
        mensaje="Arma el plan anual de trabajo, lleva las actas del vigía o COPASST y del Comité de Convivencia, y calcula cada mes los indicadores que exige la Res. 0312. Disponible en el plan Pro."
      />
    );
  }
  const q = await searchParams;
  const hoy = hoyColombia();
  const anioActual = Number(hoy.slice(0, 4));
  const anio = typeof q.anio === "string" && /^\d{4}$/.test(q.anio) ? Number(q.anio) : anioActual;
  const supabase = await createClient();
  const [plan, comites, insumos, usuarios, { d }, { data: puedeCrear }] = await Promise.all([
    getPlan(supabase, anio),
    getComites(supabase),
    getInsumosIndicadores(supabase, anio),
    getUsuariosClinica(supabase),
    getDiagnostico(supabase),
    supabase.rpc("has_permission", { modulo_code: "sst", permiso_code: "CREATE" }),
  ]);
  const hastaMes = anio < anioActual ? 12 : anio > anioActual ? 0 : Number(hoy.slice(5, 7));
  return (
    <PlanCliente
      hoy={hoy}
      anio={anio}
      plan={plan}
      comites={comites}
      usuarios={usuarios}
      mensuales={insumos ? indicadoresMensuales(insumos).filter((m) => m.mes <= hastaMes) : null}
      insumos={insumos?.filter((m) => m.mes <= hastaMes) ?? null}
      anuales={insumos ? indicadoresAnuales(insumos, hastaMes) : null}
      comiteRequerido={d?.comite.tipo ?? "ninguno"}
      convivenciaRequerida={!!d?.convivencia.requerido}
      puedeCrear={!!puedeCrear}
      puedeEditar={acceso.puedeEditar}
      tab={typeof q.tab === "string" ? q.tab : "plan"}
    />
  );
}
