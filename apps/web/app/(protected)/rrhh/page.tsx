import { BriefcaseIcon } from "lucide-react";
import { requireUsuario } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  getTiposIdentificacionTodos,
  getTiposContratoActivos,
  getFondosPensionActivos,
  getFondosCesantiasActivos,
  getArlsActivas,
  getBancosActivos,
  getTiposCuentaBancariaActivos,
  getPaisOperacionClinica,
  getEpsActivasPorPais,
} from "@/lib/catalogos";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RrhhTabs, type EmpleadoRow } from "./rrhh-tabs";

export default async function RrhhPage() {
  await requireUsuario();
  const supabase = await createClient();

  const { data: puedeVer } = await supabase.rpc("has_permission", {
    modulo_code: "rrhh",
    permiso_code: "VIEW",
  });

  if (!puedeVer) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No tienes permiso para ver esta página.</AlertDescription>
      </Alert>
    );
  }

  const clinicaPais = await getPaisOperacionClinica(supabase);
  const paisOperacionId = clinicaPais?.pais_operacion_id ?? "";

  const [
    { data: puedeCrear },
    { data: puedeEditar },
    { data: puedeVerNomina },
    empleadosData,
    tiposIdentificacion,
    tiposContrato,
    fondosPension,
    fondosCesantias,
    arls,
    bancos,
    tiposCuentaBancaria,
    epsActivas,
  ] = await Promise.all([
    supabase.rpc("has_permission", { modulo_code: "rrhh", permiso_code: "CREATE" }),
    supabase.rpc("has_permission", { modulo_code: "rrhh", permiso_code: "EDIT" }),
    supabase.rpc("has_permission", { modulo_code: "nomina", permiso_code: "VIEW" }),
    supabase
      .from("empleados")
      .select(
        "id, nombre, numero_identificacion, activo, categoria_contrato, tipos_contrato(nombre), tipos_identificacion(nombre)",
      )
      .order("nombre"),
    getTiposIdentificacionTodos(supabase),
    getTiposContratoActivos(supabase),
    getFondosPensionActivos(supabase, paisOperacionId),
    getFondosCesantiasActivos(supabase, paisOperacionId),
    getArlsActivas(supabase, paisOperacionId),
    getBancosActivos(supabase, paisOperacionId),
    getTiposCuentaBancariaActivos(supabase),
    getEpsActivasPorPais(supabase, paisOperacionId),
  ]);

  const { data: usuariosClinica } = await supabase
    .from("usuarios")
    .select("id, nombre")
    .eq("activo", true)
    .order("nombre");

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <BriefcaseIcon className="size-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Recursos Humanos</h1>
          <p className="text-sm text-muted-foreground">
            Empleados, documentación, historial laboral, incapacidades, vacaciones, accidentes de
            trabajo y protocolos.
          </p>
        </div>
      </div>

      <RrhhTabs
        empleados={(empleadosData.data ?? []) as unknown as EmpleadoRow[]}
        tiposIdentificacion={tiposIdentificacion}
        tiposContrato={tiposContrato}
        fondosPension={fondosPension}
        fondosCesantias={fondosCesantias}
        arls={arls}
        bancos={bancos}
        tiposCuentaBancaria={tiposCuentaBancaria}
        epsActivas={epsActivas}
        usuarios={usuariosClinica ?? []}
        puedeCrear={!!puedeCrear}
        puedeEditar={!!puedeEditar}
        puedeVerNomina={!!puedeVerNomina}
      />
    </div>
  );
}
