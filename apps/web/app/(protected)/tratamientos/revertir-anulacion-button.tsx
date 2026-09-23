"use client";

import { useState, useTransition } from "react";
import { revertirAnulacionTratamiento } from "@/lib/tratamientos/actions";
import { Button } from "@/components/ui/button";

export function RevertirAnulacionButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        await revertirAnulacionTratamiento(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo revertir la anulación.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" onClick={handleClick} disabled={pending}>
        {pending ? "Revirtiendo..." : "Revertir anulación"}
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
