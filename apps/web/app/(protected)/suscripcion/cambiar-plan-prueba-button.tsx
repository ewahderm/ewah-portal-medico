"use client";

import { useState, useTransition } from "react";
import { cambiarPlanPrueba } from "@/lib/suscripcion/actions";
import { Button } from "@/components/ui/button";

export function CambiarPlanPruebaButton({ planCodigo }: { planCodigo: string }) {
  const [pending, startTransition] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!confirmando) {
      setConfirmando(true);
      return;
    }
    setConfirmando(false);
    setError(null);
    startTransition(async () => {
      try {
        await cambiarPlanPrueba(planCodigo);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo cambiar el plan.");
      }
    });
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={handleClick}
        onBlur={() => setConfirmando(false)}
        disabled={pending}
      >
        {pending ? "Cambiando..." : confirmando ? "¿Confirmar cambio de plan?" : "Cambiar ahora (modo prueba)"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
