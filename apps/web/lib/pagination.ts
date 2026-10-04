// Tamaño de página único para todos los listados paginados de la app — si
// un módulo necesita otro valor, es una señal para volver a discutirlo, no
// para que cada pantalla invente el suyo.
export const TAMANO_PAGINA = 10;

// Convierte el searchParam `page` (string | undefined, puede venir inválido
// desde una URL escrita a mano) en un número de página válido, mínimo 1.
export function paginaDesde(valor: string | undefined): number {
  const pagina = Number(valor);
  return Number.isFinite(pagina) && pagina >= 1 ? Math.floor(pagina) : 1;
}

// Límites para `.range(desde, hasta)` de Supabase a partir de la página
// (1-indexada) y el tamaño de página.
export function rangoPagina(pagina: number, tamano: number = TAMANO_PAGINA): [number, number] {
  const desde = (pagina - 1) * tamano;
  return [desde, desde + tamano - 1];
}

export function totalPaginas(total: number, tamano: number = TAMANO_PAGINA): number {
  return Math.max(1, Math.ceil(total / tamano));
}

// PostgREST devuelve este código (no un array vacío) cuando el `.range()`
// pedido empieza más allá del total de filas — ej. alguien deja un
// `?page=9` en favoritos y luego se archivan/filtran resultados hasta que
// esa página deja de existir. Verificado contra la base real: un `.range()`
// que arranca en 0 SIEMPRE es válido (incluso con 0 filas), así que la
// página 1 nunca puede fallar por esta causa — es el destino seguro para
// recuperarse.
export function esRangoFueraDeLimite(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST103";
}
