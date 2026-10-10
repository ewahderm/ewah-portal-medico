import { CalendarClockIcon, InfoIcon } from "lucide-react";
import { requireUsuario } from "@/lib/auth/session";
import { getMiEmpleado, getSaldosEmpleado, getSolicitudes } from "@/lib/rrhh/solicitudes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListaSolicitudes } from "../rrhh/solicitudes/lista-solicitudes";
import { SaldosEmpleadoTarjetas } from "../rrhh/solicitudes/saldos-empleado";
import { SolicitudDialog } from "../rrhh/solicitudes/solicitud-dialog";

// Cada empleado con usuario: sus vacaciones, permisos y reposiciones, sin
// necesitar acceso al módulo de RRHH.
export default async function MisSolicitudesPage() {
  await requireUsuario();
  const empleado = await getMiEmpleado();

  if (!empleado) {
    return (
      <div className="space-y-6">
        <Encabezado />
        <Alert>
          <InfoIcon />
          <AlertDescription>
            Tu usuario no está vinculado a una ficha de empleado. Pídele al administrador o a Recursos Humanos que, en tu ficha de empleado, elija tu usuario en
            el campo <span className="font-medium">Vincular a un usuario existente</span>.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const [saldos, solicitudes] = await Promise.all([getSaldosEmpleado(empleado.id), getSolicitudes({ empleadoId: empleado.id, limite: 100 })]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <Encabezado />
        <SolicitudDialog saldos={saldos} tipoInicial={empleado.laboral ? "vacaciones" : "permiso"} />
      </div>
      {saldos ? <SaldosEmpleadoTarjetas saldos={saldos} /> : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Tus solicitudes</CardTitle>
        </CardHeader>
        <CardContent>
          <ListaSolicitudes solicitudes={solicitudes} cancelar vacio="Todavía no has hecho solicitudes." />
        </CardContent>
      </Card>
    </div>
  );
}

function Encabezado() {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <CalendarClockIcon className="size-5" />
      </span>
      <div>
        <h1 className="text-2xl font-semibold">Mis solicitudes</h1>
        <p className="text-sm text-muted-foreground">Pide vacaciones o permisos por horas, y registra las horas que repones.</p>
      </div>
    </div>
  );
}
