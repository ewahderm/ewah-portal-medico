// Base UI's <Select> no permite un SelectItem con value="" (lo trata
// como "sin selección" internamente y no se puede volver a elegir desde
// la UI una vez que se escogió un valor real). Por eso todo select
// opcional usa este valor centinela como su opción "en blanco" — nunca
// se guarda tal cual, cualquier lectura de formulario lo convierte en
// null. Mantener un solo centinela compartido evita que cada diálogo
// invente el suyo.
export const SIN_SELECCION = "__sin_seleccion__";

export function valorOpcionalSelect(formData: FormData, campo: string): string | null {
  const valor = String(formData.get(campo) ?? "").trim();
  return valor && valor !== SIN_SELECCION ? valor : null;
}
