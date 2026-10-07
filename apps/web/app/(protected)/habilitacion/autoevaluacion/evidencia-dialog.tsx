"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { agregarEvidencia } from "@/lib/habilitacion/autoevaluacion";
import { subirArchivoHabilitacion } from "@/lib/habilitacion/subida-cliente";
import { ACCEPT_ARCHIVO, FORMATOS_ARCHIVO, MAX_OBSERVACION } from "@/lib/habilitacion/constantes";
import type { FilaCriterio } from "@/lib/habilitacion/tipos";
import { toast } from "@/components/ui/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TarjetasRadio } from "../_components/opciones-tarjeta";

const TIPOS = [
  { value: "archivo", label: "Archivo", ayuda: "Un PDF, foto o documento que lo demuestra." },
  { value: "nota", label: "Nota", ayuda: "Lo verificaste en sitio: describe qué viste." },
  { value: "enlace", label: "Enlace", ayuda: "Un documento en línea (https://)." },
] as const;

// Evidencia de un criterio (HU-4.2 AC2). Con `marcarCumple` es el paso
// previo del botón Cumple: la evidencia y la evaluación se guardan juntas.
export function EvidenciaDialog({
  sedeId,
  fila,
  marcarCumple,
  onCerrar,
}: {
  sedeId: string;
  fila: FilaCriterio;
  marcarCumple: boolean;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<string>("archivo");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);
  const [paso, setPaso] = useState<string | null>(null);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    setPendiente(true);
    try {
      if (tipo === "archivo") {
        const archivo = fd.get("archivo");
        if (!(archivo instanceof File) || archivo.size === 0) {
          setError("Selecciona un archivo.");
          return;
        }
        setPaso("Subiendo el archivo…");
        const subido = await subirArchivoHabilitacion(archivo, "evidencias", fila.criterio_id);
        if ("error" in subido) {
          setError(subido.error);
          return;
        }
        fd.set("storagePath", subido.path);
        fd.set("nombreArchivo", subido.nombre);
      }
      fd.delete("archivo");
      setPaso("Guardando…");
      const r = await agregarEvidencia(null, fd);
      if (r.error) {
        setError(r.error);
        return;
      }
      toast.add({ title: marcarCumple ? `${fila.codigo}: Cumple` : "Evidencia agregada", type: "success" });
      router.refresh();
      onCerrar();
    } finally {
      setPendiente(false);
      setPaso(null);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pendiente && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{marcarCumple ? `Para marcar «Cumple» en ${fila.codigo}, agrega la evidencia` : `Evidencia de ${fila.codigo}`}</DialogTitle>
          <DialogDescription className="line-clamp-4">{fila.texto_literal}</DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-4">
          <input type="hidden" name="sedeId" value={sedeId} />
          <input type="hidden" name="criterioId" value={fila.criterio_id} />
          <input type="hidden" name="tipo" value={tipo} />
          {marcarCumple ? <input type="hidden" name="marcarCumple" value="1" /> : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <TarjetasRadio legend="Tipo de evidencia" name="tipoEvidencia" columnas={3} valor={tipo} onCambio={setTipo} opciones={TIPOS} />

          {tipo === "archivo" ? (
            <div className="space-y-1">
              <Label htmlFor="archivo">Archivo</Label>
              <FileInput id="archivo" name="archivo" accept={ACCEPT_ARCHIVO} required />
              <p className="text-xs text-muted-foreground">{FORMATOS_ARCHIVO}. Máximo 10 MB.</p>
            </div>
          ) : null}
          {tipo === "enlace" ? (
            <div className="space-y-1">
              <Label htmlFor="url">Enlace</Label>
              <Input id="url" name="url" type="url" inputMode="url" placeholder="https://" required pattern="https://.*" maxLength={2000} />
            </div>
          ) : null}

          <div className="space-y-1">
            <Label htmlFor="descripcion">{tipo === "nota" ? "Qué verificaste" : "Qué es y qué demuestra"}</Label>
            <Textarea
              id="descripcion"
              name="descripcion"
              required
              minLength={3}
              maxLength={MAX_OBSERVACION}
              rows={3}
              placeholder={
                tipo === "nota"
                  ? "Ej.: Revisé en sitio el carro de paro: completo según el listado del protocolo, 6-oct-2026."
                  : "Ej.: Tarjeta profesional de la Dra. Pérez, vigente."
              }
            />
          </div>

          {marcarCumple ? (
            <div className="space-y-1">
              <Label htmlFor="observacion">Observación de la evaluación (opcional)</Label>
              <Textarea id="observacion" name="observacion" rows={2} maxLength={MAX_OBSERVACION} />
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onCerrar} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente}>
              {pendiente ? (paso ?? "Guardando…") : marcarCumple ? "Guardar y marcar «Cumple»" : "Agregar evidencia"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
