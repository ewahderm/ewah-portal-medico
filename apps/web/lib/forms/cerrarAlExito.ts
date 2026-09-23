"use client";

import { useEffect, useRef } from "react";

// Detecta la transición pending=true → pending=false de un useActionState
// y, si esa vuelta fue exitosa, dispara onExito() una sola vez (cerrar el
// diálogo, mostrar un toast, etc.). El ref evita confundir el primer
// render (nunca estuvo pending) con una acción recién resuelta.
export function useCerrarAlExito(pending: boolean, exito: boolean, onExito: () => void) {
  const estabaPendiente = useRef(false);

  useEffect(() => {
    if (estabaPendiente.current && !pending && exito) {
      onExito();
    }
    estabaPendiente.current = pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, exito]);
}
