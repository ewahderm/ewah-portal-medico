// Mismo criterio de normalización que la columna generada `busqueda` en
// Postgres (lower + sin tildes), para que el término buscado calce con lo
// que ya quedó indexado ahí.
export function normalizarBusqueda(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
