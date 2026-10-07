// Errores en server actions.
//
// En producción Next oculta el mensaje de toda excepción lanzada desde una
// server action (el usuario solo ve "Minified React error #441"), así que
// los fallos pensados para el usuario viajan como valor de retorno, nunca
// como `throw new Error("mensaje para el usuario")`:
//
//   - acción sin datos:  Promise<ResultadoAccion>            -> { error?: string }
//   - acción con datos:  Promise<{ error: string } | { ... }> -> unión discriminada
//
// `throw` queda solo para errores inesperados de programación.

// Resultado de una server action que no devuelve datos.
export type ResultadoAccion = { error?: string };

// Mensaje para el `catch` del cliente: ahí solo llegan fallas de red o
// excepciones inesperadas del servidor (cuyo mensaje real llega ofuscado).
export const ERROR_INESPERADO = "No se pudo completar la acción. Revisa tu conexión e intenta de nuevo.";

/**
 * Para el cliente: desenvuelve el resultado de una server action. Si trae
 * `error`, lo lanza AQUÍ (en el navegador, donde el mensaje no se ofusca)
 * para que lo recoja el `try/catch` que ya mostraba `e.message`; si no, lo
 * devuelve con el tipo estrechado (sin la rama de error).
 *
 *   try {
 *     exigirExito(await toggleCargo(id, next));
 *   } catch (e) {
 *     setError(e instanceof Error ? e.message : "No se pudo actualizar.");
 *   }
 */
export function exigirExito<T>(resultado: T): Exclude<T, { error: string }> {
  if (resultado && typeof resultado === "object" && "error" in resultado) {
    const error = (resultado as { error?: unknown }).error;
    if (typeof error === "string" && error) throw new Error(error);
  }
  return resultado as Exclude<T, { error: string }>;
}
