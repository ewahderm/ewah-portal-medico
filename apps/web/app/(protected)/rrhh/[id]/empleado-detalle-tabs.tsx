"use client";

import { FileTextIcon, BriefcaseIcon, StethoscopeIcon, PalmtreeIcon, WalletIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentosTab } from "./documentos-tab";
import { HistorialTab } from "./historial-tab";
import { IncapacidadesTab } from "./incapacidades-tab";
import { VacacionesTab } from "./vacaciones-tab";
import { NominaEmpleadoTab } from "./nomina-empleado-tab";
import type { Opcion } from "@/lib/forms/opciones";

type Empleado = { id: string; categoria_contrato: string | null };

export function EmpleadoDetalleTabs({
  empleado,
  cargos,
  tiposVacuna,
  tiposExamen,
  puedeCrear,
  puedeVerNomina,
  puedeCrearNomina,
  puedeAnularNomina,
}: {
  empleado: Empleado;
  cargos: Opcion[];
  tiposVacuna: Opcion[];
  tiposExamen: Opcion[];
  puedeCrear: boolean;
  puedeVerNomina: boolean;
  puedeCrearNomina: boolean;
  puedeAnularNomina: boolean;
}) {
  const esLaboral = empleado.categoria_contrato === "laboral";

  return (
    <Tabs defaultValue="documentos">
      <TabsList className="w-full sm:w-fit">
        <TabsTrigger value="documentos">
          <FileTextIcon /> Documentos
        </TabsTrigger>
        <TabsTrigger value="historial">
          <BriefcaseIcon /> Historial
        </TabsTrigger>
        <TabsTrigger value="incapacidades">
          <StethoscopeIcon /> Incapacidades
        </TabsTrigger>
        {esLaboral ? (
          <TabsTrigger value="vacaciones">
            <PalmtreeIcon /> Vacaciones
          </TabsTrigger>
        ) : null}
        {puedeVerNomina ? (
          <TabsTrigger value="nomina">
            <WalletIcon /> {esLaboral ? "Nómina" : "Honorarios"}
          </TabsTrigger>
        ) : null}
      </TabsList>

      <TabsContent value="documentos" className="pt-4">
        <DocumentosTab empleadoId={empleado.id} tiposVacuna={tiposVacuna} tiposExamen={tiposExamen} puedeCrear={puedeCrear} />
      </TabsContent>

      <TabsContent value="historial" className="pt-4">
        <HistorialTab empleadoId={empleado.id} cargos={cargos} puedeCrear={puedeCrear} />
      </TabsContent>

      <TabsContent value="incapacidades" className="pt-4">
        <IncapacidadesTab empleadoId={empleado.id} puedeCrear={puedeCrear} />
      </TabsContent>

      {esLaboral ? (
        <TabsContent value="vacaciones" className="pt-4">
          <VacacionesTab empleadoId={empleado.id} puedeCrear={puedeCrear} />
        </TabsContent>
      ) : null}

      {puedeVerNomina ? (
        <TabsContent value="nomina" className="pt-4">
          <NominaEmpleadoTab
            empleadoId={empleado.id}
            esLaboral={esLaboral}
            puedeCrear={puedeCrearNomina}
            puedeAnular={puedeAnularNomina}
          />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
