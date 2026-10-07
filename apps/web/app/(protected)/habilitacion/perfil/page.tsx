import Link from "next/link";
import { ExternalLinkIcon, PencilIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUsuario } from "@/lib/auth/session";
import { getDepartamentosActivos, getPaisOperacionClinica, getValoresLegalesAnio } from "@/lib/catalogos";
import {
  getAccesoHabilitacion,
  getClinicaRegulatoria,
  getPerfilPrestador,
  getSedesConServicios,
  getTiposPrestador,
  hoyColombia,
} from "@/lib/habilitacion/consultas";
import { DESCRIPCION_GRUPO, PORTAL_REPS_NACIONAL, type EstadoReps } from "@/lib/habilitacion/constantes";
import { fechaLegible } from "@/lib/habilitacion/ruta";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PerfilForm } from "./perfil-form";
import { AsistenteGrupoDialog } from "./asistente-grupo-dialog";
import { CodigoPrestadorDialog } from "./codigo-prestador-dialog";

export default async function HabilitacionPerfilPage({
  searchParams,
}: {
  searchParams: Promise<{ reps?: string }>;
}) {
  await requireUsuario();
  const acceso = await getAccesoHabilitacion();
  if (!acceso.puedeVer) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No tienes permiso para ver esta página.</AlertDescription>
      </Alert>
    );
  }

  const { reps } = await searchParams;
  const supabase = await createClient();
  const hoy = hoyColombia();
  const anioCorte = Number(hoy.slice(0, 4)) - 1;
  const [perfil, clinica, tipos, departamentos, { sedes, serviciosSinSede }, pais] = await Promise.all([
    getPerfilPrestador(supabase),
    getClinicaRegulatoria(supabase),
    getTiposPrestador(supabase),
    getDepartamentosActivos(supabase),
    getSedesConServicios(supabase),
    getPaisOperacionClinica(supabase),
  ]);
  const valores = pais?.pais_operacion_id
    ? await getValoresLegalesAnio(supabase, pais.pais_operacion_id, anioCorte)
    : null;

  // Prellenado del asistente: cuántos servicios declarados hay por
  // complejidad (dato que la circular cuenta para clasificar).
  const servicios = [...sedes.flatMap((s) => s.servicios), ...serviciosSinSede];
  const conteoServicios = {
    alta: servicios.filter((s) => s.complejidad === "alta").length,
    mediana: servicios.filter((s) => s.complejidad === "mediana").length,
  };

  const estadoInicial: EstadoReps | null =
    !perfil && (reps === "inscrito" || reps === "no_inscrito") ? reps : null;
  const esPi = perfil?.tipo_prestador === "profesional_independiente";

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <PerfilForm
        perfil={perfil}
        clinica={clinica}
        tipos={tipos}
        departamentos={departamentos.map((d) => ({ id: d.id, nombre: d.nombre }))}
        estadoInicial={estadoInicial}
        puedeEditar={acceso.puedeEditar}
        hoy={hoy}
      />

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Código del prestador</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-2xl font-semibold tracking-wide">{clinica?.codigo_habilitacion || "—"}</p>
            <p className="text-xs text-muted-foreground">
              Es el mismo código de Parámetros → Datos básicos: si lo cambias aquí, cambia allá.
            </p>
            {acceso.puedeEditar ? (
              <CodigoPrestadorDialog
                codigoActual={clinica?.codigo_habilitacion ?? ""}
                trigger={
                  <Button variant="outline" size="sm">
                    <PencilIcon /> {clinica?.codigo_habilitacion ? "Cambiar código" : "Registrar código"}
                  </Button>
                }
              />
            ) : null}
          </CardContent>
        </Card>

        {perfil?.tipo_prestador && !esPi ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Grupo de clasificación Supersalud</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {perfil.grupo_supersalud ? (
                <>
                  <p className="text-2xl font-semibold">Grupo {perfil.grupo_supersalud}</p>
                  <p className="text-xs text-muted-foreground">{DESCRIPCION_GRUPO[perfil.grupo_supersalud]}</p>
                  {perfil.grupo_fecha_clasificacion ? (
                    <p className="text-xs text-muted-foreground">
                      Clasificado el {fechaLegible(perfil.grupo_fecha_clasificacion)}. Debes verificarlo cada año.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-muted-foreground">
                  Tu grupo define cada cuánto reportas a la Supersalud. Si no lo sabes, el asistente te ayuda a
                  calcularlo.
                </p>
              )}
              {acceso.puedeEditar ? (
                <AsistenteGrupoDialog
                  naturaleza={perfil.naturaleza}
                  grupoActual={perfil.grupo_supersalud}
                  respuestasPrevias={perfil.grupo_asistente}
                  conteoServicios={conteoServicios}
                  uvt={valores?.uvt ? Number(valores.uvt) : null}
                  anioCorte={anioCorte}
                  hoy={hoy}
                  trigger={
                    <Button size="sm" variant={perfil.grupo_supersalud ? "outline" : "default"}>
                      {perfil.grupo_supersalud ? "Revisar mi grupo" : "Calcular mi grupo"}
                    </Button>
                  }
                />
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Portal del REPS</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <a
              href={PORTAL_REPS_NACIONAL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-accent-foreground underline-offset-4 hover:underline"
            >
              Abrir el REPS <ExternalLinkIcon className="size-3.5" />
            </a>
            {!perfil?.ets_codigo_verificado ? (
              <p className="text-xs text-muted-foreground">
                Este es el portal nacional del Ministerio de Salud. Desde allí busca el enlace de tu secretaría de
                salud.
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              ¿Tu NIT, tipo de persona o departamento están mal?{" "}
              <Link href="/parametros" className="underline underline-offset-4">
                Corrígelos en Parámetros → Datos básicos
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
