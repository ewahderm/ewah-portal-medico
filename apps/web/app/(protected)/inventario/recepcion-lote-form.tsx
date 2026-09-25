"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { PackagePlusIcon } from "lucide-react";
import { crearLote } from "@/lib/inventario/actions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LoteCampos } from "./lote-campos";
import type { Opcion } from "@/lib/forms/opciones";

export function RecepcionLoteForm({ insumos, sedes }: { insumos: Opcion[]; sedes: Opcion[] }) {
  const [state, formAction, pending] = useActionState(crearLote, null);
  const [resetKey, setResetKey] = useState(0);
  const estabaPendiente = useRef(false);

  useEffect(() => {
    if (estabaPendiente.current && !pending && !state?.error) {
      setResetKey((k) => k + 1);
    }
    estabaPendiente.current = pending;
  }, [pending, state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <PackagePlusIcon className="size-4 text-primary" /> Recepción de lote
        </CardTitle>
        <CardDescription>
          Registra la llegada de un lote nuevo — esto crea el lote y su entrada inicial de stock.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-5" key={resetKey}>
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <LoteCampos insumos={insumos} sedes={sedes} />

          <Button type="submit" disabled={pending}>
            {pending ? "Guardando..." : "Registrar lote"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
