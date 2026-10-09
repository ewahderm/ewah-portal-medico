"use client";

import { useCallback, useState } from "react";
import { UsersIcon } from "lucide-react";
import { listarUsuariosClinicaPlataforma, type RolGestion, type UsuarioGestion } from "@/lib/usuarios/gestion";
import { ERROR_INESPERADO } from "@/lib/forms/resultado";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { GestionarUsuarioDialog } from "../usuarios/gestionar-usuario-dialog";

// Super administrador: los usuarios de una clínica, para apoyar a su
// administrador (contraseña perdida, correo equivocado, cuenta bloqueada).
export function UsuariosClinicaDialog({ clinicaId, nombreClinica }: { clinicaId: string; nombreClinica: string }) {
  const [open, setOpen] = useState(false);
  const [usuarios, setUsuarios] = useState<UsuarioGestion[] | null>(null);
  const [roles, setRoles] = useState<RolGestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const r = await listarUsuariosClinicaPlataforma(clinicaId);
      if (r.error) return setError(r.error);
      setUsuarios(r.usuarios ?? []);
      setRoles(r.roles ?? []);
    } catch {
      setError(ERROR_INESPERADO);
    }
  }, [clinicaId]);

  const nombreRol = new Map(roles.map((r) => [r.id, r.nombre]));
  const esAdmin = new Set(roles.filter((r) => r.nivel === 1).map((r) => r.id));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setUsuarios(null);
          void cargar();
        }
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" size="sm" variant="outline">
            <UsersIcon /> Usuarios
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Usuarios de {nombreClinica}</DialogTitle>
          <DialogDescription>
            Para apoyar al administrador de la clínica: enviar el enlace de contraseña, definir una temporal, corregir un correo o activar una cuenta. Las acciones
            quedan a tu nombre.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {usuarios === null && !error ? <p className="text-sm text-muted-foreground">Cargando…</p> : null}
        {usuarios && usuarios.length === 0 ? <p className="text-sm text-muted-foreground">La clínica no tiene usuarios.</p> : null}
        {usuarios && usuarios.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {usuarios
              .slice()
              .sort((a, b) => Number(esAdmin.has(b.rol_id)) - Number(esAdmin.has(a.rol_id)))
              .map((u) => (
                <li key={u.id} className="flex flex-col gap-2 px-3 py-2 text-sm sm:flex-row sm:items-center">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium break-words">{u.nombre}</span>
                    <span className="block text-xs break-all text-muted-foreground">{u.email}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={esAdmin.has(u.rol_id) ? "default" : "outline"}>{nombreRol.get(u.rol_id) ?? "Sin rol"}</Badge>
                    {u.bloqueado ? <Badge variant="destructive">Bloqueado</Badge> : !u.activo ? <Badge variant="outline">Desactivado</Badge> : null}
                  </span>
                  <GestionarUsuarioDialog usuario={u} roles={roles} esUnoMismo={false} onCambio={() => void cargar()} />
                </li>
              ))}
          </ul>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
