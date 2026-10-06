import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
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
  getTiposVacunaActivos,
  getTiposExamenOcupacionalActivos,
  getCargosActivos,
} from "@/lib/catalogos";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmpleadoDialog } from "../empleado-dialog";
import { EmpleadoDetalleTabs } from "./empleado-detalle-tabs";

export default async function EmpleadoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUsuario();
  const supabase = await createClient();

  const { data: puedeVer } = await supabase.rpc("has_permission", { modulo_code: "rrhh", permiso_code: "VIEW" });
  if (!puedeVer) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No tienes permiso para ver esta página.</AlertDescription>
      </Alert>
    );
  }

  const { data: empleado } = await supabase.from("empleados").select("*").eq("id", id).maybeSingle();
  if (!empleado) notFound();

  const clinicaPais = await getPaisOperacionClinica(supabase);
  const paisOperacionId = clinicaPais?.pais_operacion_id ?? "";

  const [
    { data: puedeCrear },
    { data: puedeEditar },
    { data: puedeVerNomina },
    { data: puedeCrearNomina },
    { data: puedeAnularNomina },
    tiposIdentificacion,
    tiposContrato,
    fondosPension,
    fondosCesantias,
    arls,
    bancos,
    tiposCuentaBancaria,
    epsActivas,
    tiposVacuna,
    tiposExamen,
    cargos,
  ] = await Promise.all([
    supabase.rpc("has_permission", { modulo_code: "rrhh", permiso_code: "CREATE" }),
    supabase.rpc("has_permission", { modulo_code: "rrhh", permiso_code: "EDIT" }),
    supabase.rpc("has_permission", { modulo_code: "nomina", permiso_code: "VIEW" }),
    supabase.rpc("has_permission", { modulo_code: "nomina", permiso_code: "CREATE" }),
    supabase.rpc("has_permission", { modulo_code: "nomina", permiso_code: "VOID" }),
    getTiposIdentificacionTodos(supabase),
    getTiposContratoActivos(supabase),
    getFondosPensionActivos(supabase, paisOperacionId),
    getFondosCesantiasActivos(supabase, paisOperacionId),
    getArlsActivas(supabase, paisOperacionId),
    getBancosActivos(supabase, paisOperacionId),
    getTiposCuentaBancariaActivos(supabase),
    getEpsActivasPorPais(supabase, paisOperacionId),
    getTiposVacunaActivos(supabase),
    getTiposExamenOcupacionalActivos(supabase),
    getCargosActivos(supabase),
  ]);

  const { data: usuariosClinica } = await supabase.from("usuarios").select("id, nombre").eq("activo", true).order("nombre");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/rrhh" />}>
            <ArrowLeftIcon />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">{empleado.nombre}</h1>
            <p className="text-sm text-muted-foreground">
              {empleado.categoria_contrato === "servicios" ? "Contrato por servicios" : "Empleado"}
            </p>
          </div>
        </div>
        {puedeEditar ? (
          <EmpleadoDialog
            tiposIdentificacion={tiposIdentificacion}
            tiposContrato={tiposContrato}
            fondosPension={fondosPension}
            fondosCesantias={fondosCesantias}
            arls={arls}
            bancos={bancos}
            tiposCuentaBancaria={tiposCuentaBancaria}
            epsActivas={epsActivas}
            usuarios={usuariosClinica ?? []}
            editando={empleado}
            trigger={<Button variant="outline">Editar datos</Button>}
          />
        ) : null}
      </div>

      <EmpleadoDetalleTabs
        empleado={empleado}
        cargos={cargos}
        tiposVacuna={tiposVacuna}
        tiposExamen={tiposExamen}
        puedeCrear={!!puedeCrear}
        puedeVerNomina={!!puedeVerNomina}
        puedeCrearNomina={!!puedeCrearNomina}
        puedeAnularNomina={!!puedeAnularNomina}
      />
    </div>
  );
}
