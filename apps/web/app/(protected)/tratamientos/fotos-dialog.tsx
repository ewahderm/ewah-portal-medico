"use client";

import { useState, useTransition } from "react";
import { DownloadIcon } from "lucide-react";
import {
  listarFotosTratamiento,
  subirFotoTratamiento,
  eliminarFotoTratamiento,
  urlFirmadaFoto,
} from "@/lib/tratamientos/actions";
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

type Foto = {
  id: string;
  storage_path: string;
  etiqueta: "antes" | "despues";
  observaciones: string | null;
  url: string | null;
};

const ITEMS_ETIQUETA = [
  { value: "antes", label: "Antes" },
  { value: "despues", label: "Después" },
];

export function FotosDialog({
  tratamientoId,
  puedeSubir,
  puedeEliminar,
  tieneArchivos,
}: {
  tratamientoId: string;
  puedeSubir: boolean;
  puedeEliminar: boolean;
  /** Marca el botón cuando el tratamiento ya tiene al menos una foto —
   * para saberlo sin tener que abrir el diálogo. */
  tieneArchivos: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [etiqueta, setEtiqueta] = useState<string>("antes");
  // Controlado a propósito: React resetea los campos no controlados del
  // formulario en cuanto la acción resuelve, sin importar si tuvo éxito
  // — como handleSubir atrapa su propio error (para poder mostrarlo con
  // el Alert de abajo, en vez de dejar que el formulario "falle" crudo),
  // React nunca ve el rechazo y siempre resetea. Sin esto, un error de
  // formato de archivo borraba la observación ya escrita.
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cargar() {
    startTransition(async () => {
      const data = await listarFotosTratamiento(tratamientoId);
      setFotos(data as Foto[]);
    });
  }

  function handleSubir(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await subirFotoTratamiento(tratamientoId, etiqueta as "antes" | "despues", formData);
        setObservaciones("");
        cargar();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo subir la foto.");
      }
    });
  }

  function handleEliminar(foto: Foto) {
    if (confirmandoId !== foto.id) {
      setConfirmandoId(foto.id);
      return;
    }
    setConfirmandoId(null);
    setError(null);
    startTransition(async () => {
      try {
        await eliminarFotoTratamiento(foto.id, foto.storage_path);
        cargar();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo eliminar la foto.");
      }
    });
  }

  function handleDescargar(foto: Foto) {
    startTransition(async () => {
      const url = await urlFirmadaFoto(foto.storage_path, true);
      if (url) window.open(url, "_blank");
    });
  }

  const antes = fotos.filter((f) => f.etiqueta === "antes");
  const despues = fotos.filter((f) => f.etiqueta === "despues");

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
            Fotos
            {tieneArchivos ? (
              <>
                <span
                  aria-hidden
                  title="Ya tiene fotos"
                  className="absolute -top-1 -right-1 size-2 rounded-full bg-primary"
                />
                <span className="sr-only"> (ya tiene fotos)</span>
              </>
            ) : null}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fotos antes / después</DialogTitle>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid grid-cols-2 gap-6">
          <FotoColumna
            titulo="Antes"
            fotos={antes}
            puedeEliminar={puedeEliminar}
            pending={pending}
            confirmandoId={confirmandoId}
            onEliminar={handleEliminar}
            onDescargar={handleDescargar}
            onBlurEliminar={() => setConfirmandoId(null)}
          />
          <FotoColumna
            titulo="Después"
            fotos={despues}
            puedeEliminar={puedeEliminar}
            pending={pending}
            confirmandoId={confirmandoId}
            onEliminar={handleEliminar}
            onDescargar={handleDescargar}
            onBlurEliminar={() => setConfirmandoId(null)}
          />
        </div>

        {/* Una sola foto por vez: un archivo, una observación, una
            etiqueta — antes había un formulario completo por columna, con
            su propio campo de observaciones cada uno, lo que mostraba dos
            campos a la vez para lo que en la práctica es una sola acción. */}
        {puedeSubir ? (
          <form action={handleSubir} className="space-y-3 border-t pt-4">
            <div className="space-y-2">
              <Label htmlFor="etiquetaFoto">Es una foto de</Label>
              <Combobox
                id="etiquetaFoto"
                items={ITEMS_ETIQUETA}
                value={etiqueta}
                onValueChange={(v) => setEtiqueta(String(v ?? "antes"))}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="file"
                name="foto"
                accept="image/jpeg,image/png,image/webp"
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
              placeholder="Zona y perspectiva (ej: rostro, perfil derecho)"
            />
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function FotoColumna({
  titulo,
  fotos,
  puedeEliminar,
  pending,
  confirmandoId,
  onEliminar,
  onDescargar,
  onBlurEliminar,
}: {
  titulo: string;
  fotos: Foto[];
  puedeEliminar: boolean;
  pending: boolean;
  confirmandoId: string | null;
  onEliminar: (foto: Foto) => void;
  onDescargar: (foto: Foto) => void;
  onBlurEliminar: () => void;
}) {
  return (
    <div className="space-y-3">
      <Label>{titulo}</Label>

      <div className="grid grid-cols-2 gap-2">
        {fotos.map((foto) =>
          foto.url ? (
            <div key={foto.id} className="space-y-1">
              <div className="group relative">
                <a href={foto.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={foto.url}
                    alt={foto.observaciones ?? titulo}
                    className="aspect-square w-full rounded-lg object-cover"
                  />
                </a>
                <button
                  type="button"
                  onClick={() => onDescargar(foto)}
                  disabled={pending}
                  aria-label="Descargar foto"
                  title="Descargar"
                  className="absolute bottom-1 left-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <DownloadIcon className="size-3" />
                </button>
                {puedeEliminar ? (
                  <button
                    type="button"
                    onClick={() => onEliminar(foto)}
                    onBlur={onBlurEliminar}
                    disabled={pending}
                    aria-label={
                      confirmandoId === foto.id ? "Confirmar eliminación de foto" : "Eliminar foto"
                    }
                    className={`absolute top-1 right-1 rounded-full px-1.5 py-0.5 text-xs text-white transition-opacity ${
                      confirmandoId === foto.id
                        ? "bg-destructive opacity-100"
                        : "bg-black/60 opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    {confirmandoId === foto.id ? "¿Seguro?" : "✕"}
                  </button>
                ) : null}
              </div>
              {foto.observaciones ? (
                <p className="text-xs text-muted-foreground">{foto.observaciones}</p>
              ) : null}
            </div>
          ) : null,
        )}
        {fotos.length === 0 ? (
          <p className="col-span-2 text-center text-sm text-muted-foreground">
            Todavía no hay fotos de {titulo.toLowerCase()}.
          </p>
        ) : null}
      </div>
    </div>
  );
}
