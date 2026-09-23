"use client";

import { useState, useTransition } from "react";
import { FileTextIcon, DownloadIcon } from "lucide-react";
import {
  listarAnexosTratamiento,
  subirAnexoTratamiento,
  eliminarAnexoTratamiento,
  urlFirmadaAnexo,
} from "@/lib/tratamientos/actions";
import { CATEGORIAS_ANEXO, CATEGORIA_ANEXO_LABEL } from "@/lib/tratamientos/anexos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  observaciones: string | null;
  url: string | null;
};

const ITEMS_CATEGORIA = CATEGORIAS_ANEXO.map((c) => ({ value: c, label: CATEGORIA_ANEXO_LABEL[c] }));

export function AnexosDialog({
  tratamientoId,
  puedeSubir,
  puedeEliminar,
  tieneArchivos,
}: {
  tratamientoId: string;
  puedeSubir: boolean;
  puedeEliminar: boolean;
  /** Marca el botón cuando el tratamiento ya tiene al menos un anexo —
   * para saberlo sin tener que abrir el diálogo. */
  tieneArchivos: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [categoria, setCategoria] = useState<string>(CATEGORIAS_ANEXO[0]);
  // Controlado por el mismo motivo que en FotosDialog: handleSubir atrapa
  // su propio error, así que React nunca ve el rechazo y resetea los
  // campos no controlados igual — sin esto, una subida fallida borraba la
  // observación ya escrita.
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
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
        setObservaciones("");
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

  function handleClickEliminar(anexo: Anexo) {
    if (confirmandoId === anexo.id) {
      setConfirmandoId(null);
      handleEliminar(anexo.id, anexo.storage_path);
    } else {
      setConfirmandoId(anexo.id);
    }
  }

  function handleDescargar(anexo: Anexo) {
    startTransition(async () => {
      const url = await urlFirmadaAnexo(anexo.storage_path, true);
      if (url) window.open(url, "_blank");
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
          <Button variant="outline" size="sm" className="relative">
            Anexos
            {tieneArchivos ? (
              <>
                <span
                  aria-hidden
                  title="Ya tiene anexos"
                  className="absolute -top-1 -right-1 size-2 rounded-full bg-primary"
                />
                <span className="sr-only"> (ya tiene anexos)</span>
              </>
            ) : null}
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
                {anexo.observaciones ? (
                  <p className="text-center text-xs text-muted-foreground">{anexo.observaciones}</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => handleDescargar(anexo)}
                  disabled={pending}
                  aria-label="Descargar anexo"
                  title="Descargar"
                  className="absolute bottom-1 left-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <DownloadIcon className="size-3" />
                </button>
                {puedeEliminar ? (
                  <button
                    type="button"
                    onClick={() => handleClickEliminar(anexo)}
                    onBlur={() => setConfirmandoId(null)}
                    disabled={pending}
                    aria-label={
                      confirmandoId === anexo.id ? "Confirmar eliminación de anexo" : "Eliminar anexo"
                    }
                    className={`absolute top-1 right-1 rounded-full px-1.5 py-0.5 text-xs text-white transition-opacity ${
                      confirmandoId === anexo.id
                        ? "bg-destructive opacity-100"
                        : "bg-black/60 opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    {confirmandoId === anexo.id ? "¿Seguro?" : "✕"}
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
                {pending ? "Subiendo..." : "Subir"}
              </Button>
            </div>
            <Input
              name="observaciones"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Observaciones (opcional)"
            />
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
