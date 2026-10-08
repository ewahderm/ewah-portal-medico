// Manual de usuario: contenido tipado (guías → secciones → bloques). El
// texto admite **negrita** y `etiquetas de botones` (ver TextoManual).

export type Bloque =
  | { tipo: "texto"; texto: string }
  | { tipo: "pasos"; pasos: string[] }
  | { tipo: "lista"; items: string[] }
  // Captura en public/manual/<archivo>; se regeneran con
  // scripts/manual/capturas.mjs.
  | { tipo: "imagen"; archivo: string; alt: string; pie?: string }
  | { tipo: "nota"; tono: "info" | "pro" | "aviso"; texto: string };

export type Seccion = { id: string; titulo: string; bloques: Bloque[] };

export type GrupoManual = "Primeros pasos" | "Atención" | "Operación" | "Flujo de caja" | "Relación y reportes" | "Cumplimiento" | "Administración";

export type Guia = {
  slug: string;
  titulo: string;
  resumen: string;
  grupo: GrupoManual;
  // Nombre de un icono de lucide-react (ver ICONOS en el índice).
  icono: string;
  // Pantalla de la aplicación que explica (enlace "Ir al módulo").
  ruta?: string;
  secciones: Seccion[];
};

export const GRUPOS: GrupoManual[] = ["Primeros pasos", "Atención", "Operación", "Flujo de caja", "Relación y reportes", "Cumplimiento", "Administración"];
