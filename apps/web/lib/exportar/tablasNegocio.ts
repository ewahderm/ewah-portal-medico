// Whitelist de lo que "Exportar toda la base de datos" puede incluir —
// mismo criterio que registry.ts en Parámetros: nunca se acepta un id de
// tabla del cliente sin pasar por acá. Deliberadamente NO incluye tablas
// internas (auditoria, sesion_usuario, log_acceso, rol_modulo_permiso...):
// no aportan nada en un Excel y algunas son de seguridad, no de negocio.
export const TABLAS_NEGOCIO = [
  { id: "pacientes", label: "Pacientes" },
  { id: "tratamientos", label: "Tratamientos" },
  { id: "citas", label: "Agenda (citas)" },
  { id: "inventario", label: "Inventario (stock + movimientos)" },
  { id: "usuarios", label: "Usuarios" },
  { id: "campanas", label: "Campañas" },
  { id: "medio_ambiente", label: "Medio Ambiente" },
  { id: "parametros", label: "Catálogos de Parámetros" },
] as const;

export type TablaNegocioId = (typeof TABLAS_NEGOCIO)[number]["id"];

export function esTablaNegocioValida(id: string): id is TablaNegocioId {
  return TABLAS_NEGOCIO.some((t) => t.id === id);
}
