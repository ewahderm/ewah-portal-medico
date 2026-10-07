import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUsuario } from "@/lib/auth/session";
import {
  getAccesoHabilitacion,
  getClinicaRegulatoria,
  getDocumentosClinica,
  getHitosTramite,
  getPerfilPrestador,
  getSedesConServicios,
  getSuficiencia,
  getUsuariosClinica,
  hoyColombia,
} from "@/lib/habilitacion/consultas";
import { armarChecklist, contextoDocumentos, resumenChecklist } from "@/lib/habilitacion/checklist";
import { perfilCompleto, fechaLegible } from "@/lib/habilitacion/ruta";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UpsellPlan } from "../../_components/upsell-plan";
import { BarraProgreso } from "../autoevaluacion/barra-progreso";
import { ChecklistDocumentos } from "./checklist-documentos";
import { Tramite } from "./tramite";
import { Suficiencia } from "./suficiencia";

// Etapa 3 (HU-3.1 a HU-3.5): qué radicar, el trámite ante la secretaría y
// la suficiencia patrimonial. El checklist se CALCULA con reglas
// (lib/habilitacion/reglas-documentos.ts); un renglón solo existe en la BD
// cuando hay algo que guardar.
export default async function DocumentosPage() {
  await requireUsuario();
  const acceso = await getAccesoHabilitacion();
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
        tituloModulo="Documentos de inscripción — plan Pro"
        mensaje="Te decimos exactamente qué documentos radicar según tu tipo de prestador, tus sedes y tus servicios; guardas cada versión, te avisamos lo que vence y llevas el trámite con la secretaría paso a paso. Disponible en el plan Pro."
      />
    );
  }

  const supabase = await createClient();
  const [perfil, clinica, { sedes }, documentos, hitos, suficiencia, usuarios] = await Promise.all([
    getPerfilPrestador(supabase),
    getClinicaRegulatoria(supabase),
    getSedesConServicios(supabase),
    getDocumentosClinica(supabase),
    getHitosTramite(supabase),
    getSuficiencia(supabase),
    getUsuariosClinica(supabase),
  ]);

  if (documentos === null) {
    return (
      <Alert>
        <TriangleAlertIcon />
        <AlertDescription>Los documentos se están terminando de instalar en tu cuenta. Vuelve en unos minutos.</AlertDescription>
      </Alert>
    );
  }
  if (!perfilCompleto(perfil)) {
    return (
      <Card>
        <CardContent className="space-y-2 py-4 text-center">
          <p className="font-medium">Primero completa tu perfil</p>
          <p className="text-sm text-muted-foreground">
            Los documentos que pide la norma dependen de tu tipo de prestador y de si eres persona natural o jurídica.
          </p>
          <Button variant="outline" nativeButton={false} render={<Link href="/habilitacion/perfil" />}>
            Ir a Perfil
          </Button>
        </CardContent>
      </Card>
    );
  }

  const hoy = hoyColombia();
  const personaJuridica = clinica?.tipo_persona?.codigo ? clinica.tipo_persona.codigo === "JURIDICA" : null;
  const items = armarChecklist(
    documentos.catalogo,
    documentos.renglones,
    contextoDocumentos(perfil, personaJuridica, sedes),
    perfil?.fecha_planeada_radicacion ?? null,
    hoy,
    acceso.puedeEditar,
  );
  const resumen = resumenChecklist(items);
  const nombres = Object.fromEntries(usuarios.map((u) => [u.id, u.nombre]));
  const aplicaSuficiencia = perfil?.tipo_prestador === "ips" || perfil?.tipo_prestador === "transporte_especial";
  const avance = resumen.total === 0 ? 0 : Math.round((resumen.listos / resumen.total) * 100);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-3 py-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1 text-sm">
            <p>
              Para radicar te faltan <strong>{resumen.total - resumen.listos}</strong> de <strong>{resumen.total}</strong> documentos.
              {resumen.vencidos > 0 ? <span className="font-medium text-destructive"> {resumen.vencidos} vencido(s).</span> : null}
            </p>
            <p className="text-xs text-muted-foreground">
              {perfil?.fecha_planeada_radicacion
                ? `Piensas radicar el ${fechaLegible(perfil.fecha_planeada_radicacion)}: medimos la vigencia de cada documento contra esa fecha.`
                : "Si ya sabes cuándo vas a radicar, escríbelo en tu Perfil y medimos la vigencia contra esa fecha."}
            </p>
          </div>
          <div className="w-full sm:w-56">
            <BarraProgreso valor={avance} etiqueta={`Listos para radicar: ${avance} %`} />
          </div>
        </CardContent>
      </Card>

      {personaJuridica === null ? (
        <Alert>
          <TriangleAlertIcon />
          <AlertDescription>
            Indica en{" "}
            <Link href="/parametros" className="underline underline-offset-4">
              Parámetros → Datos básicos
            </Link>{" "}
            si eres persona natural o jurídica: algunos documentos dependen de eso y por ahora los mostramos como «por confirmar».
          </AlertDescription>
        </Alert>
      ) : null}

      <ChecklistDocumentos
        items={items}
        sedes={sedes.map((s) => ({ id: s.id, nombre: s.nombre }))}
        nombres={nombres}
        puedeCrear={acceso.puedeCrear}
        puedeEditar={acceso.puedeEditar}
      />

      <Tramite hitos={hitos} nombres={nombres} puedeCrear={acceso.puedeCrear} puedeAnular={acceso.puedeAnular} estadoReps={perfil?.estado_reps ?? null} />

      {aplicaSuficiencia && acceso.puedeEditar ? (
        <Suficiencia registros={suficiencia} puedeCrear={acceso.puedeCrear} puedeAnular={acceso.puedeAnular} />
      ) : null}
    </div>
  );
}
