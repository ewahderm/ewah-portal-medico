// Mismo criterio de normalización que la columna generada `busqueda` en
// Postgres (f_unaccent(lower(...))), para que el término buscado calce con
// lo que ya quedó indexado ahí. Usado por cualquier búsqueda contra una
// columna `busqueda` generada (Pacientes, CUPS...).
export function normalizarBusqueda(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Todo texto variable que va dentro del HTML de un correo (nombres de
// clínica, de personas, de documentos) pasa por aquí.
export function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
