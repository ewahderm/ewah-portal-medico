"use client";

import { ActivityIcon, PackageCheckIcon, WalletIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AnaliticaClinica } from "@/lib/reportes/analitica";
import { AnaliticaDashboard } from "./analitica-dashboard";
import { ComisionesReport } from "./comisiones-report";
import { InvimaReport } from "./invima-report";

type Props = {
  fechaInicial: string;
  fechaFinal: string;
  puedeVerClinica: boolean;
  puedeVerInvima: boolean;
  puedeVerNomina: boolean;
  puedeExportar: boolean;
  analiticaInicial: AnaliticaClinica | null;
  errorAnalitica: string | null;
};

export function ReportesWorkspace({
  fechaInicial,
  fechaFinal,
  puedeVerClinica,
  puedeVerInvima,
  puedeVerNomina,
  puedeExportar,
  analiticaInicial,
  errorAnalitica,
}: Props) {
  if (!puedeVerClinica && !puedeVerInvima && !puedeVerNomina) {
    return (
      <Alert>
        <AlertDescription>
          Puedes abrir Reportes, pero aún no tienes acceso a los datos que muestran. Pide a tu
          administrador acceso a Tratamientos y Pacientes, a Inventario o a Nómina, según el reporte
          que necesites.
        </AlertDescription>
      </Alert>
    );
  }

  const pestanaInicial = puedeVerClinica ? "clinica" : puedeVerInvima ? "invima" : "nomina";

  return (
    <Tabs defaultValue={pestanaInicial}>
      <TabsList className="w-full sm:w-fit">
        {puedeVerClinica ? (
          <TabsTrigger value="clinica">
            <ActivityIcon /> Actividad clínica
          </TabsTrigger>
        ) : null}
        {puedeVerInvima ? (
          <TabsTrigger value="invima">
            <PackageCheckIcon /> INVIMA
          </TabsTrigger>
        ) : null}
        {puedeVerNomina ? (
          <TabsTrigger value="nomina">
            <WalletIcon /> Comisiones de nómina
          </TabsTrigger>
        ) : null}
      </TabsList>

      {puedeVerClinica ? (
        <TabsContent value="clinica" className="min-w-0 pt-4">
          {errorAnalitica || !analiticaInicial ? (
            <Alert variant="destructive">
              <AlertDescription>{errorAnalitica ?? "No se pudo cargar la analítica clínica."}</AlertDescription>
            </Alert>
          ) : (
            <AnaliticaDashboard fechaInicial={fechaInicial} fechaFinal={fechaFinal} initialData={analiticaInicial} />
          )}
        </TabsContent>
      ) : null}

      {puedeVerInvima ? (
        <TabsContent value="invima" className="min-w-0 pt-4">
          <InvimaReport puedeExportar={puedeExportar} />
        </TabsContent>
      ) : null}

      {puedeVerNomina ? (
        <TabsContent value="nomina" className="min-w-0 pt-4">
          <ComisionesReport fechaInicial={fechaInicial} fechaFinal={fechaFinal} />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
