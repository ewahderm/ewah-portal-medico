// Constantes puras (sin "use server") — se importan tanto desde el diálogo
// cliente (anamnesis-dialog.tsx) como desde el server component que arma
// la pestaña Anamnesis (pacientes/[id]/page.tsx). Una constante así de
// plana en un archivo "use server" rompe al importarse en el cliente (ver
// memoria code_reuse_audit_2026_09), por eso vive en su propio módulo.

export const SIN_ANTECEDENTES = "ninguno";
export const SIN_ALERGIAS = "nkda";

export const ANTECEDENTES_PERSONALES = [
  { value: SIN_ANTECEDENTES, label: "Sin antecedentes relevantes" },
  { value: "hta", label: "Hipertensión arterial" },
  { value: "diabetes", label: "Diabetes" },
  { value: "tiroides", label: "Enfermedad tiroidea" },
  { value: "asma", label: "Asma" },
  { value: "cardiopatia", label: "Cardiopatía" },
  { value: "embarazo_lactancia", label: "Embarazo o lactancia" },
  { value: "coagulacion", label: "Trastorno de la coagulación" },
  { value: "herpes", label: "Herpes recurrente" },
  { value: "queloides", label: "Tendencia a queloides" },
];

export const ALERGIAS = [
  { value: SIN_ALERGIAS, label: "Sin alergias conocidas" },
  { value: "anestesicos", label: "Anestésicos locales" },
  { value: "yodo", label: "Yodo" },
  { value: "latex", label: "Látex" },
  { value: "niquel", label: "Níquel / metales" },
];

export const MEDICAMENTOS_ACTUALES = [
  { value: "anticoagulantes", label: "Anticoagulantes" },
  { value: "isotretinoina", label: "Isotretinoína (últimos 6 meses)" },
  { value: "anticonceptivos", label: "Anticonceptivos" },
];

export const HABITOS = [
  { value: "fuma", label: "Fuma" },
  { value: "exposicion_solar", label: "Exposición solar frecuente" },
  { value: "ejercicio", label: "Hace ejercicio" },
  { value: "alcohol", label: "Consumo de alcohol" },
  { value: "sustancias", label: "Consumo de sustancias" },
];

export const TIPOS_SANGRE = [
  { value: "O+", label: "O+" },
  { value: "O-", label: "O-" },
  { value: "A+", label: "A+" },
  { value: "A-", label: "A-" },
  { value: "B+", label: "B+" },
  { value: "B-", label: "B-" },
  { value: "AB+", label: "AB+" },
  { value: "AB-", label: "AB-" },
];

export const FOTOTIPOS = [
  { value: "I", label: "I — Siempre se quema, nunca se broncea" },
  { value: "II", label: "II — Se quema fácil, broncea mínimo" },
  { value: "III", label: "III — Se quema moderado, broncea gradual" },
  { value: "IV", label: "IV — Se quema mínimo, broncea fácil" },
  { value: "V", label: "V — Rara vez se quema, broncea intenso" },
  { value: "VI", label: "VI — Nunca se quema, muy pigmentada" },
];

function etiquetasPorValor(lista: { value: string; label: string }[], valores: string[] | null | undefined) {
  if (!valores || valores.length === 0) return "—";
  const mapa = new Map(lista.map((o) => [o.value, o.label]));
  return valores.map((v) => mapa.get(v) ?? v).join(", ");
}

export function etiquetasAntecedentes(valores: string[] | null | undefined) {
  return etiquetasPorValor(ANTECEDENTES_PERSONALES, valores);
}

export function etiquetasAlergias(valores: string[] | null | undefined) {
  return etiquetasPorValor(ALERGIAS, valores);
}

export function etiquetasMedicamentos(valores: string[] | null | undefined) {
  return etiquetasPorValor(MEDICAMENTOS_ACTUALES, valores);
}

export function etiquetasHabitos(valores: string[] | null | undefined) {
  return etiquetasPorValor(HABITOS, valores);
}
