"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { crearEmpleado, editarEmpleado } from "@/lib/rrhh/empleados";
import { useCerrarAlExito } from "@/lib/forms/cerrarAlExito";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { toItemsOpcional, type Opcion } from "@/lib/forms/opciones";
import { SIN_SELECCION } from "@/lib/forms/opcional";

type Empleado = {
  id: string;
  nombre: string;
  codigo?: string | null;
  fecha_nacimiento?: string | null;
  celular?: string | null;
  email?: string | null;
  tipo_identificacion_id?: string | null;
  numero_identificacion?: string | null;
  tipo_contrato_id?: string | null;
  fecha_inicio_contrato?: string | null;
  fecha_fin_contrato?: string | null;
  eps_id?: string | null;
  fondo_pension_id?: string | null;
  fondo_cesantias_id?: string | null;
  arl_id?: string | null;
  numero_tarjeta_profesional?: string | null;
  preferencia_pago?: string | null;
  tipo_cuenta_bancaria_id?: string | null;
  numero_cuenta?: string | null;
  banco_id?: string | null;
  declarante_renta?: boolean | null;
  usuario_id?: string | null;
};

export function EmpleadoDialog({
  tiposIdentificacion,
  tiposContrato,
  fondosPension,
  fondosCesantias,
  arls,
  bancos,
  tiposCuentaBancaria,
  usuarios,
  epsActivas,
  editando,
  trigger,
}: {
  tiposIdentificacion: Opcion[];
  tiposContrato: { id: string; nombre: string; categoria: string }[];
  fondosPension: Opcion[];
  fondosCesantias: Opcion[];
  arls: Opcion[];
  bancos: Opcion[];
  tiposCuentaBancaria: Opcion[];
  usuarios: Opcion[];
  epsActivas: Opcion[];
  editando?: Empleado;
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const accion = editando ? editarEmpleado : crearEmpleado;
  const [state, formAction, pending] = useActionState(accion, null);
  const [tipoContratoId, setTipoContratoId] = useState(editando?.tipo_contrato_id ?? SIN_SELECCION);

  // `tipoContratoId` vive en este componente, que NUNCA se desmonta (solo
  // su `DialogContent` interno se oculta/muestra) — sin este reseteo, abrir
  // "Nuevo empleado" una segunda vez conservaba el tipo de contrato elegido
  // la vez anterior, en vez de arrancar en "Sin especificar". Se hace en el
  // propio manejador de apertura (no en un efecto) para evitar el aviso de
  // "setState síncrono dentro de un efecto" de react-hooks.
  function handleOpenChange(next: boolean) {
    if (next) setTipoContratoId(editando?.tipo_contrato_id ?? SIN_SELECCION);
    setOpen(next);
  }

  const categoriaSeleccionada = useMemo(
    () => tiposContrato.find((t) => t.id === tipoContratoId)?.categoria,
    [tipoContratoId, tiposContrato],
  );

  useCerrarAlExito(pending, !state?.error, () => {
    setOpen(false);
    router.refresh();
    toast.add({ title: editando ? "Empleado actualizado" : "Empleado creado", type: "success" });
  });

  const itemsTiposIdentificacion = toItemsOpcional(tiposIdentificacion, SIN_SELECCION, "Sin especificar");
  const itemsTiposContrato = toItemsOpcional(
    tiposContrato.map((t) => ({ id: t.id, nombre: t.nombre })),
    SIN_SELECCION,
    "Sin especificar",
  );
  const itemsEps = toItemsOpcional(epsActivas, SIN_SELECCION, "Sin especificar");
  const itemsFondosPension = toItemsOpcional(fondosPension, SIN_SELECCION, "Sin especificar");
  const itemsFondosCesantias = toItemsOpcional(fondosCesantias, SIN_SELECCION, "Sin especificar");
  const itemsArls = toItemsOpcional(arls, SIN_SELECCION, "Sin especificar");
  const itemsBancos = toItemsOpcional(bancos, SIN_SELECCION, "Sin especificar");
  const itemsTiposCuenta = toItemsOpcional(tiposCuentaBancaria, SIN_SELECCION, "Sin especificar");
  const itemsUsuarios = toItemsOpcional(usuarios, SIN_SELECCION, "Ninguno (sin acceso al sistema)");
  const itemsPreferenciaPago = [
    { value: SIN_SELECCION, label: "Sin especificar" },
    { value: "quincenal", label: "Quincenal" },
    { value: "mensual", label: "Mensual" },
  ];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="md:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar empleado" : "Nuevo empleado"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-6">
          {editando ? <input type="hidden" name="id" value={editando.id} /> : null}
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground">Datos personales</h3>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre completo</Label>
                <Input id="nombre" name="nombre" defaultValue={editando?.nombre} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fechaNacimiento">Fecha de nacimiento</Label>
                <Input
                  id="fechaNacimiento"
                  name="fechaNacimiento"
                  type="date"
                  defaultValue={editando?.fecha_nacimiento ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="celular">Celular</Label>
                <Input id="celular" name="celular" defaultValue={editando?.celular ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" defaultValue={editando?.email ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tipoIdentificacionId">Tipo de identificación</Label>
                <Combobox
                  id="tipoIdentificacionId"
                  name="tipoIdentificacionId"
                  items={itemsTiposIdentificacion}
                  defaultValue={editando?.tipo_identificacion_id ?? SIN_SELECCION}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="numeroIdentificacion">Número de identificación</Label>
                <Input
                  id="numeroIdentificacion"
                  name="numeroIdentificacion"
                  defaultValue={editando?.numero_identificacion ?? ""}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4 border-t pt-4">
            <h3 className="text-sm font-semibold text-muted-foreground">Contrato</h3>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tipoContratoId">Tipo de contrato</Label>
                <Combobox
                  id="tipoContratoId"
                  name="tipoContratoId"
                  items={itemsTiposContrato}
                  value={tipoContratoId}
                  onValueChange={(v) => setTipoContratoId(String(v ?? SIN_SELECCION))}
                />
                {categoriaSeleccionada === "servicios" ? (
                  <p className="text-xs text-muted-foreground">
                    No genera nómina laboral, vacaciones ni cesantías — se gestiona como honorarios.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="numeroTarjetaProfesional">Tarjeta profesional (si aplica)</Label>
                <Input
                  id="numeroTarjetaProfesional"
                  name="numeroTarjetaProfesional"
                  defaultValue={editando?.numero_tarjeta_profesional ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fechaInicioContrato">Fecha inicio de contrato</Label>
                <Input
                  id="fechaInicioContrato"
                  name="fechaInicioContrato"
                  type="date"
                  defaultValue={editando?.fecha_inicio_contrato ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fechaFinContrato">Fecha fin de contrato (si aplica)</Label>
                <Input
                  id="fechaFinContrato"
                  name="fechaFinContrato"
                  type="date"
                  defaultValue={editando?.fecha_fin_contrato ?? ""}
                />
              </div>
              {categoriaSeleccionada === "servicios" ? (
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Checkbox
                    id="declaranteRenta"
                    name="declaranteRenta"
                    defaultChecked={editando?.declarante_renta ?? false}
                  />
                  <Label htmlFor="declaranteRenta" className="font-normal">
                    Es declarante de renta (define la tarifa de retención: 11% / 10%)
                  </Label>
                </div>
              ) : null}
            </div>
          </section>

          <section className="space-y-4 border-t pt-4">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Seguridad social (generalidad — las entidades disponibles dependen del país de operación)
            </h3>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="epsId">EPS / entidad de salud</Label>
                <Combobox id="epsId" name="epsId" items={itemsEps} defaultValue={editando?.eps_id ?? SIN_SELECCION} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fondoPensionId">Fondo de pensión</Label>
                <Combobox
                  id="fondoPensionId"
                  name="fondoPensionId"
                  items={itemsFondosPension}
                  defaultValue={editando?.fondo_pension_id ?? SIN_SELECCION}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fondoCesantiasId">Fondo de cesantías</Label>
                <Combobox
                  id="fondoCesantiasId"
                  name="fondoCesantiasId"
                  items={itemsFondosCesantias}
                  defaultValue={editando?.fondo_cesantias_id ?? SIN_SELECCION}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="arlId">ARL / entidad de riesgos laborales</Label>
                <Combobox id="arlId" name="arlId" items={itemsArls} defaultValue={editando?.arl_id ?? SIN_SELECCION} />
              </div>
            </div>
          </section>

          <section className="space-y-4 border-t pt-4">
            <h3 className="text-sm font-semibold text-muted-foreground">Pago</h3>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="preferenciaPago">Preferencia de pago</Label>
                <Combobox
                  id="preferenciaPago"
                  name="preferenciaPago"
                  items={itemsPreferenciaPago}
                  defaultValue={editando?.preferencia_pago ?? SIN_SELECCION}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tipoCuentaBancariaId">Tipo de cuenta</Label>
                <Combobox
                  id="tipoCuentaBancariaId"
                  name="tipoCuentaBancariaId"
                  items={itemsTiposCuenta}
                  defaultValue={editando?.tipo_cuenta_bancaria_id ?? SIN_SELECCION}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bancoId">Banco</Label>
                <Combobox id="bancoId" name="bancoId" items={itemsBancos} defaultValue={editando?.banco_id ?? SIN_SELECCION} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="numeroCuenta">Número de cuenta</Label>
                <Input id="numeroCuenta" name="numeroCuenta" defaultValue={editando?.numero_cuenta ?? ""} />
              </div>
            </div>
          </section>

          <section className="space-y-4 border-t pt-4">
            <h3 className="text-sm font-semibold text-muted-foreground">Cuenta en el sistema (opcional)</h3>
            <div className="space-y-2">
              <Label htmlFor="usuarioId">Vincular a un usuario existente</Label>
              <Combobox id="usuarioId" name="usuarioId" items={itemsUsuarios} defaultValue={editando?.usuario_id ?? SIN_SELECCION} />
              <p className="text-xs text-muted-foreground">
                Solo si esta persona ya tiene acceso al sistema (profesional, administrativo).
              </p>
            </div>
          </section>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : editando ? "Guardar cambios" : "Crear empleado"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
