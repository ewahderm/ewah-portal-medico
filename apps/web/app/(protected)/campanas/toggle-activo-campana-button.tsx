"use client";

import { useState, useTransition } from "react";
import { toggleActivoCampana } from "@/lib/campanas/actions";
import { Button } from "@/components/ui/button";

export function ToggleActivoCampanaButton({ id, activo }: { id: string; activo: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        await toggleActivoCampana(id, !activo);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo actualizar.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="ghost" size="sm" onClick={handleClick} disabled={pending}>
        {activo ? "Desactivar" : "Activar"}
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
