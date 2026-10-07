// Suma las comisiones de nómina por empleado y periodo de pago. Son los
// valores que quedaron guardados en cada comprobante, no un cálculo nuevo
// por tratamiento: el reporte debe cuadrar con lo que se pagó. Un importe
// vacío es un error, no un cero, para no esconder un dato faltante.

export type ComisionFuente = {
  empleadoId: string;
  empleadoNombre: string;
  tipoPeriodo: string;
  fechaInicio: string;
  fechaFin: string;
  comisiones: number | string | null;
  anulado: boolean;
};

export type ComisionNomina = {
  empleadoNombre: string;
  tipoPeriodo: string;
  fechaInicio: string;
  fechaFin: string;
  comisiones: number;
};

function importeValido(valor: number | string | null): number {
  const importe = valor === null ? Number.NaN : Number(valor);
  if (!Number.isFinite(importe)) throw new Error("La nómina contiene una comisión sin valor numérico.");
  return importe;
}

export function agruparComisionesNomina(filas: readonly ComisionFuente[]): ComisionNomina[] {
  const grupos = new Map<string, ComisionNomina>();
  for (const fila of filas) {
    if (fila.anulado) continue;
    const clave = [fila.empleadoId, fila.tipoPeriodo, fila.fechaInicio, fila.fechaFin].join("|");
    const importe = importeValido(fila.comisiones);
    const grupo = grupos.get(clave);
    if (grupo) {
      grupo.comisiones += importe;
    } else {
      grupos.set(clave, {
        empleadoNombre: fila.empleadoNombre,
        tipoPeriodo: fila.tipoPeriodo,
        fechaInicio: fila.fechaInicio,
        fechaFin: fila.fechaFin,
        comisiones: importe,
      });
    }
  }
  return [...grupos.values()].sort((a, b) =>
    a.fechaInicio.localeCompare(b.fechaInicio)
    || a.fechaFin.localeCompare(b.fechaFin)
    || a.empleadoNombre.localeCompare(b.empleadoNombre, "es")
    || a.tipoPeriodo.localeCompare(b.tipoPeriodo, "es"),
  );
}
