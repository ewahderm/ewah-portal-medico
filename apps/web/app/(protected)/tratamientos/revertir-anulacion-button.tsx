"use client";

import { useState, useTransition } from "react";
import { RotateCcwIcon } from "lucide-react";
import { revertirAnulacionTratamiento } from "@/lib/tratamientos/actions";
import { Button } from "@/components/ui/button";
import { exigirExito } from "@/lib/forms/resultado";

export function RevertirAnulacionButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        exigirExito(await revertirAnulacionTratamiento(id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo revertir la anulación.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={pending}
        aria-label="Revertir anulación"
      >
        <RotateCcwIcon className="md:hidden" />
        <span className="hidden md:inline">
          {pending ? "Revirtiendo..." : "Revertir anulación"}
        </span>
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
