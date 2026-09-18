export const CATEGORIAS_ANEXO = [
  "examen_diagnostico",
  "ecografia",
  "radiografia",
  "doppler",
  "otro",
] as const;

export const CATEGORIA_ANEXO_LABEL: Record<string, string> = {
  examen_diagnostico: "Examen diagnóstico",
  ecografia: "Ecografía",
  radiografia: "Radiografía",
  doppler: "Doppler",
  otro: "Otro",
};
