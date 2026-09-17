"use client";

import { useState, useTransition } from "react";
import {
  listarFotosTratamiento,
  subirFotoTratamiento,
  eliminarFotoTratamiento,
} from "@/lib/tratamientos/actions";
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

type Foto = {
  id: string;
  storage_path: string;
  etiqueta: "antes" | "despues";
  url: string | null;
};

export function FotosDialog({
  tratamientoId,
  puedeSubir,
  puedeEliminar,
}: {
  tratamientoId: string;
  puedeSubir: boolean;
  puedeEliminar: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cargar() {
    startTransition(async () => {
      const data = await listarFotosTratamiento(tratamientoId);
      setFotos(data as Foto[]);
    });
  }

  function handleSubir(etiqueta: "antes" | "despues", formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await subirFotoTratamiento(tratamientoId, etiqueta, formData);
        cargar();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo subir la foto.");
      }
    });
  }

  function handleEliminar(id: string, storagePath: string) {
    setError(null);
    startTransition(async () => {
      try {
        await eliminarFotoTratamiento(id, storagePath);
        cargar();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo eliminar la foto.");
      }
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
          <Button variant="outline" size="sm">
            Fotos
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
            puedeSubir={puedeSubir}
            puedeEliminar={puedeEliminar}
            pending={pending}
            onSubir={(formData) => handleSubir("antes", formData)}
            onEliminar={handleEliminar}
          />
          <FotoColumna
            titulo="Después"
            fotos={despues}
            puedeSubir={puedeSubir}
            puedeEliminar={puedeEliminar}
            pending={pending}
            onSubir={(formData) => handleSubir("despues", formData)}
            onEliminar={handleEliminar}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FotoColumna({
  titulo,
  fotos,
  puedeSubir,
  puedeEliminar,
  pending,
  onSubir,
  onEliminar,
}: {
  titulo: string;
  fotos: Foto[];
  puedeSubir: boolean;
  puedeEliminar: boolean;
  pending: boolean;
  onSubir: (formData: FormData) => void;
  onEliminar: (id: string, storagePath: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Label>{titulo}</Label>

      <div className="grid grid-cols-2 gap-2">
        {fotos.map((foto) =>
          foto.url ? (
            <div key={foto.id} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={foto.url}
                alt={titulo}
                className="aspect-square w-full rounded-lg object-cover"
              />
              {puedeEliminar ? (
                <button
                  type="button"
                  onClick={() => onEliminar(foto.id, foto.storage_path)}
                  disabled={pending}
                  className="absolute top-1 right-1 rounded-full bg-black/60 px-1.5 py-0.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  ✕
                </button>
              ) : null}
            </div>
          ) : null,
        )}
      </div>

      {puedeSubir ? (
        <form
          action={(formData) => onSubir(formData)}
          className="flex items-center gap-2"
        >
          <input
            type="file"
            name="foto"
            accept="image/jpeg,image/png,image/webp"
            className="text-xs"
            required
          />
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            Subir
          </Button>
        </form>
      ) : null}
    </div>
  );
}
