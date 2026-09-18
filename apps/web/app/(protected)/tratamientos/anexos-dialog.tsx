"use client";

import { useState, useTransition } from "react";
import { FileTextIcon } from "lucide-react";
import {
  listarAnexosTratamiento,
  subirAnexoTratamiento,
  eliminarAnexoTratamiento,
} from "@/lib/tratamientos/actions";
import { CATEGORIAS_ANEXO, CATEGORIA_ANEXO_LABEL } from "@/lib/tratamientos/anexos";
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
import { Combobox } from "@/components/ui/combobox";

type Anexo = {
  id: string;
  storage_path: string;
  nombre_archivo: string;
  content_type: string;
  categoria: string;
  url: string | null;
};

const ITEMS_CATEGORIA = CATEGORIAS_ANEXO.map((c) => ({ value: c, label: CATEGORIA_ANEXO_LABEL[c] }));

export function AnexosDialog({
  tratamientoId,
  puedeSubir,
  puedeEliminar,
}: {
  tratamientoId: string;
  puedeSubir: boolean;
  puedeEliminar: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [categoria, setCategoria] = useState<string>(CATEGORIAS_ANEXO[0]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cargar() {
    startTransition(async () => {
      const data = await listarAnexosTratamiento(tratamientoId);
      setAnexos(data as Anexo[]);
    });
  }

  function handleSubir(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await subirAnexoTratamiento(tratamientoId, categoria, formData);
        cargar();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo subir el archivo.");
      }
    });
  }

  function handleEliminar(id: string, storagePath: string) {
    setError(null);
    startTransition(async () => {
      try {
        await eliminarAnexoTratamiento(id, storagePath);
        cargar();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo eliminar el anexo.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) cargar();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            Anexos
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anexos del tratamiento</DialogTitle>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          {anexos.map((anexo) =>
            anexo.url ? (
              <div key={anexo.id} className="group relative rounded-lg border p-2">
                {anexo.content_type === "application/pdf" ? (
                  <a
                    href={anexo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex flex-col items-center gap-1 py-4 text-center text-xs text-muted-foreground hover:text-foreground"
                  >
                    <FileTextIcon className="size-8" />
                    <span className="line-clamp-1 max-w-full">{anexo.nombre_archivo}</span>
                  </a>
                ) : (
                  <a href={anexo.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={anexo.url}
                      alt={anexo.nombre_archivo}
                      className="aspect-square w-full rounded object-cover"
                    />
                  </a>
                )}
                <p className="mt-1 text-center text-xs text-muted-foreground">
                  {CATEGORIA_ANEXO_LABEL[anexo.categoria] ?? anexo.categoria}
                </p>
                {puedeEliminar ? (
                  <button
                    type="button"
                    onClick={() => handleEliminar(anexo.id, anexo.storage_path)}
                    disabled={pending}
                    className="absolute top-1 right-1 rounded-full bg-black/60 px-1.5 py-0.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            ) : null,
          )}
          {anexos.length === 0 ? (
            <p className="col-span-2 text-center text-sm text-muted-foreground">
              Sin anexos registrados todavía.
            </p>
          ) : null}
        </div>

        {puedeSubir ? (
          <form action={handleSubir} className="space-y-3 border-t pt-4">
            <div className="space-y-2">
              <Label htmlFor="categoriaAnexo">Categoría</Label>
              <Combobox
                id="categoriaAnexo"
                items={ITEMS_CATEGORIA}
                value={categoria}
                onValueChange={(v) => setCategoria(String(v ?? CATEGORIAS_ANEXO[0]))}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="file"
                name="archivo"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="flex-1 text-xs"
                required
              />
              <Button type="submit" size="sm" variant="outline" disabled={pending}>
                Subir
              </Button>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
