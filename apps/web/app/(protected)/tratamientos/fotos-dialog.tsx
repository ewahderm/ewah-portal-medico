"use client";

import { useState, useTransition } from "react";
import { DownloadIcon } from "lucide-react";
import {
  listarFotosTratamiento,
  crearRegistroFoto,
  completarFotoRegistro,
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

type Registro = {
  id: string;
  observaciones: string | null;
  storagePathAntes: string | null;
  storagePathDespues: string | null;
  urlAntes: string | null;
  urlDespues: string | null;
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
  /** Marca el botón cuando el tratamiento ya tiene al menos un registro de
   * fotos — para saberlo sin tener que abrir el diálogo. */
  tieneArchivos: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [etiqueta, setEtiqueta] = useState<string>("antes");
  // Controlado a propósito: React resetea los campos no controlados del
  // formulario en cuanto la acción resuelve, sin importar si tuvo éxito —
  // como handleCrear atrapa su propio error (para mostrarlo con el Alert
  // de abajo, en vez de dejar que el formulario "falle" crudo), React
  // nunca ve el rechazo y siempre resetea. Sin esto, un error de formato
  // de archivo borraba la observación ya escrita.
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cargar() {
    startTransition(async () => {
      const data = await listarFotosTratamiento(tratamientoId);
      setRegistros(data as Registro[]);
    });
  }

  function handleCrear(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await crearRegistroFoto(tratamientoId, etiqueta as "antes" | "despues", formData);
        setObservaciones("");
        cargar();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo subir la foto.");
      }
    });
  }

  function handleCompletar(registro: Registro, lado: "antes" | "despues", formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await completarFotoRegistro(registro.id, tratamientoId, lado, formData);
        cargar();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo subir la foto.");
      }
    });
  }

  function handleEliminar(registro: Registro) {
    if (confirmandoId !== registro.id) {
      setConfirmandoId(registro.id);
      return;
    }
    setConfirmandoId(null);
    setError(null);
    startTransition(async () => {
      try {
        await eliminarFotoTratamiento(registro.id);
        cargar();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo eliminar el registro.");
      }
    });
  }

  function handleDescargar(path: string) {
    startTransition(async () => {
      const url = await urlFirmadaFoto(path, true);
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

        <div className="space-y-3">
          {registros.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay fotos registradas.</p>
          ) : (
            registros.map((registro) => (
              <RegistroFotos
                key={registro.id}
                registro={registro}
                puedeSubir={puedeSubir}
                puedeEliminar={puedeEliminar}
                pending={pending}
                confirmando={confirmandoId === registro.id}
                onEliminar={() => handleEliminar(registro)}
                onBlurEliminar={() => setConfirmandoId(null)}
                onDescargar={handleDescargar}
                onCompletar={(lado, formData) => handleCompletar(registro, lado, formData)}
              />
            ))
          )}
        </div>

        {/* Un registro es un PAR: foto de antes + foto de después + una
            sola observación compartida. Se crea con la primera foto que se
            tenga a mano (el "antes" suele tomarse en la consulta inicial,
            el "después" en una posterior) y se completa más tarde desde el
            propio registro, en vez de exigir las dos fotos de una vez. */}
        {puedeSubir ? (
          <form action={handleCrear} className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium">Nuevo registro</p>
            <div className="space-y-2">
              <Label htmlFor="etiquetaFoto">Primera foto es de</Label>
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
                {pending ? "Subiendo..." : "Crear registro"}
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

function RegistroFotos({
  registro,
  puedeSubir,
  puedeEliminar,
  pending,
  confirmando,
  onEliminar,
  onBlurEliminar,
  onDescargar,
  onCompletar,
}: {
  registro: Registro;
  puedeSubir: boolean;
  puedeEliminar: boolean;
  pending: boolean;
  confirmando: boolean;
  onEliminar: () => void;
  onBlurEliminar: () => void;
  onDescargar: (path: string) => void;
  onCompletar: (lado: "antes" | "despues", formData: FormData) => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="grid grid-cols-2 gap-3">
        <SlotFoto
          titulo="Antes"
          url={registro.urlAntes}
          path={registro.storagePathAntes}
          puedeSubir={puedeSubir}
          pending={pending}
          onDescargar={onDescargar}
          onSubir={(formData) => onCompletar("antes", formData)}
        />
        <SlotFoto
          titulo="Después"
          url={registro.urlDespues}
          path={registro.storagePathDespues}
          puedeSubir={puedeSubir}
          pending={pending}
          onDescargar={onDescargar}
          onSubir={(formData) => onCompletar("despues", formData)}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="flex-1 text-xs text-muted-foreground">
          {registro.observaciones || "Sin observaciones."}
        </p>
        {puedeEliminar ? (
          <Button
            type="button"
            size="xs"
            variant={confirmando ? "destructive" : "ghost"}
            onClick={onEliminar}
            onBlur={onBlurEliminar}
            disabled={pending}
            className="shrink-0"
          >
            {confirmando ? "¿Eliminar registro?" : "Eliminar"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function SlotFoto({
  titulo,
  url,
  path,
  puedeSubir,
  pending,
  onDescargar,
  onSubir,
}: {
  titulo: string;
  url: string | null;
  path: string | null;
  puedeSubir: boolean;
  pending: boolean;
  onDescargar: (path: string) => void;
  onSubir: (formData: FormData) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{titulo}</Label>
      {url && path ? (
        <div className="group relative">
          <a href={url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={titulo}
              className="aspect-square w-full rounded-lg object-cover"
            />
          </a>
          <button
            type="button"
            onClick={() => onDescargar(path)}
            disabled={pending}
            aria-label={`Descargar foto de ${titulo.toLowerCase()}`}
            title="Descargar"
            className="absolute bottom-1 left-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
          >
            <DownloadIcon className="size-3" />
          </button>
        </div>
      ) : puedeSubir ? (
        <form
          action={onSubir}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-2 text-center"
        >
          <input
            type="file"
            name="foto"
            accept="image/jpeg,image/png,image/webp"
            className="w-full text-[10px]"
            required
          />
          <Button type="submit" size="xs" variant="outline" disabled={pending}>
            Agregar
          </Button>
        </form>
      ) : (
        <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
          Sin foto
        </div>
      )}
    </div>
  );
}
