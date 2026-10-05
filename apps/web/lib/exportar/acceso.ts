import { getCurrentUsuario, esAdministrador } from "@/lib/auth/session";

/**
 * Exportar/Importar es función exclusiva del Administrador — a propósito
 * NO pasa por has_permission()/la matriz de roles (ver permission-matrix-
 * dialog.tsx): el Administrador ya tiene todos los permisos sin pasar por
 * esa tabla, así que una casilla "Exportar" para otros roles no tendría
 * ningún efecto real. Usado por cada Route Handler de exportar/importar.
 */
export async function requireAdminExport() {
  const usuario = await getCurrentUsuario();
  if (!usuario) throw new Error("Sesión inválida.");
  if (!esAdministrador(usuario)) {
    throw new Error("Solo un Administrador puede exportar o importar datos.");
  }
  return usuario;
}
