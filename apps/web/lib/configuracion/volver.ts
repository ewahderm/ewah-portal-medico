// Recuerda en qué paso del asistente estaba la persona cuando salió a
// configurar algo, para ofrecerle volver. Solo en esta pestaña del
// navegador (sessionStorage); si no se puede guardar, no pasa nada.

export const CLAVE_VOLVER = "ewah-asistente-volver";
export const CLAVE_OMITIDOS = "ewah-asistente-omitidos";
export const RUTA_ASISTENTE = "/configuracion-clinica";
export const EVENTO_VOLVER = "ewah-asistente-volver";

export function recordarVolver(paso: number) {
  try {
    sessionStorage.setItem(CLAVE_VOLVER, `${RUTA_ASISTENTE}?paso=${paso}`);
    window.dispatchEvent(new Event(EVENTO_VOLVER));
  } catch {}
}

export function leerVolver(): string | null {
  try {
    return sessionStorage.getItem(CLAVE_VOLVER);
  } catch {
    return null;
  }
}

export function olvidarVolver() {
  try {
    sessionStorage.removeItem(CLAVE_VOLVER);
    window.dispatchEvent(new Event(EVENTO_VOLVER));
  } catch {}
}

// Módulos que la persona decidió omitir por ahora (solo para mostrarlo: lo
// pendiente sigue saliendo como pendiente).
export function leerOmitidos(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLAVE_OMITIDOS) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function guardarOmitidos(omitidos: Set<string>) {
  try {
    localStorage.setItem(CLAVE_OMITIDOS, JSON.stringify([...omitidos]));
  } catch {}
}
