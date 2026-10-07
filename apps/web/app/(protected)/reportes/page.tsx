import { BarChart3Icon } from "lucide-react";
import { esAdministrador, requireUsuario } from "@/lib/auth/session";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { hoyColombiaCliente, sumarDias } from "@/lib/habilitacion/ruta";
import { getAccesoReportes } from "@/lib/reportes/acceso";
import { obtenerAnaliticaClinica } from "@/lib/reportes/actions";
import type { AnaliticaClinica } from "@/lib/reportes/analitica";
import { ReportesWorkspace } from "./_components/reportes-workspace";

export default async function ReportesPage() {
  const usuario = await requireUsuario();
  const acceso = await getAccesoReportes();

  if (!acceso.puedeVerReportes) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No tienes permiso para ver Reportes.</AlertDescription>
      </Alert>
    );
  }

  // Por defecto, los últimos 366 días (hoy incluido) en hora de Colombia.
  const fechaFinal = hoyColombiaCliente();
  const fechaInicial = sumarDias(fechaFinal, -365);

  let analiticaInicial: AnaliticaClinica | null = null;
  let errorAnalitica: string | null = null;
  if (acceso.puedeVerClinica) {
    try {
      const resultado = await obtenerAnaliticaClinica(fechaInicial, fechaFinal);
      if ("error" in resultado) errorAnalitica = resultado.error;
      else analiticaInicial = resultado;
    } catch (error) {
      errorAnalitica = error instanceof Error ? error.message : "No se pudo cargar la analítica clínica.";
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <BarChart3Icon className="size-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Reportes</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Explora la actividad registrada de tu clínica por periodo, tratamiento, profesional,
            medio de pago y país de residencia.
          </p>
        </div>
      </header>
      <ReportesWorkspace
        fechaInicial={fechaInicial}
        fechaFinal={fechaFinal}
        puedeVerClinica={acceso.puedeVerClinica}
        puedeVerInvima={acceso.puedeVerInvima}
        puedeVerNomina={acceso.puedeVerNomina}
        puedeExportar={esAdministrador(usuario)}
        analiticaInicial={analiticaInicial}
        errorAnalitica={errorAnalitica}
      />
    </div>
  );
}
