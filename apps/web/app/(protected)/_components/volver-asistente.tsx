"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftIcon, XIcon } from "lucide-react";
import { EVENTO_VOLVER, leerVolver, olvidarVolver, RUTA_ASISTENTE } from "@/lib/configuracion/volver";

function suscribir(aviso: () => void) {
  window.addEventListener(EVENTO_VOLVER, aviso);
  return () => window.removeEventListener(EVENTO_VOLVER, aviso);
}

// Cuando la persona sale del asistente a configurar algo, un botón flotante
// le permite volver al paso en el que estaba, sin buscarlo en el menú.
export function VolverAsistente() {
  const pathname = usePathname();
  const destino = useSyncExternalStore(suscribir, leerVolver, () => null);
  if (!destino || pathname.startsWith(RUTA_ASISTENTE)) return null;
  return (
    <div className="fixed bottom-4 left-4 z-40 flex items-center gap-1 rounded-full border bg-card py-1 pr-1 pl-3 shadow-lg print:hidden">
      <Link href={destino} className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
        <ArrowLeftIcon className="size-4" /> Volver al asistente de configuración
      </Link>
      <button
        type="button"
        onClick={olvidarVolver}
        className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Cerrar el acceso al asistente"
      >
        <XIcon className="size-4" />
      </button>
    </div>
  );
}
