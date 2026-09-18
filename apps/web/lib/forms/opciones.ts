export type Opcion = { id: string; nombre: string };

export function toItems(opciones: Opcion[]) {
  return opciones.map((o) => ({ value: o.id, label: o.nombre }));
}

export function toItemsOpcional(opciones: Opcion[], valorVacio: string, etiquetaVacia: string) {
  return [{ value: valorVacio, label: etiquetaVacia }, ...toItems(opciones)];
}
