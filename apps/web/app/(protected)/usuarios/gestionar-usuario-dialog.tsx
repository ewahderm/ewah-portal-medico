"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MailIcon, SettingsIcon } from "lucide-react";
import { cambiarCorreoUsuario, cambiarEstadoUsuario, cambiarRolUsuario, enviarEnlaceRestablecer } from "@/lib/usuarios/gestion";
import type { ResultadoAccion } from "@/lib/forms/resultado";
import { ERROR_INESPERADO } from "@/lib/forms/resultado";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResetPasswordDialog } from "./reset-password-dialog";

export type UsuarioGestionable = { id: string; nombre: string; email: string; activo: boolean; bloqueado: boolean; rol_id: string };

// Rol, correo, contraseña y estado de un usuario. La usan el Administrador
// de la clínica (Usuarios) y el super administrador (Plataforma); el
// servidor vuelve a validar quién puede y que la clínica nunca quede sin
// un administrador activo.
export function GestionarUsuarioDialog({
  usuario: u,
  roles,
  esUnoMismo,
  onCambio,
}: {
  usuario: UsuarioGestionable;
  roles: { id: string; nombre: string }[];
  esUnoMismo: boolean;
  onCambio?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rolId, setRolId] = useState(u.rol_id);
  const [correo, setCorreo] = useState(u.email);
  const [confirmarEstado, setConfirmarEstado] = useState(false);
  const [pendiente, setPendiente] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ejecutar(clave: string, accion: () => Promise<ResultadoAccion>, exito: string, descripcion?: string) {
    setPendiente(clave);
    setError(null);
    try {
      const r = await accion();
      if (r.error) return setError(r.error);
      toast.add({ title: exito, description: descripcion, type: "success" });
      router.refresh();
      onCambio?.();
    } catch {
      setError(ERROR_INESPERADO);
    } finally {
      setPendiente(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setRolId(u.rol_id);
          setCorreo(u.email);
          setConfirmarEstado(false);
          setError(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <SettingsIcon /> Gestionar
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{u.nombre}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            {u.email}
            {u.bloqueado ? <Badge variant="destructive">Bloqueado</Badge> : u.activo ? <Badge variant="secondary">Activo</Badge> : <Badge variant="outline">Desactivado</Badge>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <section className="space-y-2">
            <Label htmlFor={`rol-${u.id}`}>Rol</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="min-w-0 flex-1">
                <Combobox
                  id={`rol-${u.id}`}
                  items={roles.map((r) => ({ value: r.id, label: r.nombre }))}
                  value={rolId}
                  disabled={esUnoMismo}
                  onValueChange={(v) => v && setRolId(String(v))}
                />
              </div>
              <Button
                variant="outline"
                disabled={esUnoMismo || rolId === u.rol_id || pendiente !== null}
                onClick={() => ejecutar("rol", () => cambiarRolUsuario(u.id, rolId), "Rol actualizado")}
              >
                {pendiente === "rol" ? "Guardando…" : "Cambiar rol"}
              </Button>
            </div>
            {esUnoMismo ? <p className="text-xs text-muted-foreground">Tu propio rol lo cambia otro administrador.</p> : null}
          </section>

          <section className="space-y-2">
            <Label htmlFor={`correo-${u.id}`}>Correo para iniciar sesión</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id={`correo-${u.id}`} type="email" value={correo} maxLength={254} onChange={(e) => setCorreo(e.target.value)} className="min-w-0 flex-1" />
              <Button
                variant="outline"
                disabled={correo.trim().toLowerCase() === u.email.toLowerCase() || pendiente !== null}
                onClick={() =>
                  ejecutar("correo", () => cambiarCorreoUsuario(u.id, correo), "Correo actualizado", "Desde ahora inicia sesión con el correo nuevo y la misma contraseña.")
                }
              >
                {pendiente === "correo" ? "Guardando…" : "Cambiar correo"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Sirve para corregir un correo o para entregarle la cuenta a otra persona (por ejemplo, al dueño de la clínica). La contraseña no cambia: si la cuenta pasa
              a otra persona, envíale el enlace para que defina la suya.
            </p>
          </section>

          <section className="space-y-2">
            <p className="text-sm font-medium">Contraseña</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                size="sm"
                disabled={!u.activo || pendiente !== null}
                onClick={() =>
                  ejecutar("enlace", () => enviarEnlaceRestablecer(u.id), "Enlace enviado", `Le llegará a ${u.email} para que defina una contraseña nueva.`)
                }
              >
                <MailIcon /> {pendiente === "enlace" ? "Enviando…" : "Enviar enlace por correo"}
              </Button>
              <ResetPasswordDialog usuarioId={u.id} nombre={u.nombre} />
            </div>
            <p className="text-xs text-muted-foreground">
              Lo recomendado es el enlace: la persona define su propia contraseña. Si el correo no le llega, define una temporal y entrégasela.
            </p>
          </section>

          <section className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">{u.activo ? "Desactivar la cuenta" : "Activar la cuenta"}</p>
            <p className="text-xs text-muted-foreground">
              {u.activo
                ? "La persona ya no podrá entrar ni ver datos de la clínica. Su historia (citas, tratamientos, evoluciones a su nombre) se conserva."
                : "La persona vuelve a entrar con su correo y contraseña. Si estaba bloqueada por intentos fallidos, también se desbloquea."}
            </p>
            {esUnoMismo && u.activo ? (
              <p className="text-xs text-muted-foreground">No puedes desactivarte a ti mismo: pídeselo a otro administrador.</p>
            ) : (
              <Button
                variant={u.activo ? "destructive" : "default"}
                size="sm"
                disabled={pendiente !== null}
                onBlur={() => setConfirmarEstado(false)}
                onClick={() => {
                  if (u.activo && !confirmarEstado) return setConfirmarEstado(true);
                  setConfirmarEstado(false);
                  ejecutar("estado", () => cambiarEstadoUsuario(u.id, !u.activo), u.activo ? "Cuenta desactivada" : "Cuenta activada");
                }}
              >
                {pendiente === "estado" ? "Guardando…" : confirmarEstado ? "¿Seguro? Pulsa de nuevo para desactivar" : u.activo ? "Desactivar" : "Activar"}
              </Button>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
