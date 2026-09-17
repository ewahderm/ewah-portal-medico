"use client";

import { useActionState, useState } from "react";
import { crearPaciente, actualizarPaciente } from "@/lib/pacientes/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Opcion = { id: string; nombre: string };

type Paciente = {
  id: string;
  tipo_identificacion_id: string;
  numero_identificacion: string;
  primer_nombre: string;
  segundo_nombre: string | null;
  primer_apellido: string;
  segundo_apellido: string | null;
  fecha_nacimiento: string | null;
  genero_id: string | null;
  nacionalidad_id: string | null;
  pais_residencia_id: string | null;
  canal_captacion_id: string | null;
  eps_id: string | null;
  email: string | null;
  telefono1: string | null;
  telefono2: string | null;
};

type Catalogos = {
  tiposIdentificacion: Opcion[];
  generos: Opcion[];
  paises: Opcion[];
  canalesCaptacion: Opcion[];
  eps: Opcion[];
};

const COLOMBIA_NOMBRE = "Colombia";

export function PacienteDialog({
  catalogos,
  paciente,
  trigger,
}: {
  catalogos: Catalogos;
  paciente?: Paciente;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const action = paciente ? actualizarPaciente : crearPaciente;
  const [state, formAction, pending] = useActionState(action, null);

  const colombiaId = catalogos.paises.find((p) => p.nombre === COLOMBIA_NOMBRE)?.id;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{paciente ? "Editar paciente" : "Nuevo paciente"}</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          {paciente ? <input type="hidden" name="id" value={paciente.id} /> : null}

          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tipoIdentificacionId">Tipo de identificación</Label>
              <Select
                name="tipoIdentificacionId"
                required
                defaultValue={paciente?.tipo_identificacion_id}
              >
                <SelectTrigger id="tipoIdentificacionId" className="w-full">
                  <SelectValue placeholder="Selecciona" />
                </SelectTrigger>
                <SelectContent>
                  {catalogos.tiposIdentificacion.map((op) => (
                    <SelectItem key={op.id} value={op.id}>
                      {op.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="numeroIdentificacion">Número de identificación</Label>
              <Input
                id="numeroIdentificacion"
                name="numeroIdentificacion"
                defaultValue={paciente?.numero_identificacion}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="primerNombre">Primer nombre</Label>
              <Input
                id="primerNombre"
                name="primerNombre"
                defaultValue={paciente?.primer_nombre}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="segundoNombre">Segundo nombre</Label>
              <Input
                id="segundoNombre"
                name="segundoNombre"
                defaultValue={paciente?.segundo_nombre ?? ""}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="primerApellido">Primer apellido</Label>
              <Input
                id="primerApellido"
                name="primerApellido"
                defaultValue={paciente?.primer_apellido}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="segundoApellido">Segundo apellido</Label>
              <Input
                id="segundoApellido"
                name="segundoApellido"
                defaultValue={paciente?.segundo_apellido ?? ""}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fechaNacimiento">Fecha de nacimiento</Label>
              <Input
                id="fechaNacimiento"
                name="fechaNacimiento"
                type="date"
                defaultValue={paciente?.fecha_nacimiento ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="generoId">Género</Label>
              <Select name="generoId" defaultValue={paciente?.genero_id ?? undefined}>
                <SelectTrigger id="generoId" className="w-full">
                  <SelectValue placeholder="Selecciona" />
                </SelectTrigger>
                <SelectContent>
                  {catalogos.generos.map((op) => (
                    <SelectItem key={op.id} value={op.id}>
                      {op.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nacionalidadId">Nacionalidad</Label>
              <Select
                name="nacionalidadId"
                defaultValue={paciente?.nacionalidad_id ?? colombiaId}
              >
                <SelectTrigger id="nacionalidadId" className="w-full">
                  <SelectValue placeholder="Selecciona" />
                </SelectTrigger>
                <SelectContent>
                  {catalogos.paises.map((op) => (
                    <SelectItem key={op.id} value={op.id}>
                      {op.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paisResidenciaId">País de residencia</Label>
              <Select
                name="paisResidenciaId"
                defaultValue={paciente?.pais_residencia_id ?? colombiaId}
              >
                <SelectTrigger id="paisResidenciaId" className="w-full">
                  <SelectValue placeholder="Selecciona" />
                </SelectTrigger>
                <SelectContent>
                  {catalogos.paises.map((op) => (
                    <SelectItem key={op.id} value={op.id}>
                      {op.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="canalCaptacionId">¿Cómo nos conoció?</Label>
              <Select
                name="canalCaptacionId"
                defaultValue={paciente?.canal_captacion_id ?? undefined}
              >
                <SelectTrigger id="canalCaptacionId" className="w-full">
                  <SelectValue placeholder="Selecciona" />
                </SelectTrigger>
                <SelectContent>
                  {catalogos.canalesCaptacion.map((op) => (
                    <SelectItem key={op.id} value={op.id}>
                      {op.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="epsId">EPS</Label>
              <Select name="epsId" defaultValue={paciente?.eps_id ?? undefined}>
                <SelectTrigger id="epsId" className="w-full">
                  <SelectValue placeholder="Selecciona" />
                </SelectTrigger>
                <SelectContent>
                  {catalogos.eps.map((op) => (
                    <SelectItem key={op.id} value={op.id}>
                      {op.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Correo</Label>
            <Input id="email" name="email" type="email" defaultValue={paciente?.email ?? ""} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="telefono1">Teléfono principal</Label>
              <Input
                id="telefono1"
                name="telefono1"
                defaultValue={paciente?.telefono1 ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefono2">Teléfono alterno</Label>
              <Input
                id="telefono2"
                name="telefono2"
                defaultValue={paciente?.telefono2 ?? ""}
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : paciente ? "Guardar cambios" : "Crear paciente"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
