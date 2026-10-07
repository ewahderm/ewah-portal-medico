"use client";

import { toast } from "@/components/ui/toast";

// Abre en otra pestaña la URL firmada (60 s) que devuelve una action.
export async function abrirFirmado(pedir: () => Promise<{ error?: string; url?: string }>) {
  const r = await pedir();
  if (r.error || !r.url) {
    toast.add({ title: "No se pudo abrir el archivo", description: r.error, type: "error" });
    return;
  }
  window.open(r.url, "_blank", "noopener,noreferrer");
}
