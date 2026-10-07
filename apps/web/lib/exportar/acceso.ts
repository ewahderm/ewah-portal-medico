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

/**
 * Misma regla que requireAdminExport pero sin lanzar: para server actions,
 * donde en producción Next oculta el mensaje de una excepción. Los Route
 * Handlers siguen usando requireAdminExport (su catch sí lee el mensaje).
 */
export async function verificarAdminExport() {
  const usuario = await getCurrentUsuario();
  if (!usuario) return { ok: false as const, error: "Sesión inválida." };
  if (!esAdministrador(usuario)) {
    return { ok: false as const, error: "Solo un Administrador puede exportar o importar datos." };
  }
  return { ok: true as const, usuario };
}
