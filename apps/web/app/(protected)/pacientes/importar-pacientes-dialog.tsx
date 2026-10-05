"use client";

import { useState, useTransition } from "react";
import { UploadIcon, DownloadIcon } from "lucide-react";
import { importarPacientes, type ImportarPacientesResultado } from "@/lib/pacientes/actions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ImportarPacientesDialog() {
  const [open, setOpen] = useState(false);
  const [resultado, setResultado] = useState<ImportarPacientesResultado | null>(null);
  const [pending, startTransition] = useTransition();

  function handleImportar(formData: FormData) {
    setResultado(null);
    startTransition(async () => {
      const resultado = await importarPacientes(formData);
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
          <Button variant="outline">
            <UploadIcon /> Importar
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar pacientes</DialogTitle>
        </DialogHeader>

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          nativeButton={false}
          render={<a href="/api/exportar/pacientes/plantilla" />}
        >
          <DownloadIcon /> Descargar plantilla .xlsx
        </Button>
        <p className="text-xs text-muted-foreground">
          Descarga la plantilla, llénala con los pacientes nuevos (una fila por paciente) y súbela
          aquí. Las columnas con texto (tipo de identificación, género, país, canal de captación)
          deben escribirse igual que aparecen en Parámetros.
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
                {resultado.importados} paciente{resultado.importados === 1 ? "" : "s"}{" "}
                importado{resultado.importados === 1 ? "" : "s"} correctamente.
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
          <input
            type="file"
            name="archivo"
            accept=".xlsx"
            required
            className="w-full text-sm"
          />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Importando..." : "Importar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
