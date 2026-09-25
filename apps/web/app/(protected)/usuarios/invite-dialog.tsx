"use client";

import { useActionState, useState } from "react";
import { KeyRoundIcon, MailIcon } from "lucide-react";
import { crearUsuarioConPassword, inviteStaff } from "@/lib/rbac/actions";
import { useCerrarAlExito } from "@/lib/forms/cerrarAlExito";
import { toast } from "@/components/ui/toast";
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
import { Combobox } from "@/components/ui/combobox";

type Rol = { id: string; nombre: string };

export function InviteDialog({ roles }: { roles: Rol[] }) {
  const [open, setOpen] = useState(false);
  const [conCorreo, setConCorreo] = useState(false);

  const [stateInvitar, accionInvitar, pendingInvitar] = useActionState(inviteStaff, null);
  const [stateCrear, accionCrear, pendingCrear] = useActionState(crearUsuarioConPassword, null);

  const state = conCorreo ? stateInvitar : stateCrear;
  const pending = conCorreo ? pendingInvitar : pendingCrear;

  useCerrarAlExito(pending, !state?.error, () => {
    setOpen(false);
    toast.add({
      title: conCorreo ? "Invitación enviada" : "Usuario creado",
      type: "success",
    });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Agregar usuario</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar usuario</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={conCorreo ? "outline" : "default"}
            onClick={() => setConCorreo(false)}
          >
            <KeyRoundIcon /> Con contraseña
          </Button>
          <Button
            type="button"
            size="sm"
            variant={conCorreo ? "default" : "outline"}
            onClick={() => setConCorreo(true)}
          >
            <MailIcon /> Invitar por correo
          </Button>
        </div>

        {conCorreo ? (
          // Advertencia prominente y no texto pequeño a propósito: si el SMTP
          // no está configurado, este camino crea una cuenta que NUNCA podrá
          // entrar (queda sin contraseña y el correo para definirla no llega),
          // y eso ya pasó en la práctica.
          <Alert>
            <AlertDescription>
              Si el servicio de correo todavía no está configurado con un dominio propio, la
              invitación no llega y la cuenta queda sin poder entrar. En ese caso usa &quot;Con
              contraseña&quot;.
            </AlertDescription>
          </Alert>
        ) : (
          <p className="text-xs text-muted-foreground">
            Tú defines la contraseña y se la entregas a la persona. No envía ningún correo —
            funciona siempre.
          </p>
        )}

        {/* Un form por modo (key distinta) a propósito: así cambiar de modo no
            arrastra el estado ni el error del otro camino. */}
        <form
          key={conCorreo ? "correo" : "password"}
          action={conCorreo ? accionInvitar : accionCrear}
          className="space-y-4"
        >
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input id="nombre" name="nombre" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Correo</Label>
            <Input id="email" name="email" type="email" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rolId">Rol</Label>
            <Combobox
              id="rolId"
              name="rolId"
              required
              items={roles.map((rol) => ({ value: rol.id, label: rol.nombre }))}
              placeholder="Selecciona un rol"
            />
          </div>

          {conCorreo ? null : (
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña temporal</Label>
              <Input
                id="password"
                name="password"
                type="text"
                required
                minLength={8}
                placeholder="Mínimo 8 caracteres"
              />
              <p className="text-xs text-muted-foreground">
                Se muestra en pantalla para que puedas copiarla y entregarla. La persona puede
                cambiarla después desde su perfil.
              </p>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending
              ? conCorreo
                ? "Enviando invitación..."
                : "Creando usuario..."
              : conCorreo
                ? "Enviar invitación"
                : "Crear usuario"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
