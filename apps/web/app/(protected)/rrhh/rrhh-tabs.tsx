"use client";

import { UsersIcon, TriangleAlertIcon, FileTextIcon, WalletIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmpleadosTabla } from "./empleados-tabla";
import { AccidentesTab } from "./accidentes-tab";
import { ProtocolosTab } from "./protocolos-tab";
import { NominaTab } from "./nomina-tab";
import type { Opcion } from "@/lib/forms/opciones";

export type EmpleadoRow = {
  id: string;
  nombre: string;
  numero_identificacion: string | null;
  activo: boolean;
  categoria_contrato: string | null;
  tipos_contrato: { nombre: string } | null;
  tipos_identificacion: { nombre: string } | null;
};

export function RrhhTabs({
  empleados,
  tiposIdentificacion,
  tiposContrato,
  fondosPension,
  fondosCesantias,
  arls,
  bancos,
  tiposCuentaBancaria,
  epsActivas,
  usuarios,
  puedeCrear,
  puedeEditar,
  puedeVerNomina,
}: {
  empleados: EmpleadoRow[];
  tiposIdentificacion: Opcion[];
  tiposContrato: { id: string; nombre: string; categoria: string }[];
  fondosPension: Opcion[];
  fondosCesantias: Opcion[];
  arls: Opcion[];
  bancos: Opcion[];
  tiposCuentaBancaria: Opcion[];
  epsActivas: Opcion[];
  usuarios: Opcion[];
  puedeCrear: boolean;
  puedeEditar: boolean;
  puedeVerNomina: boolean;
}) {
  return (
    <Tabs defaultValue="empleados">
      <TabsList className="w-full sm:w-fit">
        <TabsTrigger value="empleados">
          <UsersIcon /> Empleados
        </TabsTrigger>
        <TabsTrigger value="accidentes">
          <TriangleAlertIcon /> Accidentes laborales
        </TabsTrigger>
        <TabsTrigger value="protocolos">
          <FileTextIcon /> Protocolos
        </TabsTrigger>
        {puedeVerNomina ? (
          <TabsTrigger value="nomina">
            <WalletIcon /> Nómina
          </TabsTrigger>
        ) : null}
      </TabsList>

      <TabsContent value="empleados" className="pt-4">
        <EmpleadosTabla
          empleados={empleados}
          tiposIdentificacion={tiposIdentificacion}
          tiposContrato={tiposContrato}
          fondosPension={fondosPension}
          fondosCesantias={fondosCesantias}
          arls={arls}
          bancos={bancos}
          tiposCuentaBancaria={tiposCuentaBancaria}
          epsActivas={epsActivas}
          usuarios={usuarios}
          puedeCrear={puedeCrear}
          puedeEditar={puedeEditar}
        />
      </TabsContent>

      <TabsContent value="accidentes" className="pt-4">
        <AccidentesTab empleados={empleados} puedeCrear={puedeCrear} puedeEditar={puedeEditar} />
      </TabsContent>

      <TabsContent value="protocolos" className="pt-4">
        <ProtocolosTab puedeCrear={puedeCrear} />
      </TabsContent>

      {puedeVerNomina ? (
        <TabsContent value="nomina" className="pt-4">
          <NominaTab />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
