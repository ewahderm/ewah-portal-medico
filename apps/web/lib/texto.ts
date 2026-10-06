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
