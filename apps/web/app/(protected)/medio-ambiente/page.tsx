import { LeafIcon } from "lucide-react";
import { requireUsuario, esAdministrador } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  getSedesActivas,
  getConsultoriosActivos,
  getNeverasActivas,
  getTiposExtintorActivos,
  getEmpleadosActivos,
} from "@/lib/catalogos";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MedioAmbienteTabs } from "./medio-ambiente-tabs";
import { ExportarXlsxLink } from "../_components/exportar-xlsx-link";

export default async function MedioAmbientePage() {
  const usuario = await requireUsuario();
  const supabase = await createClient();

  const { data: puedeVer } = await supabase.rpc("has_permission", {
    modulo_code: "medio_ambiente",
    permiso_code: "VIEW",
  });

  if (!puedeVer) {
    return (
      <Alert variant="destructive">
        <AlertDescription>No tienes permiso para ver esta página.</AlertDescription>
      </Alert>
    );
  }

  const [
    { data: puedeCrear },
    { data: puedeEditar },
    sedes,
    consultorios,
    neveras,
    tiposExtintor,
    empleados,
  ] = await Promise.all([
    supabase.rpc("has_permission", { modulo_code: "medio_ambiente", permiso_code: "CREATE" }),
    supabase.rpc("has_permission", { modulo_code: "medio_ambiente", permiso_code: "EDIT" }),
    getSedesActivas(supabase),
    getConsultoriosActivos(supabase),
    getNeverasActivas(supabase),
    getTiposExtintorActivos(supabase),
    getEmpleadosActivos(supabase),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <LeafIcon className="size-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Medio Ambiente</h1>
            <p className="text-sm text-muted-foreground">
              Registros de cumplimiento normativo: temperatura y humedad, cadena de frío,
              residuos, extintores y limpieza. Ningún registro guardado se puede borrar ni
              editar — son evidencia ante una auditoría o visita de habilitación.
            </p>
          </div>
        </div>
        {esAdministrador(usuario) ? <ExportarXlsxLink href="/api/exportar/medio-ambiente" /> : null}
      </div>

      <MedioAmbienteTabs
        sedes={sedes}
        consultorios={consultorios}
        neveras={neveras}
        tiposExtintor={tiposExtintor}
        empleados={empleados}
        puedeCrear={!!puedeCrear}
        puedeEditar={!!puedeEditar}
        nombreUsuario={usuario.nombre}
      />
    </div>
  );
}
