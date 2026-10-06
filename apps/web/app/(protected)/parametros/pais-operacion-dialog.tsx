"use client";

import { useState, useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { actualizarPaisOperacionClinica } from "@/lib/clinicas/actions";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { toItems, type Opcion } from "@/lib/forms/opciones";

export function PaisOperacionDialog({
  trigger,
  paises,
  paisOperacionId,
  exoneracionAportes,
}: {
  trigger: ReactElement;
  paises: Opcion[];
  paisOperacionId: string;
  exoneracionAportes: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const itemsPaises = toItems(paises);

  function handleGuardar(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await actualizarPaisOperacionClinica(formData);
        router.refresh();
        setOpen(false);
        toast.add({ title: "Configuración actualizada", type: "success" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo actualizar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>País de operación</DialogTitle>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <form action={handleGuardar} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="paisOperacionId">País donde opera tu clínica</Label>
            <Combobox
              id="paisOperacionId"
              name="paisOperacionId"
              items={itemsPaises}
              defaultValue={paisOperacionId}
              required
            />
            <p className="text-xs text-muted-foreground">
              Si no es Colombia, Nómina solo registra generalidades (sin cálculo legal
              automático) — ver el módulo Recursos Humanos.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="exoneracionAportes"
              name="exoneracionAportes"
              defaultChecked={exoneracionAportes}
            />
            <div className="space-y-1">
              <Label htmlFor="exoneracionAportes" className="font-normal">
                Mi clínica está exonerada de aportes a salud y parafiscales (Ley 1607 de 2012)
              </Label>
              <p className="text-xs text-muted-foreground">
                Aplica si tu clínica es persona jurídica declarante de renta — confírmalo con tu
                contador. Solo afecta el cálculo de nómina en Colombia.
              </p>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando..." : "Guardar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
