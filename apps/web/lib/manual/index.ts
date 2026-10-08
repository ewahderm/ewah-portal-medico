import type { Guia } from "@/lib/manual/tipos";
import { GUIAS } from "@/lib/manual/guias";

export { GRUPOS, type Guia, type Bloque, type Seccion, type GrupoManual } from "@/lib/manual/tipos";

export function getGuia(slug: string): Guia | undefined {
  return GUIAS.find((g) => g.slug === slug);
}

export function guiasVecinas(slug: string): { anterior: Guia | null; siguiente: Guia | null } {
  const i = GUIAS.findIndex((g) => g.slug === slug);
  return { anterior: i > 0 ? GUIAS[i - 1] : null, siguiente: i >= 0 && i < GUIAS.length - 1 ? GUIAS[i + 1] : null };
}

// Texto plano de una guía (para el buscador del índice).
export function textoDeGuia(g: Guia): string {
  const partes = [g.titulo, g.resumen];
  for (const s of g.secciones) {
    partes.push(s.titulo);
    for (const b of s.bloques) {
      if (b.tipo === "texto" || b.tipo === "nota") partes.push(b.texto);
      else if (b.tipo === "pasos") partes.push(...b.pasos);
      else if (b.tipo === "lista") partes.push(...b.items);
      else if (b.tipo === "imagen") partes.push(b.alt, b.pie ?? "");
    }
  }
  return partes.join(" ").replace(/[*`]/g, "");
}

// Sin tildes y en minúscula, para buscar "atencion" y encontrar "atención".
export function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export { GUIAS };
