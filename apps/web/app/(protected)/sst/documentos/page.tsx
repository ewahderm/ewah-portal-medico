import { createClient } from "@/lib/supabase/server";
import { requireUsuario } from "@/lib/auth/session";
import { getAccesoSst, getDocumentosSst } from "@/lib/sst/consultas";
import { getDiagnostico } from "@/lib/sst/diagnostico";
import { CICLOS, documentosDelGrupo, resumenDocumentos } from "@/lib/sst/documentos-catalogo";
import { getUsuariosClinica } from "@/lib/habilitacion/consultas";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UpsellPlan } from "../../_components/upsell-plan";
import { BarraProgreso } from "../../habilitacion/autoevaluacion/barra-progreso";
import { DocumentoFila } from "./documento-fila";

// F4: los documentos del SG-SST que le aplican a la clínica según su grupo,
// con su versión vigente y el historial (nada se borra: 20 años).
export default async function DocumentosSstPage() {
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
        tituloModulo="Documentos del SG-SST — plan Pro"
        mensaje="Lleva la política, el plan anual, la matriz, el plan de emergencias y los demás documentos del SG-SST con sus versiones, y sabe cuáles te faltan según tu tamaño y riesgo. Disponible en el plan Pro."
      />
    );
  }
  const supabase = await createClient();
  const [{ d }, docs, usuarios, { data: puedeCrear }] = await Promise.all([
    getDiagnostico(supabase),
    getDocumentosSst(supabase),
    getUsuariosClinica(supabase),
    supabase.rpc("has_permission", { modulo_code: "sst", permiso_code: "CREATE" }),
  ]);
  const grupo = d?.grupo ?? "sin_calcular";
  const items = documentosDelGrupo(grupo);
  const tipoPorCodigo = new Map(docs.tipos.map((t) => [t.codigo, t]));
  const versionesPorTipo = new Map<string, typeof docs.versiones>();
  for (const v of docs.versiones) versionesPorTipo.set(v.tipo_documento_id, [...(versionesPorTipo.get(v.tipo_documento_id) ?? []), v]);
  const cargados = new Set(items.filter((i) => versionesPorTipo.has(tipoPorCodigo.get(i.codigo)?.id ?? "")).map((i) => i.codigo));
  const r = resumenDocumentos(items, cargados);
  const nombres = Object.fromEntries(usuarios.map((u) => [u.id, u.nombre]));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Documentos del SG-SST</CardTitle>
            <p className="text-sm text-muted-foreground">
              {grupo === "sin_calcular"
                ? "Completa tu diagnóstico para saber exactamente cuáles te aplican; mientras tanto ves los de 7 estándares."
                : grupo === "independiente"
                  ? "Como trabajas solo, te mostramos los básicos."
                  : `Para ${d?.estandares} estándares te aplican ${r.aplican}.`}{" "}
              Cada carga es una versión nueva: las anteriores se conservan.
            </p>
          </div>
          <div className="w-full sm:w-64">
            <BarraProgreso valor={r.aplican ? (r.listos / r.aplican) * 100 : 0} etiqueta={`${r.listos} de ${r.aplican} cargados`} />
          </div>
        </CardHeader>
      </Card>

      {CICLOS.map((c) => {
        const delCiclo = items.filter((i) => i.ciclo === c.value && (i.aplica === "si" || versionesPorTipo.has(tipoPorCodigo.get(i.codigo)?.id ?? "")));
        if (delCiclo.length === 0) return null;
        return (
          <Card key={c.value}>
            <CardHeader>
              <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{c.label}</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {delCiclo.map((i) => {
                const tipo = tipoPorCodigo.get(i.codigo);
                if (!tipo) return null;
                return (
                  <DocumentoFila
                    key={i.codigo}
                    tipoId={tipo.id}
                    nombre={tipo.nombre}
                    explicacion={i.explicacion}
                    aplica={i.aplica === "si"}
                    recomendado={!!i.recomendado}
                    versiones={versionesPorTipo.get(tipo.id) ?? []}
                    nombres={nombres}
                    puedeCrear={!!puedeCrear}
                  />
                );
              })}
            </CardContent>
          </Card>
        );
      })}
      <p className="text-xs text-muted-foreground">
        La lista sale del Decreto 1072 de 2015 (Art. 2.2.4.6.12) y de los estándares de la Res. 0312 de 2019; estamos cotejando
        qué documento exige cada grupo con el texto oficial.
      </p>
    </div>
  );
}
