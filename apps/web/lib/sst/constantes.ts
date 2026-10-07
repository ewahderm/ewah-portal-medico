export const FORMACIONES_RESPONSABLE = [
  { value: "tecnico", label: "Técnico en SST" },
  { value: "tecnologo", label: "Tecnólogo en SST" },
  { value: "profesional", label: "Profesional en SST" },
  { value: "especialista", label: "Especialista en SST" },
] as const;

export const MODOS_SST = [
  { value: "empleador", label: "Tengo trabajadores o contratistas", ayuda: "Clínica, consultorio o profesional que contrata personal." },
  { value: "independiente", label: "Trabajo solo", ayuda: "Profesional independiente sin trabajadores a cargo." },
] as const;
