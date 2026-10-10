"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { configurarSabadoLaboral } from "@/lib/rrhh/solicitudes";
import type { SolicitudFila } from "@/lib/rrhh/solicitudes-tipos";
import { toast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ListaSolicitudes } from "./lista-solicitudes";
import { SolicitudDialog } from "./solicitud-dialog";

// Bandeja de RRHH: lo pendiente por aprobar, lo resuelto y el registro de
// solicitudes para empleados sin usuario.
export function SolicitudesTab({
  pendientes,
  resueltas,
  empleados,
  sabadoLaboral,
  puedeAprobar,
  puedeCrear,
  puedeEditar,
}: {
  pendientes: SolicitudFila[];
  resueltas: SolicitudFila[];
  empleados: { id: string; nombre: string; laboral: boolean }[];
  sabadoLaboral: boolean;
  puedeAprobar: boolean;
  puedeCrear: boolean;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [sabado, setSabado] = useState(sabadoLaboral);
  const [guardando, setGuardando] = useState(false);

  async function cambiarSabado(valor: boolean) {
    setSabado(valor);
    setGuardando(true);
    const r = await configurarSabadoLaboral(valor);
    setGuardando(false);
    if (r.error) {
      setSabado(!valor);
      return toast.add({ title: "No se guardó", description: r.error, type: "error" });
    }
    toast.add({ title: valor ? "El sábado cuenta como día hábil" : "El sábado ya no cuenta como día hábil", type: "success" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Los empleados con usuario solicitan desde <span className="font-medium text-foreground">Mis solicitudes</span>. Aquí apruebas o rechazas, y registras las
          solicitudes de quienes no tienen usuario.
          {puedeAprobar ? "" : " Para aprobar necesitas el permiso Aprobar de Recursos Humanos."}
        </p>
        {puedeCrear ? <SolicitudDialog empleados={empleados} textoBoton="Registrar solicitud" /> : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Por aprobar <span className="font-normal text-muted-foreground">({pendientes.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ListaSolicitudes solicitudes={pendientes} mostrarEmpleado aprobar={puedeAprobar} cancelar={puedeCrear} vacio="No hay solicitudes pendientes." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Resueltas recientemente</CardTitle>
        </CardHeader>
        <CardContent>
          <ListaSolicitudes solicitudes={resueltas} mostrarEmpleado vacio="Todavía no hay solicitudes resueltas." />
        </CardContent>
      </Card>

      {puedeEditar ? (
        <Card>
          <CardContent className="flex items-start gap-3 py-4">
            <Switch id="sabadoLaboral" checked={sabado} disabled={guardando} onCheckedChange={(v) => cambiarSabado(Boolean(v))} />
            <Label htmlFor="sabadoLaboral" className="flex-col items-start gap-0.5 font-normal">
              <span className="font-medium">El sábado es día laboral</span>
              <span className="text-xs text-muted-foreground">
                Define si los sábados cuentan como días hábiles de vacaciones. Domingos y festivos nunca cuentan.
              </span>
            </Label>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
