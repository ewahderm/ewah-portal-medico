// Paleta de acento para distinguir profesionales en la Agenda — pinta tanto
// el fondo (versión clarita) como el borde izquierdo (saturación completa)
// de cada evento en `agenda-calendario.tsx`; el estado de la cita ya no se
// comunica por color de fondo, sino por una insignia con ícono (ver
// ESTADOS_LEYENDA en ese mismo archivo). Mismo nivel de saturación/
// luminosidad que --ewah-cyan (oklch ~0.75L / ~0.13C) pero con hues
// repartidos lejos del cyan de marca (~210°), del navy/slate (baja croma) y
// del destructive (~22-27°, rojo-naranja) para que ninguno se confunda con
// los colores de las insignias de estado.
export const PALETA_PROFESIONAL: readonly string[] = [
  "oklch(0.72 0.14 60)", // Ámbar dorado
  "oklch(0.72 0.13 95)", // Verde lima/oliva
  "oklch(0.70 0.13 145)", // Verde esmeralda
  "oklch(0.70 0.12 175)", // Verde azulado (teal)
  "oklch(0.62 0.15 245)", // Índigo
  "oklch(0.62 0.15 277)", // Violeta
  "oklch(0.66 0.16 309)", // Orquídea/magenta
  "oklch(0.68 0.15 341)", // Rosa/frambuesa
];

/**
 * Color determinístico y estable para un profesional dado su `id`.
 *
 * No usa índice posicional (una lista de profesionales puede reordenarse
 * al agregar/desactivar alguno) — en su lugar hashea el `id` (djb2:
 * hash = hash*33 + código de carácter) para que el mismo profesional_id
 * siempre caiga en el mismo color sin importar el orden en que llegue la
 * lista.
 *
 * OJO con el paso final: 33 ≡ 1 (mod 8), y la paleta tiene 8 colores — así
 * que `hash % 8` a secas ignora por completo el efecto de la
 * multiplicación por 33 y el resultado se reduce a una simple suma de
 * códigos de carácter, que colisiona todo el tiempo entre UUIDs con
 * estructura parecida (ej. "1111...1111" y "2222...2222" dan el MISMO
 * color — se verificó con Playwright y dos profesionales de prueba salían
 * indistinguibles). La solución estándar es mezclar los bits altos del
 * hash con los bajos (XOR-fold) antes de aplicar el módulo, para que la
 * entropía que sí acumuló la multiplicación en los bits altos no se
 * pierda — esto es necesario para CUALQUIER tamaño de paleta que sea
 * potencia de 2, no es un caso especial de la paleta actual.
 */
export function colorPorProfesional(id: string): string {
  let hash = 5381;
  for (const char of id) {
    hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  }
  const mezclado = (hash ^ (hash >>> 16)) >>> 0;
  return PALETA_PROFESIONAL[mezclado % PALETA_PROFESIONAL.length];
}
