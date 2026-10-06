"use client";

import { useState, useTransition } from "react";
import { UploadIcon } from "lucide-react";
import { subirDocumentoNormativo } from "@/lib/rrhh/protocolos";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ProtocoloUploadDialog({
  tipoDocumentoId,
  nombre,
  esNuevaVersion,
  onSubido,
}: {
  tipoDocumentoId: string;
  nombre: string;
  esNuevaVersion: boolean;
  onSubido: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubir(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await subirDocumentoNormativo(formData);
        onSubido();
        toast.add({ title: "Documento guardado", type: "success" });
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo subir el documento.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <UploadIcon /> {esNuevaVersion ? "Nueva versión" : "Subir"}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{nombre}</DialogTitle>
        </DialogHeader>
        <form action={handleSubir} className="space-y-4">
          <input type="hidden" name="tipoDocumentoId" value={tipoDocumentoId} />
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="archivo">Archivo (PDF)</Label>
            <input id="archivo" name="archivo" type="file" accept="application/pdf" required className="text-sm" />
          </div>
          {esNuevaVersion ? (
            <p className="text-xs text-muted-foreground">
              Esto crea una nueva versión — la anterior queda guardada en el historial.
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Subiendo..." : "Guardar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
