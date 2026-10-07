import { createClient } from "@/lib/supabase/server";
import { requireUsuario } from "@/lib/auth/session";
import { getAccesoSst, getCapacitaciones, getEntregasEpp, getEstadoPersonas, getPersonas, getProfesiograma } from "@/lib/sst/consultas";
import { hoyColombia } from "@/lib/habilitacion/consultas";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { UpsellPlan } from "../../_components/upsell-plan";
import { PersonasCliente } from "./personas-cliente";

// F6: por persona (exámenes, vacunas, EPP, capacitaciones), el programa de
// capacitación del año y las entregas de EPP.
export default async function PersonasSstPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
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
        tituloModulo="Capacitación, EPP y exámenes — plan Pro"
        mensaje="Lleva el programa de capacitación con su asistencia, las entregas de EPP y el vencimiento de las evaluaciones médicas y vacunas de tu personal. Disponible en el plan Pro."
      />
    );
  }
  const q = await searchParams;
  const hoy = hoyColombia();
  const anio = typeof q.anio === "string" && /^\d{4}$/.test(q.anio) ? Number(q.anio) : Number(hoy.slice(0, 4));
  const supabase = await createClient();
  const [estado, capacitaciones, entregas, personas, profesiograma, { data: puedeCrear }, { data: puedeAnular }] = await Promise.all([
    getEstadoPersonas(supabase),
    getCapacitaciones(supabase, anio),
    getEntregasEpp(supabase),
    getPersonas(supabase),
    getProfesiograma(supabase),
    supabase.rpc("has_permission", { modulo_code: "sst", permiso_code: "CREATE" }),
    supabase.rpc("has_permission", { modulo_code: "sst", permiso_code: "VOID" }),
  ]);
  if (!estado) {
    return (
      <Alert>
        <AlertDescription>Esta sección se está terminando de instalar en tu cuenta. Vuelve a intentarlo en unos minutos.</AlertDescription>
      </Alert>
    );
  }
  return (
    <PersonasCliente
      hoy={hoy}
      anio={anio}
      estado={estado}
      capacitaciones={capacitaciones}
      entregas={entregas}
      personas={personas}
      profesiograma={profesiograma}
      puedeCrear={!!puedeCrear}
      puedeEditar={acceso.puedeEditar}
      puedeAnular={!!puedeAnular}
      tab={typeof q.tab === "string" ? q.tab : "personas"}
    />
  );
}
