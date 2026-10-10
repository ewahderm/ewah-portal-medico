"use client";

import { UsersIcon, TriangleAlertIcon, FileTextIcon, WalletIcon, CalendarClockIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmpleadosTabla } from "./empleados-tabla";
import { AccidentesTab } from "./accidentes-tab";
import { ProtocolosTab } from "./protocolos-tab";
import { NominaTab } from "./nomina-tab";
import type { Opcion } from "@/lib/forms/opciones";
import type { SolicitudFila } from "@/lib/rrhh/solicitudes-tipos";
import { SolicitudesTab } from "./solicitudes/solicitudes-tab";

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
  solicitudes,
  pestanaInicial = "empleados",
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
  solicitudes: {
    pendientes: SolicitudFila[];
    resueltas: SolicitudFila[];
    sabadoLaboral: boolean;
    puedeAprobar: boolean;
  };
  pestanaInicial?: string;
}) {
  const empleadosSolicitud = empleados
    .filter((e) => e.activo)
    .map((e) => ({ id: e.id, nombre: e.nombre, laboral: e.categoria_contrato === "laboral" }));
  return (
    <Tabs defaultValue={pestanaInicial}>
      <TabsList className="w-full sm:w-fit">
        <TabsTrigger value="empleados">
          <UsersIcon /> Empleados
        </TabsTrigger>
        <TabsTrigger value="solicitudes">
          <CalendarClockIcon /> Solicitudes
          {solicitudes.pendientes.length ? (
            <span className="ml-1 rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white tabular-nums">{solicitudes.pendientes.length}</span>
          ) : null}
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

      <TabsContent value="solicitudes" className="pt-4">
        <SolicitudesTab
          pendientes={solicitudes.pendientes}
          resueltas={solicitudes.resueltas}
          empleados={empleadosSolicitud}
          sabadoLaboral={solicitudes.sabadoLaboral}
          puedeAprobar={solicitudes.puedeAprobar}
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
