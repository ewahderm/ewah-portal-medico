import { createClient } from "@/lib/supabase/server";
import { requireUsuario } from "@/lib/auth/session";
import { getAccesoSst, getAccionesDeOrigen, getAutoevaluaciones, getItemsAutoevaluacion } from "@/lib/sst/consultas";
import { getDiagnostico } from "@/lib/sst/diagnostico";
import { getUsuariosClinica, hoyColombia } from "@/lib/habilitacion/consultas";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { UpsellPlan } from "../../_components/upsell-plan";
import { EstandaresCliente } from "./estandares-cliente";

// F2: autoevaluación anual de los estándares mínimos (Res. 0312 de 2019)
// del grupo que corresponde según el diagnóstico, con su plan de
// mejoramiento por ítem que no se cumple.
export default async function EstandaresPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
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
        tituloModulo="Autoevaluación de estándares mínimos — plan Pro"
        mensaje="Califica cada año los estándares mínimos que te corresponden (7, 21 o 60), obtén el puntaje y el nivel, y arma el plan de mejoramiento de lo que falta. Disponible en el plan Pro."
      />
    );
  }
  const q = await searchParams;
  const anioActual = Number(hoyColombia().slice(0, 4));
  const pedido = typeof q.anio === "string" && /^\d{4}$/.test(q.anio) ? Number(q.anio) : anioActual;
  const anio = Math.min(Math.max(pedido, 2019), anioActual);
  const supabase = await createClient();
  const [autoevaluaciones, { d }, usuarios, acciones, { data: puedeCrear }, { data: puedeAprobar }] = await Promise.all([
    getAutoevaluaciones(supabase),
    getDiagnostico(supabase),
    getUsuariosClinica(supabase),
    getAccionesDeOrigen(supabase, "autoevaluacion"),
    supabase.rpc("has_permission", { modulo_code: "sst", permiso_code: "CREATE" }),
    supabase.rpc("has_permission", { modulo_code: "sst", permiso_code: "APPROVE" }),
  ]);
  const actual = autoevaluaciones.find((a) => a.anio === anio) ?? null;
  const items = actual ? await getItemsAutoevaluacion(supabase, actual.id) : [];
  const idsItems = new Set(items.map((i) => i.id));

  return (
    <EstandaresCliente
      anio={anio}
      anioActual={anioActual}
      autoevaluacion={actual}
      historial={autoevaluaciones}
      items={items}
      acciones={acciones.filter((a) => a.origen_id && idsItems.has(a.origen_id))}
      grupoSugerido={d?.estandares ? (String(d.estandares) as "7" | "21" | "60") : null}
      motivoGrupo={d?.motivo ?? null}
      usuarios={usuarios}
      puedeCrear={!!puedeCrear}
      puedeEditar={acceso.puedeEditar}
      puedeAprobar={!!puedeAprobar}
    />
  );
}
