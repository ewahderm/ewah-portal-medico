import { requireUsuario, esAdministrador } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InviteDialog } from "./invite-dialog";
import { ExportarXlsxLink } from "../_components/exportar-xlsx-link";
import { CreateRolDialog } from "./create-rol-dialog";
import { PermissionMatrixDialog } from "./permission-matrix-dialog";
import { ResetPasswordDialog } from "./reset-password-dialog";

export default async function UsuariosPage() {
  const usuario = await requireUsuario();

  if (!esAdministrador(usuario)) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          No tienes permiso para ver esta página. Solo un Administrador puede gestionar
          usuarios y roles.
        </AlertDescription>
      </Alert>
    );
  }

  const supabase = await createClient();

  const [{ data: usuarios }, { data: roles }, { data: clinicaModulos }, { data: permisos }] =
    await Promise.all([
      supabase
        .from("usuarios")
        .select("id, nombre, email, activo, bloqueado, rol_id")
        .eq("clinica_id", usuario.clinica_id)
        .order("nombre"),
      supabase
        .from("roles")
        .select("id, nombre, descripcion, nivel")
        .eq("clinica_id", usuario.clinica_id)
        .order("nombre"),
      supabase
        .from("clinica_modulos")
        .select("modulo_id")
        .eq("clinica_id", usuario.clinica_id)
        .eq("activo", true),
      supabase.from("permisos").select("id, codigo").order("codigo"),
    ]);

  // Exportar/Importar quedaron fuera de la matriz a propósito: son función
  // exclusiva del Administrador (que ya tiene todos los permisos
  // automáticamente, sin pasar por esta tabla), así que mostrarlas como
  // casilla para otros roles no tendría ningún efecto real.
  const permisosMatriz = (permisos ?? []).filter(
    (p) => p.codigo !== "EXPORT" && p.codigo !== "IMPORT",
  );

  const moduloIds: string[] = (clinicaModulos ?? []).map((cm) => cm.modulo_id);
  const { data: modulosData } = moduloIds.length
    ? await supabase.from("modulos").select("id, nombre").in("id", moduloIds)
    : { data: [] };
  const modulos: { id: string; nombre: string }[] = modulosData ?? [];

  const rolNombreById = new Map((roles ?? []).map((r) => [r.id, r.nombre]));
  const roleIds = (roles ?? []).map((r) => r.id);
  const { data: grants } = roleIds.length
    ? await supabase
        .from("rol_modulo_permiso")
        .select("rol_id, modulo_id, permiso_id")
        .in("rol_id", roleIds)
        .eq("concedido", true)
    : { data: [] };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Usuarios y roles</h1>
        <p className="text-sm text-muted-foreground">
          Gestiona quién tiene acceso a EWAH Tech y qué puede hacer cada uno.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Usuarios</CardTitle>
          <div className="flex gap-2">
            <ExportarXlsxLink href="/api/exportar/usuarios" />
            <InviteDialog roles={(roles ?? []).map((r) => ({ id: r.id, nombre: r.nombre }))} />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="hidden md:table-cell">Correo</TableHead>
                <TableHead className="hidden md:table-cell">Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(usuarios ?? []).map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.nombre}</TableCell>
                  <TableCell className="hidden md:table-cell">{u.email}</TableCell>
                  <TableCell className="hidden md:table-cell">{rolNombreById.get(u.rol_id)}</TableCell>
                  <TableCell>
                    {u.bloqueado ? (
                      <Badge variant="destructive">Bloqueado</Badge>
                    ) : u.activo ? (
                      <Badge variant="secondary">Activo</Badge>
                    ) : (
                      <Badge variant="outline">Desactivado</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <ResetPasswordDialog usuarioId={u.id} nombre={u.nombre} />
                  </TableCell>
                </TableRow>
              ))}
              {(usuarios ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Todavía no hay usuarios registrados.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Roles</CardTitle>
          <CreateRolDialog />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rol</TableHead>
                <TableHead className="hidden md:table-cell">Descripción</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(roles ?? []).map((rol) => (
                <TableRow key={rol.id}>
                  <TableCell className="font-medium">{rol.nombre}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {rol.nivel === 1
                      ? "Acceso total (Administrador)"
                      : (rol.descripcion ?? "—")}
                  </TableCell>
                  <TableCell className="text-right">
                    {rol.nivel === 1 ? (
                      <span className="text-xs text-muted-foreground">
                        Sin restricciones
                      </span>
                    ) : (
                      <PermissionMatrixDialog
                        rolId={rol.id}
                        rolNombre={rol.nombre}
                        modulos={modulos}
                        permisos={permisosMatriz}
                        grants={(grants ?? []).filter((g) => g.rol_id === rol.id)}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(roles ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    Todavía no hay roles registrados.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
