export const MOTIVOS_ENTRADA = ["compra", "obsequio_proveedor", "saldo_inicial"] as const;
export const MOTIVOS_SALIDA = ["desecho", "obsequio_paciente"] as const;

export const MOTIVO_LABEL: Record<string, string> = {
  compra: "Compra",
  obsequio_proveedor: "Obsequio de proveedor",
  saldo_inicial: "Saldo inicial",
  consumo_tratamiento: "Consumo en tratamiento",
  desecho: "Desecho",
  obsequio_paciente: "Obsequio a paciente",
  traslado: "Traslado entre sedes",
};
