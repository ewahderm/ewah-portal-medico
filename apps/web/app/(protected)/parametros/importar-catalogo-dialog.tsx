"use client";

import { useState, useTransition } from "react";
import { UploadIcon, DownloadIcon } from "lucide-react";
import { importarCatalogo, type ImportarCatalogoResultado } from "@/lib/parametros/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FileInput } from "@/components/ui/file-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ImportarCatalogoDialog({ tabla, nombre }: { tabla: string; nombre: string }) {
  const [open, setOpen] = useState(false);
  const [resultado, setResultado] = useState<ImportarCatalogoResultado | null>(null);
  const [pending, startTransition] = useTransition();

  function handleImportar(formData: FormData) {
    setResultado(null);
    startTransition(async () => {
      const resultado = await importarCatalogo(tabla, formData);
      setResultado(resultado);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setResultado(null);
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <UploadIcon /> Importar
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar {nombre.toLowerCase()}</DialogTitle>
        </DialogHeader>

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          nativeButton={false}
          render={<a href={`/api/exportar/parametros/${tabla}/plantilla`} />}
        >
          <DownloadIcon /> Descargar plantilla .xlsx
        </Button>
        <p className="text-xs text-muted-foreground">
          Descarga la plantilla, llénala (una fila por valor) y súbela aquí. El código es
          opcional; el nombre es obligatorio.
        </p>

        {resultado && "error" in resultado ? (
          <Alert variant="destructive">
            <AlertDescription>{resultado.error}</AlertDescription>
          </Alert>
        ) : null}

        {resultado && "importados" in resultado ? (
          <Alert variant={resultado.errores.length > 0 ? "destructive" : "default"}>
            <AlertDescription>
              <p className="font-medium text-foreground">
                {resultado.importados} valor{resultado.importados === 1 ? "" : "es"} importado
                {resultado.importados === 1 ? "" : "s"} correctamente.
              </p>
              {resultado.errores.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
                  {resultado.errores.map((e, i) => (
                    <li key={i}>
                      {e.fila > 0 ? `Fila ${e.fila}: ` : ""}
                      {e.motivo}
                    </li>
                  ))}
                </ul>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <form action={handleImportar} className="space-y-3 border-t pt-4">
          <div className="space-y-2">
            <Label htmlFor="archivoCatalogo" className="font-semibold">Archivo Excel (.xlsx)</Label>
            <FileInput id="archivoCatalogo" name="archivo" accept=".xlsx" required />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Importando..." : "Importar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
